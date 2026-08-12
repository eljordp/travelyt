import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { BookingAuditEntry } from "@/lib/bookings";
import type { BookingRow } from "@/lib/booking-mappers";
import { BOOKING_SELECT_COLUMNS, rowToBooking } from "@/lib/booking-mappers";
import {
  agentReadinessBlockers,
  assignmentAcceptanceBlockers,
  type AcceptanceChecklist,
  type AgentAssignmentRow,
  type AgentReadinessProfileRow,
  type DriverAccessReadinessRow,
} from "@/lib/agent-assignment";
import { authorizeDriverRequest } from "@/lib/driver-access-server";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function bad(error: string, status = 400, details?: string[]) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

function hashEvidence(value: string) {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

function publicAssignment(row: AgentAssignmentRow, primaryName: string, backupName: string) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    primaryDriverAccessId: row.primary_driver_access_id,
    primaryDriverName: primaryName,
    backupDriverAccessId: row.backup_driver_access_id,
    backupDriverName: backupName,
    status: row.status,
    assignedAt: row.assigned_at,
    acceptanceDueAt: row.acceptance_due_at,
    acceptedAt: row.accepted_at ?? undefined,
  };
}

async function loadAssignmentContext(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  bookingId: string,
) {
  const [{ data: assignment, error: assignmentError }, { data: booking, error: bookingError }] =
    await Promise.all([
      supabase.from("booking_agent_assignments").select("*").eq("booking_id", bookingId)
        .in("status", ["assigned", "accepted"]).order("assigned_at", { ascending: false })
        .limit(1).maybeSingle<AgentAssignmentRow>(),
      supabase.from("bookings").select(BOOKING_SELECT_COLUMNS).eq("id", bookingId).maybeSingle<BookingRow>(),
    ]);
  return { assignment, assignmentError, booking, bookingError };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "drivers:assignments:get", 90);
  if (limited) return limited;
  const driver = await authorizeDriverRequest(request);
  if (!driver.ok || !driver.driverAccessId) {
    return bad("An individual database-backed agent session is required.", 401);
  }
  const bookingId = new URL(request.url).searchParams.get("bookingId")?.trim();
  if (!bookingId) return bad("Booking ID is required.");
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Agent assignment backend is not configured.", 503);
  const context = await loadAssignmentContext(supabase, bookingId);
  if (context.assignmentError || context.bookingError) {
    return bad("Could not load the agent assignment.", 500);
  }
  if (!context.assignment || !context.booking) return bad("Active assignment not found.", 404);
  if (![context.assignment.primary_driver_access_id, context.assignment.backup_driver_access_id]
    .includes(driver.driverAccessId)) {
    return bad("This assignment is not connected to your agent account.", 403);
  }
  const { data: names } = await supabase.from("driver_access_codes")
    .select("id, driver_name")
    .in("id", [context.assignment.primary_driver_access_id, context.assignment.backup_driver_access_id]);
  const byId = new Map((names ?? []).map((row) => [row.id as string, row.driver_name as string]));
  return NextResponse.json({
    ok: true,
    assignment: publicAssignment(
      context.assignment,
      byId.get(context.assignment.primary_driver_access_id) ?? "Primary agent",
      byId.get(context.assignment.backup_driver_access_id) ?? "Backup agent",
    ),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "drivers:assignments:post", 30);
  if (limited) return limited;
  const driver = await authorizeDriverRequest(request);
  if (!driver.ok || !driver.driverAccessId || driver.source === "env") {
    return bad("An individual database-backed agent session is required.", 401);
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Agent assignment backend is not configured.", 503);
  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    action?: "accept" | "decline";
    checklist?: AcceptanceChecklist;
    reason?: string;
  };
  const bookingId = body.bookingId?.trim();
  if (!bookingId) return bad("Booking ID is required.");
  if (body.action !== "accept" && body.action !== "decline") {
    return bad("Select accept or decline.");
  }
  const context = await loadAssignmentContext(supabase, bookingId);
  if (context.assignmentError || context.bookingError) {
    return bad("Could not load the agent assignment.", 500);
  }
  const assignment = context.assignment;
  const booking = context.booking;
  if (!assignment || !booking) return bad("Active assignment not found.", 404);
  if (assignment.primary_driver_access_id !== driver.driverAccessId) {
    return bad("Only the assigned primary agent can respond. Dispatch controls backup promotion.", 403);
  }
  if (assignment.status === "accepted" && body.action === "accept") {
    return NextResponse.json({ ok: true, assignment, booking: rowToBooking(booking), idempotent: true });
  }
  if (assignment.status !== "assigned") return bad("This assignment is no longer awaiting a response.", 409);
  const now = new Date();
  const timestamp = now.toISOString();
  const history: BookingAuditEntry[] = Array.isArray(booking.status_history)
    ? [...booking.status_history]
    : [];

  if (body.action === "decline") {
    const reason = body.reason?.trim().slice(0, 500);
    if (!reason) return bad("Record a reason before declining the assignment.");
    const { error: declineError } = await supabase.from("booking_agent_assignments").update({
      status: "declined",
      decline_reason: reason,
      closed_at: timestamp,
      updated_at: timestamp,
    }).eq("id", assignment.id).eq("status", "assigned");
    if (declineError) return bad("Could not decline the assignment.", 500);
    history.push({
      id: crypto.randomUUID(), action: "status_change", fromStatus: booking.status,
      toStatus: "paid", actorRole: "driver", actorName: driver.driverName,
      reason: `Primary agent declined assignment: ${reason}`, timestamp,
    });
    const { data: updated, error: updateError } = await supabase.from("bookings").update({
      status: "paid", driver_name: null, assigned_at: null, accepted_at: null,
      driver_identity_verified_at: null, status_history: history,
    }).eq("id", bookingId).select(BOOKING_SELECT_COLUMNS).single<BookingRow>();
    if (updateError || !updated) return bad("Assignment declined, but dispatch reconciliation is required.", 502);
    return NextResponse.json({ ok: true, booking: rowToBooking(updated), status: "declined" });
  }

  if (Date.parse(assignment.acceptance_due_at) <= now.getTime()) {
    await supabase.from("booking_agent_assignments").update({
      status: "expired", closed_at: timestamp, updated_at: timestamp,
    }).eq("id", assignment.id).eq("status", "assigned");
    history.push({
      id: crypto.randomUUID(), action: "status_change", fromStatus: booking.status,
      toStatus: "paid", actorRole: "system", actorName: "Travelyt system",
      reason: "Primary-agent acceptance deadline expired; returned to dispatch queue.", timestamp,
    });
    await supabase.from("bookings").update({
      status: "paid", driver_name: null, assigned_at: null, accepted_at: null,
      driver_identity_verified_at: null, status_history: history,
    }).eq("id", bookingId).eq("status", "assigned");
    return bad("The acceptance deadline passed. Dispatch must promote the backup or reassign.", 409);
  }
  const acceptanceBlockers = assignmentAcceptanceBlockers({
    assignment,
    driverAccessId: driver.driverAccessId,
    checklist: body.checklist,
    now,
  });
  if (acceptanceBlockers.length) {
    return bad("Complete every acceptance confirmation.", 409, acceptanceBlockers);
  }
  const [{ data: access }, { data: readiness }] = await Promise.all([
    supabase.from("driver_access_codes").select("id, driver_name, status, expires_at")
      .eq("id", driver.driverAccessId).maybeSingle<DriverAccessReadinessRow>(),
    supabase.from("agent_readiness_profiles").select("*")
      .eq("driver_access_id", driver.driverAccessId).maybeSingle<AgentReadinessProfileRow>(),
  ]);
  const readinessBlockers = agentReadinessBlockers(access, readiness, now);
  if (readinessBlockers.length) {
    return bad("Agent readiness changed after assignment.", 409, readinessBlockers);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip") || "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const { data: accepted, error: acceptError } = await supabase
    .from("booking_agent_assignments")
    .update({
      status: "accepted",
      accepted_at: timestamp,
      accepted_by_driver_access_id: driver.driverAccessId,
      acceptance_checklist: body.checklist,
      accepted_ip_hash: hashEvidence(ip),
      accepted_user_agent_hash: hashEvidence(userAgent),
      updated_at: timestamp,
    })
    .eq("id", assignment.id)
    .eq("status", "assigned")
    .select("*")
    .single<AgentAssignmentRow>();
  if (acceptError || !accepted) return bad("Could not accept this assignment.", 409);
  history.push({
    id: crypto.randomUUID(), action: "status_change", fromStatus: booking.status,
    toStatus: "accepted", actorRole: "driver", actorName: driver.driverName,
    reason: "Primary agent accepted and confirmed availability, device, seal kit, and approved vehicle.",
    timestamp,
  });
  const { data: updated, error: updateError } = await supabase.from("bookings").update({
    status: "accepted", accepted_at: timestamp,
    driver_name: access!.driver_name,
    driver_identity_verified_at: readiness!.identity_verified_at,
    status_history: history,
  }).eq("id", bookingId).eq("status", "assigned")
    .select(BOOKING_SELECT_COLUMNS).single<BookingRow>();
  if (updateError || !updated) {
    await supabase.from("booking_agent_assignments").update({
      status: "assigned", accepted_at: null, accepted_by_driver_access_id: null,
      acceptance_checklist: {}, accepted_ip_hash: null, accepted_user_agent_hash: null,
      updated_at: new Date().toISOString(),
    }).eq("id", assignment.id).eq("status", "accepted");
    return bad("Acceptance was not attached to the booking; retry before beginning route.", 502);
  }
  const { data: backup } = await supabase.from("driver_access_codes").select("driver_name")
    .eq("id", accepted.backup_driver_access_id).maybeSingle<{ driver_name: string }>();
  return NextResponse.json({
    ok: true,
    assignment: publicAssignment(accepted, access!.driver_name, backup?.driver_name ?? "Backup agent"),
    booking: rowToBooking(updated),
  });
}
