import { NextResponse } from "next/server";
import { rowToBooking } from "@/lib/booking-mappers";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import {
  normalizeAcceptanceMinutes,
  type AgentAssignmentRow,
} from "@/lib/agent-assignment";
import {
  agentAssignmentTransitionFailure,
  type AgentAssignmentTransitionResult,
} from "@/lib/agent-assignment-transition";
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
    operationalMode: row.operational_mode,
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
  if (!(await getVerifiedAdminSession(request))) return bad("Operations access is required.", 401);
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
  const session = await getVerifiedAdminSession(request);
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

  const { data, error } = await supabase.rpc("transition_agent_assignment", {
    p_action: "assign",
    p_booking_id: bookingId,
    p_expected_assignment_id: null,
    p_primary_driver_access_id: primaryId,
    p_backup_driver_access_id: backupId,
    p_driver_access_id: null,
    p_acceptance_minutes: normalizeAcceptanceMinutes(body.acceptanceMinutes),
    p_acceptance_checklist: {},
    p_reason: body.reason?.trim().slice(0, 500) || null,
    p_actor_role: session.role,
    p_actor_name: session.email,
    p_ip_hash: null,
    p_user_agent_hash: null,
  });
  if (error) {
    const failure = agentAssignmentTransitionFailure(error, "Could not create the agent assignment.");
    return bad(failure.message, failure.status);
  }
  const transition = data as AgentAssignmentTransitionResult | null;
  if (!transition?.assignment || !transition.booking) {
    return bad("Atomic assignment returned an incomplete result.", 500);
  }
  const names = new Map([
    [transition.assignment.primary_driver_access_id, transition.primaryDriverName],
    [transition.assignment.backup_driver_access_id, transition.backupDriverName],
  ]);
  return NextResponse.json({
    ok: true,
    assignment: publicAssignment(transition.assignment, names),
    booking: rowToBooking(transition.booking),
  });
}
