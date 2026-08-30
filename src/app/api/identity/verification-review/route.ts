import { NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  isBookingPassengerArray,
  passengerDisplayName,
} from "@/lib/passengers";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "identity:review", 40);
  if (limited) return limited;

  const session = await getVerifiedAdminSession(request);
  if (!session || session.role !== "admin") {
    return bad("Full admin access is required.", 403);
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Identity backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    passengerId?: string;
    action?: "reject";
    reason?: string;
  };
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const passengerId = typeof body.passengerId === "string" ? body.passengerId.trim() : "";
  const action = body.action;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bookingId)) return bad("Booking ID is invalid.");
  if (!/^[0-9a-f-]{36}$/i.test(passengerId)) return bad("Traveler ID is invalid.");
  if (action !== "reject") {
    return bad("Only a provider-signed identity result can mark a traveler verified.", 403);
  }
  if (!reason) return bad("A rejection reason is required.");

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, passenger_manifest")
    .eq("id", bookingId)
    .maybeSingle<{ id: string; passenger_manifest: unknown }>();
  if (bookingError) return bad("Could not load traveler manifest.", 500);
  if (!booking || !isBookingPassengerArray(booking.passenger_manifest)) {
    return bad("Traveler manifest was not found.", 404);
  }
  const passenger = booking.passenger_manifest.find((item) => item.id === passengerId);
  if (!passenger) return bad("Traveler was not found.", 404);
  if (passenger.verificationMethod !== "self_service") {
    return bad("This review endpoint is only for an adult completing separate verification.", 409);
  }

  const { data: verification, error: verificationError } = await supabase
    .from("identity_verifications")
    .select("id, status, consent_at, metadata")
    .eq("booking_id", bookingId)
    .eq("passenger_id", passengerId)
    .in("status", ["pending", "manual_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      status: string;
      consent_at: string | null;
      metadata: Record<string, unknown> | null;
    }>();
  if (verificationError) return bad("Could not load identity review.", 500);
  if (!verification) return bad("No pending identity review exists for this traveler.", 409);
  if (!verification.consent_at) {
    return bad("This adult must use their private email link and consent before review.", 409);
  }

  const reviewedAt = new Date().toISOString();
  const { error: reviewError } = await supabase
    .from("identity_verifications")
    .update({
      status: "rejected",
      verified_at: null,
      liveness_status: "failed",
      metadata: {
        ...(verification.metadata ?? {}),
        reviewed_by: session.email,
        reviewed_at: reviewedAt,
        review_reason: reason,
        claimed_date_of_birth: passenger.dateOfBirth,
        claimed_relationship: passenger.relationship,
        raw_document_stored_by_travelyt: false,
      },
    })
    .eq("id", verification.id)
    .in("status", ["pending", "manual_review"]);
  if (reviewError) return bad("Could not save identity review.", 500);

  const updatedManifest = booking.passenger_manifest.map((item) =>
    item.id === passengerId
      ? {
          ...item,
          verificationStatus: "rejected" as const,
          identityVerifiedAt: undefined,
        }
      : item
  );
  const { error: manifestError } = await supabase
    .from("bookings")
    .update({ passenger_manifest: updatedManifest })
    .eq("id", bookingId);
  if (manifestError) {
    return bad("Identity review saved, but traveler manifest reconciliation is required.", 502);
  }

  return NextResponse.json({
    ok: true,
    passenger: {
      id: passenger.id,
      name: passengerDisplayName(passenger),
      verificationStatus: "rejected",
      identityVerifiedAt: undefined,
    },
  });
}
