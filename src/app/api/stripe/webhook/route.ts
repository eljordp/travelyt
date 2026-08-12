import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import { verifiedDob } from "@/lib/stripe-identity";
import { archiveIdentityOriginals, type ArchiveOutcome } from "@/lib/identity-originals";
import { getStripe } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray } from "@/lib/passengers";

export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

async function reconcileRefund(refund: Stripe.Refund, eventId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const bookingId = refund.metadata?.bookingId;
  const query = supabase.from("booking_financial_events").update({
    kind: refund.status === "succeeded" ? "refund_succeeded" : "refund_failed",
    status: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "manual_review",
    stripe_refund_id: refund.id,
  }).eq("stripe_refund_id", refund.id);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (data?.length || !bookingId) return;
  // Stripe can deliver before our request response. Store a durable event so
  // operations has a reconciliation record rather than silently dropping it.
  const { error: insertError } = await supabase.from("booking_financial_events").insert({
    booking_id: bookingId, kind: refund.status === "succeeded" ? "refund_succeeded" : "refund_failed",
    amount_cents: refund.amount, currency: refund.currency, reason: "Stripe refund webhook reconciliation.",
    idempotency_key: `stripe:${eventId}`, stripe_refund_id: refund.id,
    status: refund.status === "succeeded" ? "succeeded" : "manual_review", requested_by: "stripe_webhook",
  });
  if (insertError && !/duplicate|unique/i.test(insertError.message)) throw insertError;
}

async function reconcileDispute(dispute: Stripe.Dispute, eventId: string) {
  const bookingId = dispute.metadata?.bookingId;
  if (!bookingId) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("booking_financial_events").insert({
    booking_id: bookingId, kind: "manual_adjustment", amount_cents: dispute.amount,
    currency: dispute.currency, reason: `Stripe dispute opened: ${dispute.reason}.`,
    idempotency_key: `stripe:${eventId}`, status: "manual_review", requested_by: "stripe_webhook",
  });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}

async function reconcileIdentity(
  eventSession: Stripe.Identity.VerificationSession,
  eventType: Stripe.Event.Type
) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!stripe || !supabase) throw new Error("Identity reconciliation is not configured.");

  const session = await stripe.identity.verificationSessions.retrieve(eventSession.id, {
    expand: ["last_verification_report"],
  });
  const { data: record, error: recordError } = await supabase
    .from("identity_verifications")
    .select("id, user_id, booking_id, passenger_id, metadata")
    .eq("provider_session_id", session.id)
    .maybeSingle<{
      id: string;
      user_id: string | null;
      booking_id: string | null;
      passenger_id: string | null;
      metadata: Record<string, unknown> | null;
    }>();
  if (recordError) throw recordError;
  if (!record) return;

  const now = new Date().toISOString();
  const dob = verifiedDob(session);
  let status: "pending" | "verified" | "manual_review" | "expired" = "pending";
  let livenessStatus: "pending" | "passed" | "failed" | "manual_review" = "pending";
  if (eventType === "identity.verification_session.verified") {
    status = "verified";
    livenessStatus = "passed";
  } else if (eventType === "identity.verification_session.requires_input") {
    status = "manual_review";
    livenessStatus = "failed";
  } else if (eventType === "identity.verification_session.canceled") {
    status = "expired";
    livenessStatus = "manual_review";
  }

  let expectedDob: string | undefined;
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
      expectedDob = manifest.find((passenger) => passenger.id === record.passenger_id)?.dateOfBirth;
    }
  }
  const dobMatches = !expectedDob || (Boolean(dob) && expectedDob === dob);
  if (status === "verified" && !dobMatches) {
    status = "manual_review";
    livenessStatus = "manual_review";
  }

  // Keep Travelyt's own copies of the capture originals once verified —
  // Stripe alone holding the images is not acceptable for chain of custody.
  let archive: ArchiveOutcome | null = null;
  let archiveError: string | null = null;
  if (status === "verified") {
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
  const archived = Boolean(archive && archive.stored > 0);

  const { error: updateError } = await supabase
    .from("identity_verifications")
    .update({
      status,
      liveness_status: livenessStatus,
      verified_at: status === "verified" ? now : null,
      ...(archive && archived
        ? {
            raw_document_paths: archive.paths,
            raw_stored_at: archive.storedAt,
            raw_retention_until: archive.retentionUntil,
            raw_export_status: "pending_ash",
          }
        : {}),
      metadata: {
        ...(record.metadata ?? {}),
        stripe_status: session.status,
        stripe_livemode: session.livemode,
        verified_dob: dob,
        expected_dob_match: expectedDob ? dobMatches : null,
        provider_error_code: session.last_error?.code ?? null,
        raw_document_stored_by_travelyt: archived,
        ...(archiveError ? { raw_archive_error: archiveError } : {}),
        reconciled_at: now,
      },
    })
    .eq("id", record.id);
  if (updateError) throw updateError;

  if (status === "verified" && record.booking_id && record.passenger_id && isBookingPassengerArray(manifest)) {
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

  if (status === "verified" && record.user_id && !record.booking_id && !record.passenger_id) {
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, passenger_manifest")
      .eq("customer_user_id", record.user_id)
      .is("customer_identity_verified_at", null)
      .returns<Array<{ id: string; passenger_manifest: unknown }>>();
    if (bookingsError) throw bookingsError;
    for (const booking of bookings ?? []) {
      const passengerManifest = isBookingPassengerArray(booking.passenger_manifest)
        ? booking.passenger_manifest.map((passenger) =>
            passenger.category === "account_holder"
              ? { ...passenger, identityVerifiedAt: now, verificationStatus: "verified" as const }
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
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return json({ ok: false, error: "Stripe webhook is not configured." }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ ok: false, error: "Missing Stripe signature." }, 400);

  let event: Stripe.Event;
  const rawBody = await request.text();

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return json({ ok: false, error: "Invalid Stripe signature." }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await markBookingPaidFromCheckoutSession(
        event.data.object as Stripe.Checkout.Session
      );
    }
    if (event.type === "refund.updated") {
      await reconcileRefund(event.data.object as Stripe.Refund, event.id);
    }
    if (event.type === "charge.dispute.created") {
      await reconcileDispute(event.data.object as Stripe.Dispute, event.id);
    }
    if (
      event.type === "identity.verification_session.verified" ||
      event.type === "identity.verification_session.requires_input" ||
      event.type === "identity.verification_session.canceled"
    ) {
      await reconcileIdentity(
        event.data.object as Stripe.Identity.VerificationSession,
        event.type
      );
    }

    return json({ ok: true, received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed", error);
    return json({ ok: false, error: "Webhook handler failed." }, 500);
  }
}
