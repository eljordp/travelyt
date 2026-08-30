import { NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import { isBookingPassengerArray } from "@/lib/passengers";
import { airportLocalTimeToInstant } from "@/lib/booking-time";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Any custody start freezes group changes. This protects per-passenger bag
// attribution and makes the exception log the source of truth after pickup.
const PRE_CUSTODY = new Set(["pending", "paid", "assigned", "accepted", "en_route", "arrived"]);
const MAX_NOTE = 500;
function bad(error: string, status = 400) { return NextResponse.json({ ok: false, error }, { status }); }

export async function POST(request: Request) {
  const session = await getVerifiedAdminSession(request);
  if (!session || session.role !== "admin") return bad("Full admin access is required.", 403);
  const supabase = getSupabaseAdmin(); if (!supabase) return bad("Booking backend is not configured.", 503);
  const body = await request.json().catch(() => ({})) as {
    action?: "resolve_group" | "handoff_refused" | "return_started" | "return_completed" | "dispatch_eta" | "offline_reconcile";
    bookingId?: string; removePassengerId?: string; bagAssignments?: Record<string, number>;
    projectedHandoffAt?: string; reasonCode?: string; note?: string; returnReference?: string; proofDigest?: string;
  };
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";
  const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode.trim().slice(0, 80) : "manual";
  if (!bookingId || !body.action) return bad("Booking and workflow action are required.");
  const { data: booking, error } = await supabase.from("bookings")
    .select("id, status, bags, airport, flight_time, travel_date, passenger_manifest, issue_type, issue_notes")
    .eq("id", bookingId).maybeSingle<{ id: string; status: string; bags: number; airport: string; flight_time: string | null; travel_date: string; passenger_manifest: unknown; issue_type: string | null; issue_notes: string | null }>();
  if (error || !booking) return bad("Booking was not found.", 404);
  const event = async (kind: string, payload: Record<string, unknown> = {}) => {
    const { error: eventError } = await supabase.from("booking_exception_events").insert({ booking_id: bookingId, kind, reason_code: reasonCode, note: note || null, actor_name: session.email, payload });
    if (eventError) throw eventError;
  };
  try {
    if (body.action === "resolve_group") {
      if (!PRE_CUSTODY.has(booking.status)) return bad("Group changes are frozen once custody starts.", 409);
      if (!isBookingPassengerArray(booking.passenger_manifest)) return bad("Traveler manifest is unavailable.", 409);
      const removedId = typeof body.removePassengerId === "string" ? body.removePassengerId : "";
      const removed = booking.passenger_manifest.find((passenger) => passenger.id === removedId);
      if (!removed || removed.category === "account_holder") return bad("Only an added traveler can be removed.", 409);
      const assignments = body.bagAssignments ?? {};
      const manifest = booking.passenger_manifest.filter((passenger) => passenger.id !== removedId).map((passenger) => ({ ...passenger, bags: Number(assignments[passenger.id]) }));
      if (manifest.some((passenger) => !Number.isInteger(passenger.bags) || passenger.bags < 0)) return bad("Assign a whole-number bag count to every remaining traveler.");
      if (manifest.reduce((sum, passenger) => sum + passenger.bags, 0) !== booking.bags) return bad("Bag assignments must reconcile to the booking total.", 409);
      const { error: updateError } = await supabase.from("bookings").update({ passenger_manifest: manifest }).eq("id", bookingId);
      if (updateError) return bad("Could not save the group resolution.", 500);
      await supabase.from("partner_check_in_jobs").update({ state: "manual_review", last_error_code: "manifest_changed" }).eq("booking_id", bookingId).in("state", ["requested", "reservation_verified", "eligible", "checked_in", "tags_issued_inactive", "handoff_ready"]);
      await event("group_resolution", { removedPassengerId: removedId, bagAssignments: assignments, pricing: "manual_review_required" });
      return NextResponse.json({ ok: true, status: "resolved", pricing: "manual_review_required" });
    }
    if (body.action === "dispatch_eta") {
      if (!PRE_CUSTODY.has(booking.status)) return bad("Dispatch ETA is not available after custody starts.", 409);
      const projected = typeof body.projectedHandoffAt === "string" ? Date.parse(body.projectedHandoffAt) : NaN;
      const departure = booking.flight_time ? airportLocalTimeToInstant(booking.travel_date, booking.flight_time, booking.airport).getTime() : NaN;
      if (Number.isNaN(projected) || Number.isNaN(departure)) return bad("A valid projected handoff and flight time are required.");
      // RJ264 ORD 20:00 pilot policy: planned 16:15, hard internal no-go 17:00.
      const internalCutoff = departure - 180 * 60_000;
      const noGo = projected > internalCutoff;
      await event("dispatch_no_go", { projectedHandoffAt: body.projectedHandoffAt, internalCutoffAt: new Date(internalCutoff).toISOString(), noGo });
      if (noGo) {
        const { error: noGoError } = await supabase.from("bookings").update({ status: "issue", issue_type: "capacity_hold", issue_notes: "Dispatch ETA crossed the 3-hour internal handoff rule." }).eq("id", bookingId);
        if (noGoError) return bad("Could not hold the booking after the dispatch no-go.", 500);
      }
      return NextResponse.json({ ok: true, noGo, internalCutoffAt: new Date(internalCutoff).toISOString() });
    }
    if (body.action === "handoff_refused") {
      if (booking.status !== "picked_up") return bad("A handoff refusal requires active Travelyt custody.", 409);
      const { error: refusalError } = await supabase.from("bookings").update({ status: "issue", issue_type: "airport_hold", issue_notes: note || "Airline handoff refused; return workflow required." }).eq("id", bookingId);
      if (refusalError) return bad("Could not record handoff refusal.", 500);
      await event("handoff_refused"); return NextResponse.json({ ok: true, status: "return_required" });
    }
    if (body.action === "return_started") {
      if (booking.status !== "issue") return bad("Open an issue before starting a return.", 409);
      await event("return_started"); return NextResponse.json({ ok: true, status: "return_in_progress" });
    }
    if (body.action === "return_completed") {
      const reference = typeof body.returnReference === "string" ? body.returnReference.trim().slice(0, 160) : "";
      if (booking.status !== "issue" || !reference) return bad("A return reference is required to complete a custody return.", 409);
      await event("return_completed", { returnReference: reference }); return NextResponse.json({ ok: true, status: "returned_to_customer" });
    }
    if (body.action === "offline_reconcile") {
      const proofDigest = typeof body.proofDigest === "string" ? body.proofDigest.trim() : "";
      if (!/^[a-f0-9]{64}$/i.test(proofDigest)) return bad("A SHA-256 proof digest is required for offline reconciliation.", 409);
      await event("offline_reconciled", { proofDigest }); return NextResponse.json({ ok: true, status: "offline_reconciled" });
    }
    return bad("Unsupported workflow action.");
  } catch (error) {
    console.error("Booking workflow failed", error); return bad("Could not record the controlled workflow action.", 500);
  }
}
