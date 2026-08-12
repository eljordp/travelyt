import { NextResponse } from "next/server";
import type { BookingAuditEntry } from "@/lib/bookings";
import type { BookingRow } from "@/lib/booking-mappers";
import { BOOKING_SELECT_COLUMNS, rowToBooking } from "@/lib/booking-mappers";
import { getAdminSession } from "@/lib/admin-auth";
import {
  agentReadinessBlockers,
  bookingAssignmentBlockers,
  normalizeAcceptanceMinutes,
  type AgentAssignmentRow,
  type AgentReadinessProfileRow,
  type DriverAccessReadinessRow,
} from "@/lib/agent-assignment";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function bad(error: string, status = 400, details?: string[]) {
  return NextResponse.json({ ok: false, error, details }, { status });
}

function tableMissing(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42P01" || /booking_agent_assignments|agent_readiness_profiles/i.test(error.message ?? "")
  ));
}

function publicAssignment(row: AgentAssignmentRow, names: Map<string, string>) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    primaryDriverAccessId: row.primary_driver_access_id,
    primaryDriverName: names.get(row.primary_driver_access_id) ?? "Unknown agent",
    backupDriverAccessId: row.backup_driver_access_id,
    backupDriverName: names.get(row.backup_driver_access_id) ?? "Unknown agent",
    status: row.status,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    acceptanceDueAt: row.acceptance_due_at,
    acceptedAt: row.accepted_at ?? undefined,
    declineReason: row.decline_reason ?? undefined,
  };
}

async function driverNames(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabase
    .from("driver_access_codes")
    .select("id, driver_name")
    .in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((row) => [row.id as string, row.driver_name as string]));
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "ops:agent-assignments:get", 60);
  if (limited) return limited;
  if (!getAdminSession(request)) return bad("Operations access is required.", 401);
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Agent assignment backend is not configured.", 503);
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId")?.trim();
  let query = supabase
    .from("booking_agent_assignments")
    .select("*")
    .order("assigned_at", { ascending: false })
    .limit(200);
  if (bookingId) query = query.eq("booking_id", bookingId);
  const { data, error } = await query;
  if (error) {
    if (tableMissing(error)) return bad("Apply migration 030 before using agent assignments.", 409);
    return bad("Could not load agent assignments.", 500);
  }
  const rows = (data ?? []) as AgentAssignmentRow[];
  const names = await driverNames(supabase, rows.flatMap((row) => [
    row.primary_driver_access_id,
    row.backup_driver_access_id,
  ]));
  return NextResponse.json({
    ok: true,
    assignments: rows.map((row) => publicAssignment(row, names)),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ops:agent-assignments:post", 30);
  if (limited) return limited;
  const session = getAdminSession(request);
  if (!session) return bad("Operations access is required.", 401);
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Agent assignment backend is not configured.", 503);
  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    primaryDriverAccessId?: string;
    backupDriverAccessId?: string;
    acceptanceMinutes?: number;
    reason?: string;
  };
  const bookingId = body.bookingId?.trim();
  const primaryId = body.primaryDriverAccessId?.trim();
  const backupId = body.backupDriverAccessId?.trim();
  if (!bookingId || !primaryId || !backupId) {
    return bad("Booking, primary agent, and backup agent are required.");
  }
  if (primaryId === backupId) return bad("Primary and backup agents must be different.");

  const [{ data: booking, error: bookingError }, { data: current, error: currentError }] =
    await Promise.all([
      supabase.from("bookings").select(BOOKING_SELECT_COLUMNS).eq("id", bookingId).maybeSingle<BookingRow>(),
      supabase.from("booking_agent_assignments").select("*").eq("booking_id", bookingId)
        .in("status", ["assigned", "accepted"]).order("assigned_at", { ascending: false })
        .limit(1).maybeSingle<AgentAssignmentRow>(),
    ]);
  if (bookingError) return bad("Could not load booking.", 500);
  if (currentError) {
    if (tableMissing(currentError)) return bad("Apply migration 030 before assigning agents.", 409);
    return bad("Could not check current assignment.", 500);
  }
  if (!booking) return bad("Booking not found.", 404);
  if (current?.status === "accepted") {
    return bad("An accepted assignment cannot be replaced from this checkpoint.", 409);
  }
  const now = new Date();
  const reassignment = booking.status === "assigned" && Boolean(current);
  if (booking.status === "accepted" && !current) {
    return bad("This booking is already accepted and requires operations reconciliation.", 409);
  }
  const bookingForGate = reassignment ? { ...booking, status: "paid" as const } : booking;
  const bookingBlockers = bookingAssignmentBlockers(bookingForGate, now);
  if (bookingBlockers.length) {
    return bad("Booking is not ready for agent assignment.", 409, bookingBlockers);
  }
  if (reassignment && !body.reason?.trim()) {
    return bad("Record a reason before replacing an awaiting assignment.");
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("driver_access_codes")
    .select("id, driver_name, status, expires_at")
    .in("id", [primaryId, backupId]);
  if (accessError) return bad("Could not load individual agent access.", 500);
  const accessById = new Map(
    ((accessRows ?? []) as DriverAccessReadinessRow[]).map((row) => [row.id, row]),
  );
  const { data: readinessRows, error: readinessError } = await supabase
    .from("agent_readiness_profiles")
    .select("*")
    .in("driver_access_id", [primaryId, backupId]);
  if (readinessError) {
    if (tableMissing(readinessError)) return bad("Apply migration 030 before assigning agents.", 409);
    return bad("Could not load agent readiness evidence.", 500);
  }
  const readinessById = new Map(
    ((readinessRows ?? []) as AgentReadinessProfileRow[]).map((row) => [row.driver_access_id, row]),
  );
  const primaryBlockers = agentReadinessBlockers(accessById.get(primaryId), readinessById.get(primaryId), now);
  const backupBlockers = agentReadinessBlockers(accessById.get(backupId), readinessById.get(backupId), now);
  const readinessBlockers = [
    ...primaryBlockers.map((item) => `Primary: ${item}`),
    ...backupBlockers.map((item) => `Backup: ${item}`),
  ];
  if (readinessBlockers.length) {
    return bad("Primary and backup readiness must be current.", 409, readinessBlockers);
  }

  const { data: activeAssignments, error: activeError } = await supabase
    .from("booking_agent_assignments")
    .select("booking_id, primary_driver_access_id, backup_driver_access_id")
    .in("status", ["assigned", "accepted"])
    .limit(500);
  if (activeError) return bad("Could not check agent schedules.", 500);
  const possibleConflicts = (activeAssignments ?? []).filter((assignment) =>
    assignment.booking_id !== bookingId &&
    [primaryId, backupId].some((id) =>
      assignment.primary_driver_access_id === id || assignment.backup_driver_access_id === id,
    ),
  );
  if (possibleConflicts.length) {
    const { data: conflictBookings, error: conflictError } = await supabase
      .from("bookings")
      .select("id, travel_date")
      .in("id", possibleConflicts.map((row) => row.booking_id))
      .eq("travel_date", booking.travel_date)
      .limit(1);
    if (conflictError) return bad("Could not check agent schedules.", 500);
    if (conflictBookings?.length) {
      return bad("A selected agent already has an active primary or backup assignment on this travel date.", 409);
    }
  }

  const assignedAt = now.toISOString();
  const acceptanceDueAt = new Date(
    now.getTime() + normalizeAcceptanceMinutes(body.acceptanceMinutes) * 60_000,
  ).toISOString();
  if (current) {
    const { error: closeError } = await supabase.from("booking_agent_assignments").update({
      status: "superseded",
      decline_reason: body.reason?.trim().slice(0, 500) || "Reassigned by dispatch.",
      closed_at: assignedAt,
      updated_at: assignedAt,
    }).eq("id", current.id).eq("status", "assigned");
    if (closeError) return bad("Could not close the previous assignment.", 500);
  }
  const { data: assignment, error: insertError } = await supabase
    .from("booking_agent_assignments")
    .insert({
      booking_id: bookingId,
      primary_driver_access_id: primaryId,
      backup_driver_access_id: backupId,
      status: "assigned",
      assigned_by: session.email,
      assigned_at: assignedAt,
      acceptance_due_at: acceptanceDueAt,
      updated_at: assignedAt,
    })
    .select("*")
    .single<AgentAssignmentRow>();
  if (insertError || !assignment) {
    if (current) {
      await supabase.from("booking_agent_assignments").update({
        status: "assigned",
        decline_reason: null,
        closed_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).eq("status", "superseded");
    }
    console.error("Agent assignment insert failed", insertError);
    return bad("Could not create the agent assignment.", 500);
  }
  const primaryName = accessById.get(primaryId)!.driver_name;
  const history: BookingAuditEntry[] = Array.isArray(booking.status_history)
    ? [...booking.status_history]
    : [];
  history.push({
    id: crypto.randomUUID(),
    action: "status_change",
    fromStatus: booking.status,
    toStatus: "assigned",
    actorRole: session.role,
    actorName: session.email,
    reason: body.reason?.trim() || `Assigned primary agent ${primaryName} with a verified backup.`,
    timestamp: assignedAt,
  });
  const { data: updatedBooking, error: updateError } = await supabase
    .from("bookings")
    .update({
      status: "assigned",
      driver_name: primaryName,
      assigned_at: assignedAt,
      accepted_at: null,
      driver_identity_verified_at: readinessById.get(primaryId)!.identity_verified_at,
      status_history: history,
    })
    .eq("id", bookingId)
    .select(BOOKING_SELECT_COLUMNS)
    .single<BookingRow>();
  if (updateError || !updatedBooking) {
    await supabase.from("booking_agent_assignments").update({
      status: "revoked", closed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", assignment.id);
    return bad("Assignment was recorded but the booking could not be updated; it was revoked.", 502);
  }
  const names = new Map([[primaryId, primaryName], [backupId, accessById.get(backupId)!.driver_name]]);
  return NextResponse.json({
    ok: true,
    assignment: publicAssignment(assignment, names),
    booking: rowToBooking(updatedBooking),
  });
}
