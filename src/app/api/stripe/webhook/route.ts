import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import {
  accountHolderNameMatchesVerifiedIdentity,
  verifiedIdentityProfile,
} from "@/lib/stripe-identity";
import {
  expectedDobMatch,
  providerIdentityVerdict,
  requireVerifiedIdentityGate,
  verifiedIdentityProfileComplete,
  type StripeIdentityEventType,
} from "@/lib/identity-verdict";
import {
  archiveIdentityOriginals,
  discardIdentityOriginalArchive,
  identityArchiveComplete,
  type ArchiveOutcome,
} from "@/lib/identity-originals";
import {
  configuredStripeLivemode,
  getStripeForLivemode,
} from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray } from "@/lib/passengers";
import { isOperationalMode } from "@/lib/operational-mode";

export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

type StripeWebhookCandidate = {
  livemode: boolean;
  stripe: Stripe;
  secret: string;
  source: string;
};

function unexpiredPreviousSecret(prefix: "STRIPE_TEST" | "STRIPE_LIVE") {
  const secret = process.env[`${prefix}_WEBHOOK_SECRET_PREVIOUS`]?.trim();
  const expiresAt = Date.parse(
    process.env[`${prefix}_WEBHOOK_SECRET_PREVIOUS_EXPIRES_AT`] ?? "",
  );
  return secret && Number.isFinite(expiresAt) && Date.now() < expiresAt
    ? secret
    : null;
}

function stripeWebhookCandidates(): StripeWebhookCandidate[] {
  const candidates: StripeWebhookCandidate[] = [];
  for (const livemode of [false, true]) {
    const stripe = getStripeForLivemode(livemode);
    if (!stripe) continue;
    const prefix = livemode ? "STRIPE_LIVE" : "STRIPE_TEST";
    const current = process.env[`${prefix}_WEBHOOK_SECRET`]?.trim();
    if (current) {
      candidates.push({ livemode, stripe, secret: current, source: prefix });
    }
    const previous = unexpiredPreviousSecret(prefix);
    if (previous) {
      candidates.push({ livemode, stripe, secret: previous, source: `${prefix}_PREVIOUS` });
    }
  }

  // Transitional compatibility: the original shared secret is accepted only
  // when the active generic Stripe key has a provable test/live mode, binding
  // the secret to that one client. New deployments should use the two
  // mode-specific webhook secrets above.
  const genericSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const genericLivemode = configuredStripeLivemode();
  const hasModeSpecificSecret = genericLivemode !== null && candidates.some(
    (candidate) =>
      candidate.livemode === genericLivemode &&
      !candidate.source.includes("LEGACY"),
  );
  if (genericSecret && genericLivemode !== null && !hasModeSpecificSecret) {
    const stripe = getStripeForLivemode(genericLivemode);
    if (stripe) {
      candidates.push({
        livemode: genericLivemode,
        stripe,
        secret: genericSecret,
        source: "STRIPE_WEBHOOK_SECRET_LEGACY",
      });
      const previousSecret = process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS?.trim();
      const previousSecretExpiresAt = Date.parse(
        process.env.STRIPE_WEBHOOK_SECRET_PREVIOUS_EXPIRES_AT ?? "",
      );
      if (
        previousSecret &&
        Number.isFinite(previousSecretExpiresAt) &&
        Date.now() < previousSecretExpiresAt
      ) {
        candidates.push({
          livemode: genericLivemode,
          stripe,
          secret: previousSecret,
          source: "STRIPE_WEBHOOK_SECRET_PREVIOUS_LEGACY",
        });
      }
    }
  }
  return candidates;
}

async function reconcileIdentityRedaction(
  session: Stripe.Identity.VerificationSession,
  eventId: string,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Identity redaction reconciliation is not configured.");
  const { data: reconciled, error } = await supabase.rpc(
    "reconcile_identity_provider_redaction",
    { p_provider_session_id: session.id, p_event_id: eventId },
  );
  if (error || reconciled !== true) {
    throw error || new Error("Identity redaction event could not be reconciled.");
  }
}

type BoundFinanceContext = {
  bookingId: string;
  operationalMode: "rehearsal" | "live";
  paymentIntentId: string;
  stripeLivemode: boolean;
};

function stripeObjectId(
  value: string | { id: string } | null | undefined,
) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function requireBoundFinanceContext(input: {
  objectLabel: "refund" | "dispute";
  objectLivemode?: boolean;
  verifiedWebhookLivemode: boolean;
  paymentIntentId: string | null;
  bookingIdHint?: string | null;
}): Promise<BoundFinanceContext | null> {
  if (
    typeof input.objectLivemode === "boolean" &&
    input.objectLivemode !== input.verifiedWebhookLivemode
  ) {
    throw new Error(`Stripe ${input.objectLabel} mode mismatch.`);
  }
  if (!input.paymentIntentId) {
    console.error(`Ignoring Stripe ${input.objectLabel} without a PaymentIntent binding.`);
    return null;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: checkout, error: checkoutError } = await supabase
    .from("booking_checkout_sessions")
    .select("booking_id, stripe_payment_intent_id, operational_mode, stripe_livemode, status")
    .eq("stripe_payment_intent_id", input.paymentIntentId)
    .maybeSingle<{
      booking_id: string;
      stripe_payment_intent_id: string | null;
      operational_mode: string | null;
      stripe_livemode: boolean | null;
      status: string;
    }>();
  if (checkoutError) throw checkoutError;
  if (!checkout) {
    console.error(`Ignoring unbound Stripe ${input.objectLabel}.`, {
      paymentIntentId: input.paymentIntentId,
      livemode: input.verifiedWebhookLivemode,
    });
    return null;
  }
  if (input.bookingIdHint && input.bookingIdHint !== checkout.booking_id) {
    throw new Error(`Stripe ${input.objectLabel} booking metadata mismatch.`);
  }
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, operational_mode")
    .eq("id", checkout.booking_id)
    .maybeSingle<{ id: string; operational_mode: string | null }>();
  if (bookingError) throw bookingError;
  if (!booking || !isOperationalMode(booking.operational_mode)) {
    throw new Error(`Stripe ${input.objectLabel} booking is not mode-classified.`);
  }
  const expectedLivemode = booking.operational_mode === "live";
  if (
    checkout.stripe_payment_intent_id !== input.paymentIntentId ||
    checkout.operational_mode !== booking.operational_mode ||
    checkout.stripe_livemode !== input.verifiedWebhookLivemode ||
    input.verifiedWebhookLivemode !== expectedLivemode ||
    !["open", "capture_authorized", "paid", "manual_review"].includes(checkout.status)
  ) {
    throw new Error(
      `Stripe ${input.objectLabel} does not match the booking's exact payment and operating-mode binding.`,
    );
  }
  return {
    bookingId: booking.id,
    operationalMode: booking.operational_mode,
    paymentIntentId: input.paymentIntentId,
    stripeLivemode: input.verifiedWebhookLivemode,
  };
}

async function blockReversedPayment(
  context: BoundFinanceContext,
  reason: string,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: checkout, error: checkoutError } = await supabase
    .from("booking_checkout_sessions")
    .update({
      status: "manual_review",
      claim_token: null,
      claimed_at: null,
      last_error: reason,
    })
    .eq("booking_id", context.bookingId)
    .eq("stripe_payment_intent_id", context.paymentIntentId)
    .eq("operational_mode", context.operationalMode)
    .eq("stripe_livemode", context.stripeLivemode)
    .in("status", ["open", "capture_authorized", "paid", "manual_review"])
    .select("booking_id")
    .maybeSingle<{ booking_id: string }>();
  if (checkoutError) throw checkoutError;
  if (!checkout) {
    throw new Error("The exact Stripe payment binding changed before it could be blocked.");
  }
  const { error: approvalError } = await supabase
    .from("bookings")
    .update({
      pilot_eligibility_status: "expired",
      pilot_eligibility_expires_at: null,
      pilot_eligibility_reason: reason,
    })
    .eq("id", context.bookingId)
    .eq("operational_mode", context.operationalMode);
  if (approvalError) throw approvalError;
}

async function reconcileRefund(
  refund: Stripe.Refund,
  eventId: string,
  livemode: boolean,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const context = await requireBoundFinanceContext({
    objectLabel: "refund",
    verifiedWebhookLivemode: livemode,
    paymentIntentId: stripeObjectId(refund.payment_intent),
    bookingIdHint: refund.metadata?.bookingId,
  });
  if (!context) return;
  const refundSucceeded = refund.status === "succeeded";
  const refundFailed = refund.status === "failed" || refund.status === "canceled";
  await blockReversedPayment(
    context,
    `Stripe refund ${refund.id} is ${refund.status || "pending"}; payment and custody require financial reconciliation.`,
  );
  const query = supabase.from("booking_financial_events").update({
    kind: refundSucceeded
      ? "refund_succeeded"
      : refundFailed
        ? "refund_failed"
        : "refund_requested",
    status: refundSucceeded ? "succeeded" : refundFailed ? "failed" : "manual_review",
    stripe_refund_id: refund.id,
  })
    .eq("booking_id", context.bookingId)
    .eq("stripe_refund_id", refund.id);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (data?.length) return;
  // Stripe can deliver before our request response. Store a durable event so
  // operations has a reconciliation record rather than silently dropping it.
  const { error: insertError } = await supabase.from("booking_financial_events").insert({
    booking_id: context.bookingId,
    kind: refundSucceeded
      ? "refund_succeeded"
      : refundFailed
        ? "refund_failed"
        : "refund_requested",
    amount_cents: refund.amount, currency: refund.currency, reason: "Stripe refund webhook reconciliation.",
    idempotency_key: `stripe:${eventId}`, stripe_refund_id: refund.id,
    status: refundSucceeded ? "succeeded" : refundFailed ? "failed" : "manual_review",
    requested_by: "stripe_webhook",
  });
  if (insertError && !/duplicate|unique/i.test(insertError.message)) throw insertError;
}

async function reconcileDispute(dispute: Stripe.Dispute, eventId: string, livemode: boolean) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const context = await requireBoundFinanceContext({
    objectLabel: "dispute",
    objectLivemode: dispute.livemode,
    verifiedWebhookLivemode: livemode,
    paymentIntentId: stripeObjectId(dispute.payment_intent),
    bookingIdHint: dispute.metadata?.bookingId,
  });
  if (!context) return;
  await blockReversedPayment(
    context,
    `Stripe dispute ${dispute.id} is open; payment and custody require financial reconciliation.`,
  );
  const { error } = await supabase.from("booking_financial_events").insert({
    booking_id: context.bookingId, kind: "manual_adjustment", amount_cents: dispute.amount,
    currency: dispute.currency, reason: `Stripe dispute opened: ${dispute.reason}.`,
    idempotency_key: `stripe:${eventId}`, status: "manual_review", requested_by: "stripe_webhook",
  });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}

async function reconcileCapturablePayment(
  paymentIntent: Stripe.PaymentIntent,
  stripe: Stripe,
  livemode: boolean,
) {
  if (paymentIntent.livemode !== livemode) {
    throw new Error("Stripe capturable-payment mode mismatch.");
  }
  const bookingId = paymentIntent.metadata?.bookingId;
  if (!bookingId) return { ok: false as const, reason: "not-paid" as const };
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Payment reconciliation is not configured.");
  const { data: checkout, error } = await supabase
    .from("booking_checkout_sessions")
    .select("stripe_checkout_session_id")
    .eq("booking_id", bookingId)
    .maybeSingle<{ stripe_checkout_session_id: string | null }>();
  if (error) throw error;
  if (!checkout?.stripe_checkout_session_id) {
    return { ok: false as const, reason: "checkout-session-mismatch" as const };
  }
  const session = await stripe.checkout.sessions.retrieve(
    checkout.stripe_checkout_session_id,
  );
  if (session.livemode !== livemode) {
    throw new Error("Stripe Checkout Session mode mismatch.");
  }
  return markBookingPaidFromCheckoutSession(session, stripe);
}

async function reconcileIdentity(
  eventSession: Stripe.Identity.VerificationSession,
  eventId: string,
  eventCreated: number,
  stripe: Stripe,
  livemode: boolean,
) {
  if (eventSession.livemode !== livemode) {
    throw new Error("Stripe Identity event mode mismatch.");
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Identity reconciliation is not configured.");

  const session = await stripe.identity.verificationSessions.retrieve(eventSession.id, {
    expand: ["last_verification_report"],
  });
  if (session.livemode !== livemode) {
    throw new Error("Stripe Identity session mode mismatch.");
  }
  const { data: record, error: recordError } = await supabase
    .from("identity_verifications")
    .select("id, user_id, booking_id, passenger_id, subject_name, email, status, verified_at, metadata, raw_purpose_ended_at, raw_destroyed_at, raw_deletion_status")
    .eq("provider_session_id", session.id)
    .maybeSingle<{
      id: string;
      user_id: string | null;
      booking_id: string | null;
      passenger_id: string | null;
      subject_name: string | null;
      email: string | null;
      status: string;
      verified_at: string | null;
      metadata: Record<string, unknown> | null;
      raw_purpose_ended_at: string | null;
      raw_destroyed_at: string | null;
      raw_deletion_status: string;
    }>();
  if (recordError) throw recordError;
  if (!record) return;

  const destructionStarted = Boolean(
    record.raw_purpose_ended_at ||
    record.raw_destroyed_at ||
    record.raw_deletion_status === "destroyed" ||
    record.metadata?.raw_destruction_started_at,
  );
  if (destructionStarted) {
    const { error: blockedUpdateError } = await supabase
      .from("identity_verifications")
      .update({
        status: "manual_review",
        liveness_status: "manual_review",
        verified_at: null,
        metadata: {
          ...(record.metadata ?? {}),
          ignored_provider_event_after_destruction: eventId,
          ignored_provider_event_at: new Date().toISOString(),
        },
      })
      .eq("id", record.id);
    if (blockedUpdateError) throw blockedUpdateError;
    return;
  }

  const now = new Date().toISOString();
  const verifiedProfile = verifiedIdentityProfile(session);
  const profileComplete = verifiedIdentityProfileComplete(verifiedProfile);
  const dob = verifiedProfile.dateOfBirth;
  const currentProviderEvent: StripeIdentityEventType | null =
    session.status === "verified"
      ? "identity.verification_session.verified"
      : session.status === "requires_input"
        ? "identity.verification_session.requires_input"
        : session.status === "canceled"
          ? "identity.verification_session.canceled"
          : null;
  if (!currentProviderEvent) return;
  let verdict = providerIdentityVerdict(currentProviderEvent);

  let expectedDob: string | undefined;
  let expectedName: string | undefined;
  let manifest: unknown;
  if (record.booking_id && record.passenger_id) {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("passenger_manifest")
      .eq("id", record.booking_id)
      .maybeSingle<{ passenger_manifest: unknown }>();
    if (bookingError) throw bookingError;
    manifest = booking?.passenger_manifest;
    if (isBookingPassengerArray(manifest)) {
      const passenger = manifest.find((candidate) => candidate.id === record.passenger_id);
      expectedDob = passenger?.dateOfBirth;
      expectedName = passenger
        ? `${passenger.firstName} ${passenger.lastName}`.trim()
        : record.subject_name ?? undefined;
    }
  }
  const dobMatches = expectedDobMatch(expectedDob, dob);
  const nameMatches = expectedName
    ? accountHolderNameMatchesVerifiedIdentity({
        accountHolderName: expectedName,
        verifiedFirstName: verifiedProfile.firstName,
        verifiedLastName: verifiedProfile.lastName,
      })
    : true;
  // Keep Travelyt's own copies of the capture originals once verified —
  // Stripe alone holding the images is not acceptable for chain of custody.
  let archive: ArchiveOutcome | null = null;
  let archiveError: string | null = null;
  if (verdict.status === "verified") {
    try {
      archive = await archiveIdentityOriginals({
        stripe,
        supabase,
        verificationId: record.id,
        session,
      });
    } catch (error) {
      archiveError = error instanceof Error ? error.message : "Unknown archive failure.";
      console.error("Identity original archive failed", error);
    }
  }
  const archived = identityArchiveComplete(archive);
  verdict = requireVerifiedIdentityGate(
    verdict,
    profileComplete && dobMatches !== false && nameMatches && archived,
  );

  // The freshly retrieved provider session is authoritative. Never let a late
  // requires-input/canceled event regress an identity Travelyt already sealed
  // as verified with a complete private archive.
  if (record.status === "verified" && verdict.status !== "verified") return;

  const { data: updatedRecord, error: updateError } = await supabase
    .from("identity_verifications")
    .update({
      status: verdict.status,
      liveness_status: verdict.livenessStatus,
      verified_at: verdict.status === "verified" ? now : null,
      ...(archive && archived
        ? {
            raw_document_paths: archive.paths,
            raw_stored_at: archive.storedAt,
            raw_retention_until: archive.retentionUntil,
            raw_export_status: "pending_ash",
            raw_deletion_status: "scheduled",
          }
        : {}),
      ...(archive
        ? {
            raw_archive_claim_token: null,
            raw_archive_claimed_at: null,
          }
        : {}),
      metadata: {
        ...(record.metadata ?? {}),
        stripe_status: session.status,
        stripe_livemode: session.livemode,
        verified_dob: dob,
        verified_first_name: verifiedProfile.firstName,
        verified_last_name: verifiedProfile.lastName,
        verified_profile_complete: profileComplete,
        expected_dob_match: dobMatches,
        expected_name_match: nameMatches,
        provider_error_code: session.last_error?.code ?? null,
        raw_document_stored_by_travelyt: archived,
        archive_required_before_custody: true,
        ...(archiveError ? { raw_archive_error: archiveError } : {}),
        stripe_event_id: eventId,
        stripe_event_created_at: new Date(eventCreated * 1000).toISOString(),
        stripe_event_type_reconciled: currentProviderEvent,
        reconciled_at: now,
      },
    })
    .eq("id", record.id)
    .is("raw_purpose_ended_at", null)
    .is("raw_destroyed_at", null)
    .neq("raw_deletion_status", "destroyed")
    .match(archive ? { raw_archive_claim_token: archive.claimToken } : {})
    .select("id")
    .maybeSingle<{ id: string }>();
  if (updateError || !updatedRecord) {
    if (archive) {
      const discarded = await discardIdentityOriginalArchive({
        supabase,
        verificationId: record.id,
        claimToken: archive.claimToken,
        paths: archive.paths,
        reason:
          updateError?.message ||
          "Identity webhook archive lost its final database compare-and-set.",
      });
      if (!discarded.ok) {
        console.error("Orphaned identity archive cleanup failed", discarded.error);
      }
    } else if (updateError) {
      throw updateError;
    }
    if (updateError) console.error("Identity webhook archive finalization failed", updateError);
    return;
  }

  if (verdict.status === "verified" && record.booking_id && record.passenger_id && isBookingPassengerArray(manifest)) {
    const updatedManifest = manifest.map((passenger) =>
      passenger.id === record.passenger_id
        ? { ...passenger, identityVerifiedAt: now, verificationStatus: "verified" as const }
        : passenger
    );
    const { error: manifestError } = await supabase
      .from("bookings")
      .update({ passenger_manifest: updatedManifest })
      .eq("id", record.booking_id);
    if (manifestError) throw manifestError;
  }

  if (verdict.status === "verified" && record.user_id && !record.booking_id && !record.passenger_id) {
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, customer_name, email, passenger_manifest")
      .eq("customer_user_id", record.user_id)
      .is("customer_identity_verified_at", null)
      .returns<Array<{ id: string; customer_name: string; email: string; passenger_manifest: unknown }>>();
    if (bookingsError) throw bookingsError;
    for (const booking of bookings ?? []) {
      const emailMatches = Boolean(
        record.email && booking.email.trim().toLowerCase() === record.email.trim().toLowerCase()
      );
      const nameMatches = accountHolderNameMatchesVerifiedIdentity({
        accountHolderName: booking.customer_name,
        verifiedFirstName: verifiedProfile.firstName,
        verifiedLastName: verifiedProfile.lastName,
      });
      if (!emailMatches || !nameMatches || !verifiedProfile.dateOfBirth) continue;
      const passengerManifest = isBookingPassengerArray(booking.passenger_manifest)
        ? booking.passenger_manifest.map((passenger) =>
            passenger.category === "account_holder"
              ? {
                  ...passenger,
                  firstName: verifiedProfile.firstName || passenger.firstName,
                  lastName: verifiedProfile.lastName || passenger.lastName,
                  email: record.email || passenger.email,
                  dateOfBirth: verifiedProfile.dateOfBirth,
                  identityVerifiedAt: now,
                  verificationStatus: "verified" as const,
                }
              : passenger
          )
        : booking.passenger_manifest;
      const { error: bookingUpdateError } = await supabase
        .from("bookings")
        .update({
          customer_identity_verified_at: now,
          passenger_manifest: passengerManifest,
        })
        .eq("id", booking.id);
      if (bookingUpdateError) throw bookingUpdateError;
    }
  }
}

export async function POST(request: Request) {
  const candidates = stripeWebhookCandidates();
  if (candidates.length === 0) {
    return json({ ok: false, error: "Stripe webhook is not configured." }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ ok: false, error: "Missing Stripe signature." }, 400);

  let event: Stripe.Event | null = null;
  let verifiedCandidate: StripeWebhookCandidate | null = null;
  const rawBody = await request.text();
  let signatureError: unknown;
  for (const candidate of candidates) {
    try {
      const candidateEvent = candidate.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        candidate.secret,
      );
      if (candidateEvent.livemode !== candidate.livemode) {
        signatureError = new Error(
          `Stripe event mode did not match ${candidate.source}.`,
        );
        continue;
      }
      event = candidateEvent;
      verifiedCandidate = candidate;
      break;
    } catch (error) {
      signatureError = error;
    }
  }
  if (!event || !verifiedCandidate) {
    console.error("Stripe webhook signature verification failed", signatureError);
    return json({ ok: false, error: "Invalid Stripe signature." }, 400);
  }
  const stripe = verifiedCandidate.stripe;
  const webhookLivemode = verifiedCandidate.livemode;

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const result = await markBookingPaidFromCheckoutSession(
        event.data.object as Stripe.Checkout.Session,
        stripe,
      );
      if (!result.ok && result.reason === "payment-mismatch") {
        throw new Error("Stripe payment details do not match the booking.");
      }
      if (!result.ok && result.reason === "checkout-session-mismatch") {
        console.error("Stripe Checkout Session was routed to manual review", {
          eventId: event.id,
        });
      }
      if (!result.ok && result.reason === "payment-mode-mismatch") {
        console.error("Stripe Checkout Session operating mode mismatch", {
          eventId: event.id,
        });
      }
      if (!result.ok && (
        result.reason === "operations-paused" ||
        result.reason === "legacy-automatic-capture" ||
        result.reason === "identity-invalid-at-payment" ||
        result.reason === "capture-not-authorized"
      )) {
        console.error("Stripe Checkout Session remained blocked", {
          eventId: event.id,
          reason: result.reason,
        });
      }
      if (!result.ok && result.reason === "capture-finalization-refund-pending") {
        throw new Error("Captured Stripe payment did not finalize and its compensating refund remains unresolved.");
      }
      if (!result.ok && result.reason === "payment-mismatch-refund-pending") {
        throw new Error("Mismatched captured Stripe payment has an unresolved compensating refund.");
      }
    }
    if (event.type === "payment_intent.amount_capturable_updated") {
      const result = await reconcileCapturablePayment(
        event.data.object as Stripe.PaymentIntent,
        stripe,
        webhookLivemode,
      );
      if (!result.ok && result.reason === "payment-mismatch") {
        throw new Error("Stripe authorization details do not match the booking.");
      }
      if (!result.ok && result.reason === "capture-finalization-refund-pending") {
        throw new Error("Captured Stripe payment did not finalize and its compensating refund remains unresolved.");
      }
      if (!result.ok && result.reason === "payment-mismatch-refund-pending") {
        throw new Error("Mismatched captured Stripe payment has an unresolved compensating refund.");
      }
    }
    if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      await reconcileRefund(
        event.data.object as Stripe.Refund,
        event.id,
        webhookLivemode,
      );
    }
    if (event.type === "charge.dispute.created") {
      await reconcileDispute(
        event.data.object as Stripe.Dispute,
        event.id,
        webhookLivemode,
      );
    }
    if (
      event.type === "identity.verification_session.verified" ||
      event.type === "identity.verification_session.requires_input" ||
      event.type === "identity.verification_session.canceled"
    ) {
      await reconcileIdentity(
        event.data.object as Stripe.Identity.VerificationSession,
        event.id,
        event.created,
        stripe,
        webhookLivemode,
      );
    }
    if (event.type === "identity.verification_session.redacted") {
      const redactedSession = event.data.object as Stripe.Identity.VerificationSession;
      if (redactedSession.livemode !== webhookLivemode) {
        throw new Error("Stripe Identity redaction mode mismatch.");
      }
      await reconcileIdentityRedaction(
        redactedSession,
        event.id,
      );
    }

    return json({ ok: true, received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed", error);
    return json({ ok: false, error: "Webhook handler failed." }, 500);
  }
}
