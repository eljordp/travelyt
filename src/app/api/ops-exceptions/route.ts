import { NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import { authorizeDriverRequest } from "@/lib/driver-access-server";
import {
  driverExceptionPolicy,
  exceptionMetadata,
  type OpsExceptionSeverity,
} from "@/lib/ops-exception-policy";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const severities = ["info", "warning", "critical"] as const;
const BOOKING_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const EXCEPTION_CODE_PATTERN = /^[A-Z0-9_:-]{3,80}$/;
const MAX_MESSAGE_LENGTH = 1_000;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "ops-exceptions:get", 60);
  if (limited) return limited;
  if (!(await getVerifiedAdminSession(request))) return bad("Admin access is required.", 401);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Operations backend is not configured.", 503);

  const { data, error } = await supabase
    .from("ops_exceptions")
    .select("*")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return bad("Could not load operations exceptions.", 500);
  return NextResponse.json({ ok: true, exceptions: data ?? [] });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ops-exceptions:post", 30);
  if (limited) return limited;
  const operationsSession = await getVerifiedAdminSession(request);
  const driverAuth = operationsSession ? null : await authorizeDriverRequest(request);
  if (
    !operationsSession &&
    (!driverAuth?.ok || !driverAuth.driverAccessId || driverAuth.source === "env")
  ) {
    return bad("A current individual driver session or operations access is required.", 403);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Operations backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    bookingId?: string;
    code?: string;
    message?: string;
    severity?: string;
    metadata?: Record<string, unknown>;
  };

  const bookingId = body.bookingId?.trim() ?? "";
  const code = body.code?.trim().toUpperCase() ?? "";
  const message = body.message?.trim() ?? "";

  if (!BOOKING_ID_PATTERN.test(bookingId)) return bad("Booking ID is invalid.");
  if (!EXCEPTION_CODE_PATTERN.test(code)) return bad("Exception code is invalid.");
  if (!message) return bad("Missing exception message.");
  if (message.length > MAX_MESSAGE_LENGTH) {
    return bad(`Exception message is limited to ${MAX_MESSAGE_LENGTH} characters.`, 413);
  }

  let severity: OpsExceptionSeverity;
  let actor:
    | { role: "driver"; driverAccessId: string; name: string; email?: string }
    | { role: "admin" | "dispatcher"; email: string };

  if (operationsSession) {
    severity = severities.includes(body.severity as (typeof severities)[number])
      ? body.severity as OpsExceptionSeverity
      : "warning";
    actor = {
      role: operationsSession.role,
      email: operationsSession.email,
    };

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .maybeSingle<{ id: string }>();
    if (bookingError) return bad("Could not verify booking scope.", 500);
    if (!booking) return bad("Booking not found.", 404);
  } else {
    const policy = driverExceptionPolicy(code);
    if (!policy.ok) return bad(policy.error, 403);
    severity = policy.value.severity;

    const driverAccessId = driverAuth!.driverAccessId!;
    const driverName = driverAuth!.driverName?.trim();
    if (!driverName) return bad("The driver account is missing its server identity.", 403);
    const { data: assignment, error: assignmentError } = await supabase
      .from("booking_agent_assignments")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("status", "accepted")
      .eq("primary_driver_access_id", driverAccessId)
      .eq("accepted_by_driver_access_id", driverAccessId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (assignmentError) return bad("Could not verify driver assignment scope.", 500);
    if (!assignment) {
      return bad("Only the accepted primary driver may report an exception for this booking.", 403);
    }
    actor = {
      role: "driver",
      driverAccessId,
      name: driverName,
      email: driverAuth!.driverEmail,
    };
  }

  const metadata = exceptionMetadata(body.metadata, actor);
  if (!metadata.ok) return bad(metadata.error, 413);

  const { error } = await supabase.from("ops_exceptions").insert({
    booking_id: bookingId,
    code,
    message,
    severity,
    metadata: metadata.value,
  });

  if (error) return bad("Could not record operations exception.", 500);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "ops-exceptions:patch", 30);
  if (limited) return limited;
  if (!(await getVerifiedAdminSession(request))) return bad("Admin access is required.", 401);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Operations backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: "open" | "acknowledged" | "resolved";
  };
  const id = body.id?.trim();
  const status = body.status;

  if (!id) return bad("Missing exception ID.");
  if (!status || !["open", "acknowledged", "resolved"].includes(status)) {
    return bad("Unsupported exception status.");
  }

  const { data, error } = await supabase
    .from("ops_exceptions")
    .update({
      status,
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return bad("Could not update operations exception.", 500);
  return NextResponse.json({ ok: true, exception: data });
}
