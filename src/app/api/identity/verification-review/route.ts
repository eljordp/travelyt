import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
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

  const session = getAdminSession(request);
  if (!session || session.role !== "admin") {
    return bad("Full admin access is required.", 403);
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Identity backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    passengerId?: string;
    action?: "verify" | "reject";
    reason?: string;
    evidenceReference?: string;
  };
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const passengerId = typeof body.passengerId === "string" ? body.passengerId.trim() : "";
  const action = body.action;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const evidenceReference = typeof body.evidenceReference === "string"
    ? body.evidenceReference.trim().slice(0, 200)
    : "";

  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bookingId)) return bad("Booking ID is invalid.");
  if (!/^[0-9a-f-]{36}$/i.test(passengerId)) return bad("Traveler ID is invalid.");
  if (action !== "verify" && action !== "reject") return bad("Review action is invalid.");
  if (action === "reject" && !reason) return bad("A rejection reason is required.");
  if (action === "verify" && evidenceReference.length < 6) {
    return bad("Record the document or approved-provider reference used for this review.");
  }

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
  const status = action === "verify" ? "verified" : "rejected";
  const { error: reviewError } = await supabase
    .from("identity_verifications")
    .update({
      status,
      verified_at: action === "verify" ? reviewedAt : null,
      liveness_status: action === "verify" ? "passed" : "failed",
      metadata: {
        ...(verification.metadata ?? {}),
        reviewed_by: session.email,
        reviewed_at: reviewedAt,
        review_reason: reason || undefined,
        review_evidence_reference: evidenceReference || undefined,
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
          verificationStatus: status,
          identityVerifiedAt: action === "verify" ? reviewedAt : undefined,
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
      verificationStatus: status,
      identityVerifiedAt: action === "verify" ? reviewedAt : undefined,
    },
  });
}
