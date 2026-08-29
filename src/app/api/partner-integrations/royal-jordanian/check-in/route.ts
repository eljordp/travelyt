import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminSession, isFullAdminSession } from "@/lib/admin-auth";
import { arePartnerIntegrationsEnabled } from "@/lib/partner-integrations";
import { rateLimit } from "@/lib/rate-limit";
import { executeRjGatewayCheckIn, getRjIntegrationReadiness, RJ_PROVIDER_ID, RjIntegrationError, validateRjCheckInInput } from "@/lib/rj-check-in";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray } from "@/lib/passengers";
import { STRIPE_IDENTITY_PROVIDER } from "@/lib/stripe-identity";

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) { return NextResponse.json({ ok: false, error, ...extra }, { status }); }
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function GET(request: Request) {
  const limited = rateLimit(request, "rj-check-in:get", 30); if (limited) return limited;
  if (!isFullAdminSession(request)) return bad("Full admin access is required.", 403);
  return NextResponse.json({ ok: true, enabled: arePartnerIntegrationsEnabled(), readiness: getRjIntegrationReadiness() });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "rj-check-in:post", 10); if (limited) return limited;
  const session = getAdminSession(request); if (!session || session.role !== "admin") return bad("Full admin access is required.", 403);
  if (!arePartnerIntegrationsEnabled()) return bad("Partner integrations are not enabled.", 404);
  const body = await request.json().catch(() => ({})) as { bookingId?: string; idempotencyKey?: string };
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bookingId) || !idempotencyKey) return bad("Booking ID and idempotency key are required.");
  const readiness = getRjIntegrationReadiness();
  if (!readiness.readyForConfiguredMode) return bad("RJ check-in is locked until every gate required for the configured mode is complete.", 409, { readiness });
  const supabase = getSupabaseAdmin(); if (!supabase) return bad("Partner backend is not configured.", 503);
  const { data: booking, error: bookingError } = await supabase.from("bookings")
    .select("id, service, airport, travel_date, flight, bags, external_provider, external_reference, passenger_manifest, customer_user_id")
    .eq("id", bookingId).maybeSingle<{
      id: string; service: string; airport: string; travel_date: string; flight: string | null; bags: number; external_provider: string | null; external_reference: string | null; passenger_manifest: unknown; customer_user_id: string | null;
    }>();
  if (bookingError || !booking) return bad("Booking was not found.", 404);
  if (booking.service !== "departure" || booking.external_provider !== RJ_PROVIDER_ID || !booking.external_reference || !isBookingPassengerArray(booking.passenger_manifest)) return bad("Only a separate departure booking is eligible for RJ off-site check-in.", 409);
  if (!booking.customer_user_id) return bad("Booking owner identity is unavailable.", 409);
  const { data: identities, error: identityError } = await supabase.from("identity_verifications")
    .select("id, booking_id, passenger_id, user_id, verified_at")
    .eq("provider", STRIPE_IDENTITY_PROVIDER)
    .eq("status", "verified")
    .or(`booking_id.eq.${bookingId},user_id.eq.${booking.customer_user_id}`);
  if (identityError) return bad("Could not load verified identities.", 500);
  const passengers = booking.passenger_manifest.map((passenger) => {
    const identity = identities?.find((candidate) =>
      (candidate.booking_id === bookingId && candidate.passenger_id === passenger.id) ||
      (passenger.category === "account_holder" && candidate.user_id === booking.customer_user_id && !candidate.booking_id && !candidate.passenger_id)
    );
    return identity?.verified_at ? { passengerId: passenger.id, firstName: passenger.firstName, lastName: passenger.lastName, bags: passenger.bags, identityReference: identity.id, identityVerifiedAt: identity.verified_at } : null;
  });
  if (passengers.some((passenger) => !passenger)) return bad("Every traveler must have completed identity verification before check-in.", 409);
  try {
    const input = validateRjCheckInInput({ bookingId, pnr: booking.external_reference, flightNumber: booking.flight || "", travelDate: booking.travel_date, departureAirport: booking.airport, bagCount: booking.bags, idempotencyKey, passengers: passengers.filter(Boolean) as NonNullable<typeof passengers[number]>[] });
    const { data: existing } = await supabase.from("partner_check_in_jobs").select("id, state").eq("provider_id", RJ_PROVIDER_ID).eq("idempotency_key", idempotencyKey).maybeSingle<{ id: string; state: string }>();
    if (existing && existing.state !== "failed") return NextResponse.json({ ok: true, idempotent: true, job: existing });
    const { data: job, error: jobError } = await supabase.from("partner_check_in_jobs").upsert({ provider_id: RJ_PROVIDER_ID, booking_id: bookingId, idempotency_key: idempotencyKey, request_fingerprint: fingerprint(input), identity_verification_id: passengers[0]!.identityReference, mode: readiness.mode, state: "requested", flight_number: input.flightNumber, departure_airport: input.departureAirport, travel_date: input.travelDate, bag_count: input.bagCount, passenger_manifest: booking.passenger_manifest, requested_by: session.email }, { onConflict: "provider_id,idempotency_key" }).select("id").single<{ id: string }>();
    if (jobError || !job) return bad("Could not create the RJ check-in job.", 500);
    let result;
    try {
      result = await executeRjGatewayCheckIn(input);
    } catch (gatewayError) {
      const known = gatewayError instanceof RjIntegrationError ? gatewayError : new RjIntegrationError("check_in_failed", "RJ check-in failed safely.", 500);
      await supabase.from("partner_check_in_jobs").update({ state: "manual_review", last_error_code: known.code }).eq("id", job.id);
      throw known;
    }
    const { error: resultError } = await supabase.from("partner_check_in_jobs").update({ state: result.state, external_check_in_reference: result.checkInReference, bag_tag_references: result.bagTags, tag_activation_state: result.tagActivationState }).eq("id", job.id);
    if (resultError) return bad("RJ response requires local reconciliation.", 502);
    await supabase.from("bookings").update({ external_status: String(result.state), external_synced_at: new Date().toISOString() }).eq("id", bookingId);
    return NextResponse.json({ ok: true, idempotent: false, job: { id: job.id, state: result.state, checkInReference: result.checkInReference } });
  } catch (error) {
    const known = error instanceof RjIntegrationError ? error : new RjIntegrationError("check_in_failed", "RJ check-in failed safely.", 500);
    return bad(known.message, known.httpStatus, { code: known.code });
  }
}
