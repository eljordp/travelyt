import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  BOOKING_SELECT_COLUMNS,
  rowToBooking,
  type BookingRow,
} from "@/lib/booking-mappers";
import type {
  PilotEligibilitySnapshot,
  PilotEligibilityStatus,
} from "@/lib/bookings";
import {
  missingPilotChecks,
  PILOT_APPROVAL_WINDOW_MINUTES,
} from "@/lib/pilot-eligibility";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DECISIONS = new Set<PilotEligibilityStatus>([
  "approved",
  "waitlisted",
  "declined",
]);

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const session = getAdminSession(request);
  if (!session || session.role !== "admin") {
    return bad("Full admin access is required.", 403);
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    decision?: PilotEligibilityStatus;
    reason?: string;
    snapshot?: PilotEligibilitySnapshot;
  };
  const bookingId = body.bookingId?.trim();
  const decision = body.decision;
  const reason = body.reason?.trim().slice(0, 500);
  if (!bookingId || !decision || !DECISIONS.has(decision)) {
    return bad("Booking and a supported eligibility decision are required.");
  }
  if (!reason || reason.length < 8) {
    return bad("Record a specific eligibility reason of at least 8 characters.");
  }

  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT_COLUMNS)
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();
  if (loadError) return bad("Could not load the booking.", 500);
  if (!existing) return bad("Booking not found.", 404);
  if (existing.status !== "pending") {
    return bad("Eligibility can only be decided before payment or custody begins.", 409);
  }
  if ((existing.pilot_eligibility_status ?? "pending") !== "pending") {
    return bad("This request already has a final eligibility decision.", 409);
  }

  const snapshot: PilotEligibilitySnapshot = {
    ...(body.snapshot ?? {}),
    airport: existing.airport,
    service: existing.service === "both" ? undefined : existing.service,
  };
  if (decision === "approved") {
    const missing = missingPilotChecks(snapshot);
    if (missing.length > 0) {
      return bad(`Approval is fail-closed. Confirm: ${missing.join(", ")}.`, 409);
    }
  }

  const decidedAt = new Date();
  const expiresAt =
    decision === "approved"
      ? new Date(
          decidedAt.getTime() + PILOT_APPROVAL_WINDOW_MINUTES * 60_000
        ).toISOString()
      : null;
  const update = {
    pilot_eligibility_status: decision,
    pilot_eligibility_decided_at: decidedAt.toISOString(),
    pilot_eligibility_decided_by: session.email,
    pilot_eligibility_reason: reason,
    pilot_eligibility_expires_at: expiresAt,
    pilot_eligibility_snapshot: snapshot,
  };
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update(update)
    .eq("id", bookingId)
    .eq("status", "pending")
    .eq("pilot_eligibility_status", "pending")
    .select(BOOKING_SELECT_COLUMNS)
    .maybeSingle<BookingRow>();
  if (updateError) return bad("Could not save the eligibility decision.", 500);
  if (!updated) return bad("The booking changed before this decision was saved.", 409);

  const { error: eventError } = await supabase
    .from("booking_exception_events")
    .insert({
      booking_id: bookingId,
      kind: "pilot_eligibility_decision",
      reason_code: decision,
      note: reason,
      actor_name: session.email,
      payload: { snapshot, expiresAt },
    });
  if (eventError) {
    console.error("Pilot eligibility audit event failed", eventError);
    return bad("Eligibility was saved, but its audit event failed. Stop and investigate.", 500);
  }

  return NextResponse.json({ ok: true, booking: rowToBooking(updated) });
}
