import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { BookingRow } from "@/lib/booking-mappers";
import { BOOKING_SELECT_COLUMNS, rowToBooking } from "@/lib/booking-mappers";
import {
  type AcceptanceChecklist,
  type AgentAssignmentRow,
} from "@/lib/agent-assignment";
import {
  agentAssignmentTransitionFailure,
  type AgentAssignmentTransitionResult,
} from "@/lib/agent-assignment-transition";
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
    assignmentId?: string;
    action?: "accept" | "decline";
    checklist?: AcceptanceChecklist;
    reason?: string;
  };
  const bookingId = body.bookingId?.trim();
  if (!bookingId) return bad("Booking ID is required.");
  const assignmentId = body.assignmentId?.trim();
  if (!assignmentId) return bad("The exact assignment ID is required. Refresh the job and try again.");
  if (body.action !== "accept" && body.action !== "decline") {
    return bad("Select accept or decline.");
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip") || "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const { data, error } = await supabase.rpc("transition_agent_assignment", {
    p_action: body.action,
    p_booking_id: bookingId,
    p_expected_assignment_id: assignmentId,
    p_primary_driver_access_id: null,
    p_backup_driver_access_id: null,
    p_driver_access_id: driver.driverAccessId,
    p_acceptance_minutes: 10,
    p_acceptance_checklist: body.checklist ?? {},
    p_reason: body.reason?.trim().slice(0, 500) || null,
    p_actor_role: "driver",
    p_actor_name: null,
    p_ip_hash: hashEvidence(ip),
    p_user_agent_hash: hashEvidence(userAgent),
  });
  if (error) {
    const failure = agentAssignmentTransitionFailure(error, `Could not ${body.action} this assignment.`);
    return bad(failure.message, failure.status);
  }
  const transition = data as AgentAssignmentTransitionResult | null;
  if (!transition?.assignment || !transition.booking) {
    return bad("Atomic driver response returned an incomplete result.", 500);
  }
  if (transition.outcome === "expired") {
    return NextResponse.json({
      ok: false,
      error: "The acceptance deadline passed. Dispatch must promote the backup or reassign.",
      booking: rowToBooking(transition.booking),
      assignment: publicAssignment(
        transition.assignment,
        transition.primaryDriverName,
        transition.backupDriverName,
      ),
    }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    status: transition.outcome,
    idempotent: transition.idempotent,
    assignment: publicAssignment(
      transition.assignment,
      transition.primaryDriverName,
      transition.backupDriverName,
    ),
    booking: rowToBooking(transition.booking),
  });
}
