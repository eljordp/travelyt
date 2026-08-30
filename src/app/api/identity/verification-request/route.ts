import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { durableRateLimit } from "@/lib/durable-rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray, passengerDisplayName } from "@/lib/passengers";
import { trustedUserRole } from "@/lib/auth-policy";
import {
  IDENTITY_CONSENT_VERSION,
  identityConsentScope,
  validConsentSignature,
} from "@/lib/identity-consent";
import {
  accountHolderNameMatchesVerifiedIdentity,
  createBoundStripeIdentitySession,
  STRIPE_IDENTITY_PROVIDER,
  verifiedIdentityProfile,
} from "@/lib/stripe-identity";
import {
  providerIdentityVerdict,
  requireVerifiedIdentityGate,
  verifiedIdentityProfileComplete,
  type StripeIdentityEventType,
} from "@/lib/identity-verdict";
import {
  archiveIdentityOriginals,
  discardIdentityOriginalArchive,
  identityArchiveComplete,
} from "@/lib/identity-originals";
import { getStripe, getStripeForLivemode } from "@/lib/stripe-server";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import {
  configuredOperationalMode,
  stripeLivemodeForOperationalMode,
} from "@/lib/operational-mode";

const documentTypes = ["driver_license", "passport", "employee_badge", "other"] as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function consentEvidenceHash(value: string) {
  const secret =
    process.env.TRAVELYT_CONSENT_HASH_SECRET ||
    process.env.TRAVELYT_ADMIN_SESSION_SECRET ||
    "travelyt-consent-evidence";
  return hash(`${secret}:${value}`);
}

async function sendAdultTravelerInvite(data: {
  email: string;
  bookingId: string;
  passengerName: string;
  token: string;
}) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://travelyt.us"}/verify-traveler?token=${encodeURIComponent(data.token)}`;
  const result = await sendTransactionalEmail({
    to: data.email,
    subject: "Confirm your Travelyt traveler verification",
    text: [
      `You were added to Travelyt booking ${data.bookingId}.`,
      "",
      `Open this private link to begin verification: ${verifyUrl}`,
      "",
      "For your security, the link alone is not enough. We will send a separate one-time code to this email after you open it.",
      "Do not forward this link. If you did not expect this message, do not continue.",
      "",
      `Traveler: ${data.passengerName}`,
    ].join("\n"),
    idempotencyKey: `traveler-invite:${data.bookingId}:${hash(data.token).slice(0, 24)}`,
  });
  if (result.status === "failed") console.error("Adult traveler invite delivery failed", result);
  return result.status === "accepted";
}

async function reconcileExistingProfileIdentity(input: {
  stripe: NonNullable<ReturnType<typeof getStripe>>;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  verificationId: string;
  providerSessionId: string;
  userId: string;
  email?: string;
  metadata: Record<string, unknown> | null;
}) {
  const { data: storedState, error: storedStateError } = await input.supabase
    .from("identity_verifications")
    .select("raw_purpose_ended_at, raw_destroyed_at, raw_deletion_status, metadata")
    .eq("id", input.verificationId)
    .maybeSingle<{
      raw_purpose_ended_at: string | null;
      raw_destroyed_at: string | null;
      raw_deletion_status: string;
      metadata: Record<string, unknown> | null;
    }>();
  if (storedStateError) throw storedStateError;
  if (
    storedState?.raw_purpose_ended_at ||
    storedState?.raw_destroyed_at ||
    storedState?.raw_deletion_status === "destroyed" ||
    storedState?.metadata?.raw_destruction_started_at
  ) {
    return {
      status: "manual_review",
      url: null,
      freshAttemptRequired: true,
      freshAttemptReason: "evidence_destruction_started",
    };
  }
  const session = await input.stripe.identity.verificationSessions.retrieve(
    input.providerSessionId,
    { expand: ["last_verification_report"] }
  );
  const operationalMode = configuredOperationalMode();
  const expectedLivemode = stripeLivemodeForOperationalMode(operationalMode);
  if (session.livemode !== expectedLivemode) {
    const { error: modeError } = await input.supabase
      .from("identity_verifications")
      .update({
        status: "manual_review",
        liveness_status: "manual_review",
        verified_at: null,
        metadata: {
          ...(input.metadata ?? {}),
          stripe_livemode: session.livemode,
          operational_mode: operationalMode,
          provider_mode_mismatch: true,
        },
      })
      .eq("id", input.verificationId);
    if (modeError) throw modeError;
    return {
      status: "manual_review",
      url: null,
      freshAttemptRequired: true,
      freshAttemptReason: "provider_mode_mismatch",
    };
  }
  const eventType: StripeIdentityEventType | null =
    session.status === "verified"
      ? "identity.verification_session.verified"
      : session.status === "requires_input"
        ? "identity.verification_session.requires_input"
        : session.status === "canceled"
          ? "identity.verification_session.canceled"
          : null;
  if (!eventType) {
    return {
      status: "pending",
      url: session.url,
      freshAttemptRequired: false,
      freshAttemptReason: null,
    };
  }

  const now = new Date().toISOString();
  let verdict = providerIdentityVerdict(eventType);
  let archive: Awaited<ReturnType<typeof archiveIdentityOriginals>> | null = null;
  let archiveError: string | null = null;
  if (verdict.status === "verified") {
    try {
      archive = await archiveIdentityOriginals({
        stripe: input.stripe,
        supabase: input.supabase,
        verificationId: input.verificationId,
        session,
      });
    } catch (error) {
      archiveError = error instanceof Error ? error.message : "Unknown archive failure.";
      console.error("Identity original archive failed during return reconciliation", error);
    }
  }
  const archived = identityArchiveComplete(archive);
  const verifiedProfile = verifiedIdentityProfile(session);
  const profileComplete = verifiedIdentityProfileComplete(verifiedProfile);
  verdict = requireVerifiedIdentityGate(verdict, archived && profileComplete);

  const { data: updatedRecord, error: updateError } = await input.supabase
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
        ...(input.metadata ?? {}),
        stripe_status: session.status,
        stripe_livemode: session.livemode,
        verified_dob: verifiedProfile.dateOfBirth,
        verified_first_name: verifiedProfile.firstName,
        verified_last_name: verifiedProfile.lastName,
        verified_profile_complete: profileComplete,
        provider_error_code: session.last_error?.code ?? null,
        raw_document_stored_by_travelyt: archived,
        archive_required_before_custody: true,
        ...(archiveError ? { raw_archive_error: archiveError } : {}),
        reconciled_at: now,
        reconciled_via: "profile_return",
      },
    })
    .eq("id", input.verificationId)
    .is("raw_purpose_ended_at", null)
    .is("raw_destroyed_at", null)
    .neq("raw_deletion_status", "destroyed")
    .match(archive ? { raw_archive_claim_token: archive.claimToken } : {})
    .select("id")
    .maybeSingle<{ id: string }>();
  if (updateError || !updatedRecord) {
    if (archive) {
      const discarded = await discardIdentityOriginalArchive({
        supabase: input.supabase,
        verificationId: input.verificationId,
        claimToken: archive.claimToken,
        paths: archive.paths,
        reason:
          updateError?.message ||
          "Identity archive lost its final database compare-and-set.",
      });
      if (!discarded.ok) {
        console.error("Orphaned identity archive cleanup failed", discarded.error);
      }
    } else if (updateError) {
      throw updateError;
    }
    if (updateError) console.error("Identity archive finalization failed", updateError);
    return {
      status: "manual_review",
      url: null,
      freshAttemptRequired: true,
      freshAttemptReason: "evidence_destruction_started",
    };
  }

  if (verdict.status === "verified") {
    const { data: bookings, error: bookingsError } = await input.supabase
      .from("bookings")
      .select("id, customer_name, email, passenger_manifest")
      .eq("customer_user_id", input.userId)
      .is("customer_identity_verified_at", null)
      .returns<Array<{ id: string; customer_name: string; email: string; passenger_manifest: unknown }>>();
    if (bookingsError) throw bookingsError;
    for (const booking of bookings ?? []) {
      const emailMatches = Boolean(
        input.email && booking.email.trim().toLowerCase() === input.email.trim().toLowerCase()
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
                  email: input.email || passenger.email,
                  dateOfBirth: verifiedProfile.dateOfBirth,
                  identityVerifiedAt: now,
                  verificationStatus: "verified" as const,
                }
              : passenger
          )
        : booking.passenger_manifest;
      const { error: bookingUpdateError } = await input.supabase
        .from("bookings")
        .update({ customer_identity_verified_at: now, passenger_manifest: passengerManifest })
        .eq("id", booking.id);
      if (bookingUpdateError) throw bookingUpdateError;
    }
  }

  const freshAttemptRequired =
    session.status === "canceled" ||
    (session.status === "verified" && (!profileComplete || !archived)) ||
    (session.status === "requires_input" && !session.url);

  return {
    status: verdict.status,
    url: session.status === "requires_input" ? session.url : null,
    freshAttemptRequired,
    freshAttemptReason:
      session.status === "verified" && !profileComplete
        ? "provider_verified_profile_incomplete"
        : session.status === "verified" && !archived
          ? "provider_verified_archive_incomplete"
        : session.status === "canceled"
          ? "provider_session_canceled"
          : session.status === "requires_input" && !session.url
            ? "provider_session_not_resumable"
            : null,
  };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "identity:status", 30);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Identity backend is not configured.", 503);

  const user = await getRequestUser(request);
  if (!user) return bad("Sign in before checking verification status.", 401);

  const trustedRole = trustedUserRole(user);
  const role =
    trustedRole === "manager"
      ? "admin"
      : trustedRole === "dispatcher"
        ? "employee"
        : trustedRole;
  const operationalMode = configuredOperationalMode();
  const expectedLivemode = stripeLivemodeForOperationalMode(operationalMode);
  const { data, error } = await supabase
    .from("identity_verifications")
    .select("id, status, liveness_status, verified_at, updated_at")
    .eq("user_id", user.id)
    .eq("role", role)
    .eq("provider", STRIPE_IDENTITY_PROVIDER)
    .contains("metadata", { stripe_livemode: expectedLivemode })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      status: string;
      liveness_status: string;
      verified_at: string | null;
      updated_at: string;
    }>();
  if (error) {
    console.error("Identity status lookup failed", error);
    return bad("Could not check verification status.", 500);
  }

  let currentStatus = data?.status ?? null;
  let currentLivenessStatus = data?.liveness_status ?? null;
  let currentVerifiedAt = data?.verified_at ?? null;
  if (data?.status === "verified") {
    const { data: currentComplete, error: currentCompleteError } = await supabase.rpc(
      "identity_verification_is_current_complete_for_mode",
      {
        p_identity_id: data.id,
        p_operational_mode: operationalMode,
      },
    );
    if (currentCompleteError) {
      console.error("Identity completeness lookup failed", currentCompleteError);
      return bad("Could not check verification completeness.", 500);
    }
    if (currentComplete !== true) {
      currentStatus = "manual_review";
      currentLivenessStatus = "manual_review";
      currentVerifiedAt = null;
    }
  }

  return NextResponse.json({
    ok: true,
    status: currentStatus,
    livenessStatus: currentLivenessStatus,
    verifiedAt: currentVerifiedAt,
    updatedAt: data?.updated_at ?? null,
    operationalMode,
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "identity:request", 10);
  if (limited) return limited;
  const durableLimited = await durableRateLimit(request, "identity:request", 10, 60_000);
  if (durableLimited) return durableLimited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Identity backend is not configured.", 503);

  const user = await getRequestUser(request);
  if (!user) return bad("Sign in before requesting verification.", 401);
  const operationalMode = configuredOperationalMode();
  const expectedLivemode = stripeLivemodeForOperationalMode(operationalMode);

  try {
    const body = (await request.json().catch(() => ({}))) as {
      documentType?: string;
      bookingId?: string;
      passengerId?: string;
      consentAccepted?: boolean;
      consentVersion?: string;
      signatureName?: string;
    };
    const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
    const passengerId = typeof body.passengerId === "string" ? body.passengerId.trim() : "";
    if (bookingId || passengerId) {
      if (!bookingId || !passengerId) return bad("Booking and traveler are required.");
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, customer_user_id, passenger_manifest, operational_mode")
        .eq("id", bookingId)
        .maybeSingle<{
          id: string;
          customer_user_id: string | null;
          passenger_manifest: unknown;
          operational_mode: "rehearsal" | "live" | null;
        }>();
      if (bookingError) return bad("Could not load traveler booking.", 500);
      if (!booking || booking.customer_user_id !== user.id) return bad("You do not have access to this traveler booking.", 403);
      if (!isBookingPassengerArray(booking.passenger_manifest)) return bad("Traveler manifest is unavailable.", 409);
      let bookingMode = booking.operational_mode;
      if (!bookingMode) {
        const { data: classified, error: classificationError } = await supabase.rpc(
          "classify_pending_booking_operational_mode",
          {
            p_booking_id: booking.id,
            p_operational_mode: operationalMode,
          },
        );
        if (classificationError || classified !== true) {
          console.error("Legacy booking mode classification failed", classificationError);
          return bad(
            "This booking cannot be safely bound to an identity-provider mode. Operations review is required.",
            409,
          );
        }
        bookingMode = operationalMode;
      }
      if (bookingMode !== operationalMode) {
        return bad(
          "This booking is bound to another operating mode. Operations review is required before identity verification.",
          409,
        );
      }
      const bookingStripeLivemode = bookingMode === "live";
      const passenger = booking.passenger_manifest.find((candidate) => candidate.id === passengerId);
      if (!passenger || passenger.category !== "adult" || passenger.verificationMethod !== "self_service" || !passenger.email) {
        return bad("Only a grouped adult with a separate email can receive this verification invite.", 409);
      }
      const token = randomBytes(36).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
      const values = {
        user_id: user.id,
        email: passenger.email,
        role: "customer",
        status: "pending",
        provider: "manual_prelaunch",
        document_type: "passport",
        liveness_required: true,
        liveness_status: "pending",
        booking_id: booking.id,
        passenger_id: passenger.id,
        subject_name: passengerDisplayName(passenger),
        subject_type: "adult",
        verification_invite_token_hash: hash(token),
        verification_invite_expires_at: expiresAt,
        verification_invite_sent_at: now.toISOString(),
        verification_invite_otp_hash: null,
        verification_invite_otp_expires_at: null,
        verification_invite_otp_attempts: 0,
        verification_invite_otp_verified_at: null,
        consent_at: null,
        metadata: {
          source: "booking-group",
          verification_method: passenger.verificationMethod,
          operational_mode: bookingMode,
          stripe_livemode: bookingStripeLivemode,
          raw_document_stored_by_travelyt: false,
        },
      };
      const { data: existingInvite, error: inviteLookupError } = await supabase
        .from("identity_verifications")
        .select("id, provider, provider_session_id, provider_session_claim_token, provider_redaction_claim_token, consent_at, raw_purpose_ended_at, raw_destroyed_at, metadata")
        .eq("booking_id", booking.id)
        .eq("passenger_id", passenger.id)
        .in("status", ["pending", "manual_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          id: string;
          provider: string;
          provider_session_id: string | null;
          provider_session_claim_token: string | null;
          provider_redaction_claim_token: string | null;
          consent_at: string | null;
          raw_purpose_ended_at: string | null;
          raw_destroyed_at: string | null;
          metadata: Record<string, unknown> | null;
        }>();
      if (inviteLookupError) return bad("Could not prepare traveler verification invite.", 500);
      if (existingInvite?.raw_purpose_ended_at || existingInvite?.raw_destroyed_at) {
        return bad(
          "The prior traveler identity attempt is closed. Privacy review must finish before a new invite is created.",
          409,
        );
      }
      const providerAttemptExists = Boolean(
        existingInvite && (
          existingInvite.provider !== "manual_prelaunch" ||
          existingInvite.provider_session_id ||
          existingInvite.provider_session_claim_token ||
          existingInvite.provider_redaction_claim_token ||
          existingInvite.consent_at
        )
      );
      if (
        providerAttemptExists &&
        (
          existingInvite?.metadata?.operational_mode !== bookingMode ||
          existingInvite?.metadata?.stripe_livemode !== bookingStripeLivemode
        )
      ) {
        return bad(
          "The prior traveler identity attempt requires provider-mode reconciliation before another invite can be sent.",
          409,
        );
      }
      const inviteWrite = existingInvite
        ? await supabase.from("identity_verifications").update(
            providerAttemptExists
              ? {
                  verification_invite_token_hash: values.verification_invite_token_hash,
                  verification_invite_expires_at: values.verification_invite_expires_at,
                  verification_invite_sent_at: values.verification_invite_sent_at,
                }
              : values,
          ).eq("id", existingInvite.id)
        : await supabase.from("identity_verifications").insert(values);
      if (inviteWrite.error) {
        console.error("Adult invite creation failed", inviteWrite.error);
        return bad("Could not create traveler verification invite.", 500);
      }
      const sent = await sendAdultTravelerInvite({
        email: passenger.email,
        bookingId: booking.id,
        passengerName: passengerDisplayName(passenger),
        token,
      });
      if (!sent) return bad("Traveler invite email is not configured. No invitation was sent.", 503);
      const updatedManifest = booking.passenger_manifest.map((candidate) =>
        candidate.id === passenger.id
          ? { ...candidate, verificationStatus: "invite_sent" as const }
          : candidate
      );
      const { error: manifestError } = await supabase
        .from("bookings")
        .update({ passenger_manifest: updatedManifest })
        .eq("id", booking.id);
      if (manifestError) {
        console.error("Adult traveler invite status reconciliation failed", manifestError);
        return bad("The traveler email was sent, but the booking status needs reconciliation.", 502);
      }
      return NextResponse.json({ ok: true, status: "invite_sent", expiresAt });
    }
    const metadata = user.user_metadata ?? {};
    const trustedRole = trustedUserRole(user);
    const role =
      trustedRole === "manager"
        ? "admin"
        : trustedRole === "dispatcher"
          ? "employee"
          : trustedRole;
    const documentType: (typeof documentTypes)[number] = documentTypes.includes(
      body.documentType as (typeof documentTypes)[number]
    )
      ? (body.documentType as (typeof documentTypes)[number])
      : "driver_license";
    const phone = typeof metadata.phone === "string" ? metadata.phone : null;
    const signatureName = typeof body.signatureName === "string"
      ? body.signatureName.trim().replace(/\s+/g, " ").slice(0, 160)
      : "";
    if (
      body.consentAccepted !== true ||
      body.consentVersion !== IDENTITY_CONSENT_VERSION ||
      !validConsentSignature(signatureName)
    ) {
      return bad("Review the identity disclosure and enter your legal name as an electronic signature.");
    }
    const consentAt = new Date().toISOString();
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("user-agent")?.trim() || "unknown";
    const consentValues = {
      consent_at: consentAt,
      consent_version: IDENTITY_CONSENT_VERSION,
      consent_signature_name: signatureName,
      consent_scope: identityConsentScope(STRIPE_IDENTITY_PROVIDER),
      consent_ip_hash: consentEvidenceHash(forwardedFor),
      consent_user_agent_hash: consentEvidenceHash(userAgent),
    };

    let forcedRetryIdentityId: string | null = null;
    let forcedRetryReason: string | null = null;
    const { data: verified, error: verifiedError } = await supabase
      .from("identity_verifications")
      .select("id, status, metadata")
      .eq("user_id", user.id)
      .eq("role", role)
      .eq("provider", STRIPE_IDENTITY_PROVIDER)
      .eq("status", "verified")
      .contains("metadata", { stripe_livemode: expectedLivemode })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verifiedError) {
      console.error("Verified identity lookup failed", verifiedError);
      return bad("Could not check verification status.", 500);
    }
    if (verified) {
      const { data: currentComplete, error: currentCompleteError } = await supabase.rpc(
        "identity_verification_is_current_complete_for_mode",
        {
          p_identity_id: verified.id,
          p_operational_mode: operationalMode,
        },
      );
      if (currentCompleteError) {
        console.error("Verified identity completeness lookup failed", currentCompleteError);
        return bad("Could not check verification completeness.", 500);
      }
      if (currentComplete === true) {
        return NextResponse.json({
          ok: true,
          status: "verified",
          existing: true,
          operationalMode,
        });
      }
      const verifiedMetadata = verified.metadata && typeof verified.metadata === "object"
        ? verified.metadata as Record<string, unknown>
        : {};
      const { error: staleVerifiedError } = await supabase
        .from("identity_verifications")
        .update({
          status: "manual_review",
          liveness_status: "manual_review",
          verified_at: null,
          metadata: {
            ...verifiedMetadata,
            current_evidence_retry_required: true,
            current_evidence_retry_reason: "stored_verified_record_is_no_longer_complete",
          },
        })
        .eq("id", verified.id)
        .eq("status", "verified");
      if (staleVerifiedError) {
        console.error("Stale verified identity downgrade failed", staleVerifiedError);
        return bad("Could not prepare a fresh verification attempt.", 500);
      }
      forcedRetryIdentityId = verified.id;
      forcedRetryReason = "stored_verified_record_is_no_longer_complete";
    }

    type ExistingVerification = {
      id: string;
      status: string;
      provider_session_id: string | null;
      provider_session_claim_token: string | null;
      provider_session_creation_status: string;
      metadata: Record<string, unknown> | null;
    };
    let existing: ExistingVerification | null = null;
    if (!forcedRetryIdentityId) {
      const { data: existingData, error: existingError } = await supabase
        .from("identity_verifications")
        .select("id, status, provider_session_id, provider_session_claim_token, provider_session_creation_status, metadata")
        .eq("user_id", user.id)
        .eq("role", role)
        .eq("provider", STRIPE_IDENTITY_PROVIDER)
        .in("status", ["pending", "manual_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<ExistingVerification>();
      if (existingError) {
        console.error("Stripe Identity lookup failed", existingError);
        return bad("Could not check verification status.", 500);
      }
      existing = existingData;
    }
    let retryOfVerificationId: string | null = forcedRetryIdentityId;
    let retryReason: string | null = forcedRetryReason;
    if (existing?.provider_session_id) {
      const existingLivemode = existing.metadata?.stripe_livemode;
      if (typeof existingLivemode !== "boolean") {
        return bad("The prior identity attempt requires provider-mode reconciliation.", 409);
      }
      const stripe = getStripeForLivemode(existingLivemode);
      if (!stripe) return bad("Stripe Identity is not configured.", 503);
      try {
        const reconciled = await reconcileExistingProfileIdentity({
          stripe,
          supabase,
          verificationId: existing.id,
          providerSessionId: existing.provider_session_id,
          userId: user.id,
          email: user.email ?? undefined,
          metadata: existing.metadata,
        });
        if (!reconciled.freshAttemptRequired) {
          return NextResponse.json({ ok: true, ...reconciled, existing: true, operationalMode });
        }
        retryOfVerificationId = existing.id;
        retryReason = reconciled.freshAttemptReason;
      } catch (error) {
        console.error("Stripe Identity session retrieval failed", error);
        return bad("Could not reopen the secure identity session.", 502);
      }
    }

    if (existing && !existing.provider_session_id) {
      try {
        const session = await createBoundStripeIdentitySession({
          supabase,
          verificationId: existing.id,
          userId: user.id,
          email: user.email ?? undefined,
          phone: phone ?? undefined,
          role,
          documentType,
          request,
          bindMetadata: existing.metadata ?? {},
        });
        return NextResponse.json({
          ok: true,
          status: existing.status,
          url: session.url,
          existing: true,
          operationalMode: session.livemode ? "live" : "rehearsal",
        });
      } catch (providerError) {
        console.error("Stripe Identity protected retry failed", providerError);
        return bad(
          "The secure identity attempt is awaiting safe provider reconciliation. Custody remains blocked.",
          503,
        );
      }
    }

    const { data, error } = await supabase
      .from("identity_verifications")
      .insert({
        user_id: user.id,
        email: user.email ?? null,
        phone,
        role,
        status: "pending",
        provider: STRIPE_IDENTITY_PROVIDER,
        document_type: documentType,
        liveness_required: true,
        liveness_status: "pending",
        ...consentValues,
        metadata: {
          source: "profile",
          requested_by: user.id,
          operational_mode: operationalMode,
          stripe_livemode: expectedLivemode,
          raw_document_stored_by_travelyt: false,
          ...(retryOfVerificationId
            ? {
                retry_of_verification_id: retryOfVerificationId,
                retry_reason: retryReason,
              }
            : {}),
        },
      })
      .select("id, status")
      .single();

    if (error) {
      console.error("Identity verification insert failed", error);
      return bad("Could not request verification.", 500);
    }

    try {
      const session = await createBoundStripeIdentitySession({
        supabase,
        verificationId: data.id,
        userId: user.id,
        email: user.email ?? undefined,
        phone: phone ?? undefined,
        role,
        documentType,
        request,
        bindMetadata: {
          source: "profile",
          requested_by: user.id,
          stripe_livemode: expectedLivemode,
          operational_mode: operationalMode,
          raw_document_stored_by_travelyt: false,
          ...(retryOfVerificationId
            ? {
                retry_of_verification_id: retryOfVerificationId,
                retry_reason: retryReason,
              }
            : {}),
        },
      });
      return NextResponse.json({ ok: true, status: data.status, url: session.url, operationalMode });
    } catch (providerError) {
      console.error("Stripe Identity session creation failed", providerError);
      // The protected provider-session claim owns this failure state. In
      // particular, an ambiguous Stripe timeout must retain its original
      // livemode/idempotency metadata so a retry cannot create a second row.
      return bad("Secure identity verification is not available yet. Custody remains blocked.", 503);
    }
  } catch {
    return bad("Could not request verification.");
  }
}
