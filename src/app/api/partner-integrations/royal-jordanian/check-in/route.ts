import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import { arePartnerIntegrationsEnabled } from "@/lib/partner-integrations";
import { rateLimit } from "@/lib/rate-limit";
import { executeRjGatewayCheckIn, getRjIntegrationReadiness, RJ_PROVIDER_ID, RjIntegrationError, validateRjCheckInInput } from "@/lib/rj-check-in";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray } from "@/lib/passengers";
import { STRIPE_IDENTITY_PROVIDER } from "@/lib/stripe-identity";
import {
  configuredOperationalMode,
  isOperationalMode,
  stripeLivemodeForOperationalMode,
} from "@/lib/operational-mode";

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) { return NextResponse.json({ ok: false, error, ...extra }, { status }); }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function GET(request: Request) {
  const limited = rateLimit(request, "rj-check-in:get", 30); if (limited) return limited;
  if ((await getVerifiedAdminSession(request))?.role !== "admin") return bad("Full admin access is required.", 403);
  const readiness = getRjIntegrationReadiness();
  return NextResponse.json({ ok: true, enabled: arePartnerIntegrationsEnabled() && readiness.enabled, readiness });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "rj-check-in:post", 10); if (limited) return limited;
  const session = await getVerifiedAdminSession(request); if (!session || session.role !== "admin") return bad("Full admin access is required.", 403);
  if (!arePartnerIntegrationsEnabled()) return bad("Partner integrations are not enabled.", 404);
  const body = await request.json().catch(() => ({})) as { bookingId?: string; idempotencyKey?: string };
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bookingId) || !idempotencyKey) return bad("Booking ID and idempotency key are required.");
  const readiness = getRjIntegrationReadiness();
  if (!readiness.readyForConfiguredMode) return bad("RJ check-in is locked until every gate required for the configured mode is complete.", 409, { readiness });
  const supabase = getSupabaseAdmin(); if (!supabase) return bad("Partner backend is not configured.", 503);
  const { data: booking, error: bookingError } = await supabase.from("bookings")
    .select("id, service, airport, travel_date, flight, bags, external_provider, external_reference, passenger_manifest, customer_user_id, status, paid_at, pilot_eligibility_status, pilot_eligibility_expires_at, operational_mode")
    .eq("id", bookingId).maybeSingle<{
      id: string; service: string; airport: string; travel_date: string; flight: string | null; bags: number; external_provider: string | null; external_reference: string | null; passenger_manifest: unknown; customer_user_id: string | null; status: string; paid_at: string | null; pilot_eligibility_status: string; pilot_eligibility_expires_at: string | null; operational_mode: string | null;
    }>();
  if (bookingError || !booking) return bad("Booking was not found.", 404);
  if (booking.service !== "departure" || booking.external_provider !== RJ_PROVIDER_ID || !booking.external_reference || !isBookingPassengerArray(booking.passenger_manifest)) return bad("Only a separate departure booking is eligible for RJ off-site check-in.", 409);
  if (!booking.customer_user_id) return bad("Booking owner identity is unavailable.", 409);
  if (!isOperationalMode(booking.operational_mode)) return bad("This booking has no classified operating mode.", 409);
  if (configuredOperationalMode() !== booking.operational_mode) return bad("This booking does not match Travelyt's active operating mode.", 409);
  const expectedIntegrationMode = booking.operational_mode === "live" ? "production" : "sandbox";
  if (readiness.mode !== expectedIntegrationMode) return bad("RJ integration mode does not match this booking.", 409);
  const eligibleOperationalStates = new Set(["paid", "assigned", "accepted", "en_route", "arrived", "picked_up"]);
  if (!booking.paid_at || !eligibleOperationalStates.has(booking.status)) return bad("A paid, active departure booking is required before RJ check-in.", 409);
  if (
    booking.pilot_eligibility_status !== "approved" ||
    !booking.pilot_eligibility_expires_at ||
    Date.parse(booking.pilot_eligibility_expires_at) <= Date.now()
  ) return bad("Current pilot approval is required before RJ check-in.", 409);
  const { data: bookingIdentityCurrent, error: bookingIdentityError } = await supabase.rpc(
    "booking_has_current_identity_for_mode",
    { p_booking_id: booking.id, p_operational_mode: booking.operational_mode },
  );
  if (bookingIdentityError) return bad("Could not revalidate traveler identities.", 500);
  if (bookingIdentityCurrent !== true) return bad("Every traveler needs current mode-matched identity evidence before RJ check-in.", 409);
  const expectedIdentityLivemode = stripeLivemodeForOperationalMode(booking.operational_mode);
  const { data: identities, error: identityError } = await supabase.from("identity_verifications")
    .select("id, booking_id, passenger_id, user_id, verified_at")
    .eq("provider", STRIPE_IDENTITY_PROVIDER)
    .eq("status", "verified")
    .contains("metadata", { stripe_livemode: expectedIdentityLivemode })
    .or(`booking_id.eq.${bookingId},user_id.eq.${booking.customer_user_id}`);
  if (identityError) return bad("Could not load verified identities.", 500);
  const currentIdentities = (await Promise.all((identities ?? []).map(async (identity) => {
    const { data: current, error } = await supabase.rpc(
      "identity_verification_is_current_complete_for_mode",
      { p_identity_id: identity.id, p_operational_mode: booking.operational_mode },
    );
    if (error) throw error;
    return current === true ? identity : null;
  }))).filter((identity): identity is NonNullable<typeof identity> => Boolean(identity));
  const passengers = booking.passenger_manifest.map((passenger) => {
    const identity = currentIdentities.find((candidate) =>
      (candidate.booking_id === bookingId && candidate.passenger_id === passenger.id) ||
      (passenger.category === "account_holder" && candidate.user_id === booking.customer_user_id && !candidate.booking_id && !candidate.passenger_id)
    );
    return identity?.verified_at ? { passengerId: passenger.id, firstName: passenger.firstName, lastName: passenger.lastName, bags: passenger.bags, identityReference: identity.id, identityVerifiedAt: identity.verified_at } : null;
  });
  if (passengers.some((passenger) => !passenger)) return bad("Every traveler must have completed identity verification before check-in.", 409);
  try {
    const input = validateRjCheckInInput({ bookingId, pnr: booking.external_reference, flightNumber: booking.flight || "", travelDate: booking.travel_date, departureAirport: booking.airport, bagCount: booking.bags, idempotencyKey, passengers: passengers.filter(Boolean) as NonNullable<typeof passengers[number]>[] });
    const requestFingerprint = fingerprint(input);
    type RjJobBinding = {
      id: string;
      booking_id: string;
      idempotency_key: string;
      request_fingerprint: string;
      mode: string;
      state: string;
    };
    const loadExistingJob = () => supabase
      .from("partner_check_in_jobs")
      .select("id, booking_id, idempotency_key, request_fingerprint, mode, state")
      .eq("provider_id", RJ_PROVIDER_ID)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle<RjJobBinding>();
    const exactReplay = (candidate: RjJobBinding) =>
      candidate.booking_id === bookingId &&
      candidate.idempotency_key === idempotencyKey &&
      candidate.request_fingerprint === requestFingerprint &&
      candidate.mode === readiness.mode;
    const { data: existing, error: existingError } = await loadExistingJob();
    if (existingError) return bad("Could not inspect the RJ idempotency ledger.", 500);
    if (existing) {
      if (!exactReplay(existing)) {
        throw new RjIntegrationError(
          "idempotency_conflict",
          "This RJ idempotency key is already bound to a different booking, mode, or request.",
          409,
        );
      }
      if (["tags_issued_inactive", "handoff_ready", "tags_activated"].includes(existing.state)) {
        return NextResponse.json({ ok: true, idempotent: true, job: existing });
      }
      throw new RjIntegrationError(
        "dispatch_reconciliation_required",
        "The exact RJ request exists but does not have a completed dispatch result. Operations must reconcile it before any retry.",
        503,
      );
    }
    const { data: insertedJob, error: jobError } = await supabase
      .from("partner_check_in_jobs")
      .insert({ provider_id: RJ_PROVIDER_ID, booking_id: bookingId, idempotency_key: idempotencyKey, request_fingerprint: requestFingerprint, identity_verification_id: passengers[0]!.identityReference, mode: readiness.mode, state: "requested", flight_number: input.flightNumber, departure_airport: input.departureAirport, travel_date: input.travelDate, bag_count: input.bagCount, passenger_manifest: booking.passenger_manifest, requested_by: session.email })
      .select("id, booking_id, idempotency_key, request_fingerprint, mode, state")
      .single<RjJobBinding>();
    const job = insertedJob;
    if (jobError || !job) {
      // A concurrent request may have won the unique idempotency insert. It is
      // safe to reuse only when every immutable binding matches exactly.
      const { data: racedJob, error: racedJobError } = await loadExistingJob();
      if (racedJobError || !racedJob) return bad("Could not create the RJ check-in job.", 500);
      if (!exactReplay(racedJob)) {
        throw new RjIntegrationError(
          "idempotency_conflict",
          "This RJ idempotency key was concurrently bound to a different booking, mode, or request.",
          409,
        );
      }
      throw new RjIntegrationError(
        "dispatch_reconciliation_required",
        "A concurrent RJ request claimed this idempotency key. Operations must reconcile its dispatch result before any retry.",
        503,
      );
    }
    let result;
    try {
      result = await executeRjGatewayCheckIn(input);
    } catch (gatewayError) {
      const known = gatewayError instanceof RjIntegrationError ? gatewayError : new RjIntegrationError("check_in_failed", "RJ check-in failed safely.", 500);
      await supabase.from("partner_check_in_jobs").update({ state: "manual_review", last_error_code: known.code, last_error_message: known.message }).eq("id", job.id).eq("booking_id", bookingId).eq("request_fingerprint", requestFingerprint).eq("mode", readiness.mode).eq("state", "requested");
      throw known;
    }
    const { data: updatedJob, error: resultError } = await supabase.from("partner_check_in_jobs").update({ state: result.state, external_check_in_reference: result.checkInReference, bag_tag_references: result.bagTags, tag_activation_state: result.tagActivationState }).eq("id", job.id).eq("booking_id", bookingId).eq("idempotency_key", idempotencyKey).eq("request_fingerprint", requestFingerprint).eq("mode", readiness.mode).eq("state", "requested").select("id").maybeSingle<{ id: string }>();
    if (resultError || !updatedJob) return bad("RJ response requires local reconciliation.", 502);
    await supabase.from("bookings").update({ external_status: String(result.state), external_synced_at: new Date().toISOString() }).eq("id", bookingId);
    return NextResponse.json({ ok: true, idempotent: false, job: { id: job.id, state: result.state, checkInReference: result.checkInReference } });
  } catch (error) {
    const known = error instanceof RjIntegrationError ? error : new RjIntegrationError("check_in_failed", "RJ check-in failed safely.", 500);
    return bad(known.message, known.httpStatus, { code: known.code });
  }
}
