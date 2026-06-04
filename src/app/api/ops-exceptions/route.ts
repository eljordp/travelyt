import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { authorizeDriverRequest } from "@/lib/driver-access-server";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const severities = ["info", "warning", "critical"] as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function adminAuthorized(request: Request) {
  return Boolean(getAdminSession(request));
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "ops-exceptions:get", 60);
  if (limited) return limited;
  if (!adminAuthorized(request)) return bad("Admin access is required.", 401);

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
  const driverAuth = await authorizeDriverRequest(request);
  if (!adminAuthorized(request) && !driverAuth.ok) {
    return bad("Driver or admin access is required.", 403);
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

  const bookingId = body.bookingId?.trim();
  const code = body.code?.trim().toUpperCase();
  const message = body.message?.trim();
  const severity = severities.includes(body.severity as (typeof severities)[number])
    ? body.severity
    : "warning";

  if (!bookingId) return bad("Missing booking ID.");
  if (!code) return bad("Missing exception code.");
  if (!message) return bad("Missing exception message.");

  const { error } = await supabase.from("ops_exceptions").insert({
    booking_id: bookingId,
    code,
    message,
    severity,
    metadata: body.metadata ?? {},
  });

  if (error) return bad("Could not record operations exception.", 500);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "ops-exceptions:patch", 30);
  if (limited) return limited;
  if (!adminAuthorized(request)) return bad("Admin access is required.", 401);

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
