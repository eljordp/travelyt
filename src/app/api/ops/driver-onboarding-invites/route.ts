import { NextResponse } from "next/server";
import { getAdminSession, isFullAdminSession } from "@/lib/admin-auth";
import {
  AGENT_ONBOARDING_TTL_HOURS,
  generateOnboardingToken,
  hashOnboardingToken,
} from "@/lib/driver-onboarding";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "ops:driver-onboarding-evidence", 40);
  if (limited) return limited;
  const session = getAdminSession(request);
  if (!session || !isFullAdminSession(request)) return bad("Full admin access is required.", 403);
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Driver onboarding is not configured.", 503);
  const driverAccessId = new URL(request.url).searchParams.get("driverAccessId")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(driverAccessId)) return bad("Select a valid driver account.");
  const { data, error } = await supabase
    .from("agent_evidence_uploads")
    .select("id, evidence_type, original_name, content_type, byte_size, review_status, uploaded_at, file_path")
    .eq("driver_access_id", driverAccessId)
    .order("uploaded_at", { ascending: false });
  if (error) return bad("Could not load driver evidence.", 500);
  const evidence = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("agent-readiness-evidence")
        .createSignedUrl(row.file_path, 10 * 60);
      return {
        id: row.id,
        evidenceType: row.evidence_type,
        originalName: row.original_name,
        contentType: row.content_type,
        byteSize: row.byte_size,
        reviewStatus: row.review_status,
        uploadedAt: row.uploaded_at,
        downloadUrl: signed?.signedUrl ?? null,
      };
    })
  );
  return NextResponse.json({ ok: true, evidence });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ops:driver-onboarding-invites", 20);
  if (limited) return limited;
  const session = getAdminSession(request);
  if (!session || !isFullAdminSession(request)) return bad("Full admin access is required.", 403);
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Driver onboarding is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as { driverAccessId?: string };
  const driverAccessId = body.driverAccessId?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(driverAccessId)) return bad("Select a valid driver account.");

  const { data: driver, error: driverError } = await supabase
    .from("driver_access_codes")
    .select("id, driver_name, driver_email, status")
    .eq("id", driverAccessId)
    .maybeSingle<{ id: string; driver_name: string; driver_email: string | null; status: string }>();
  if (driverError || !driver) return bad("Driver account was not found.", 404);
  if (driver.status !== "active") return bad("Only an active driver account can receive onboarding.", 409);
  if (!driver.driver_email) return bad("Add the driver's email before creating onboarding.", 409);

  await supabase
    .from("agent_onboarding_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("driver_access_id", driver.id)
    .eq("status", "active");

  const token = generateOnboardingToken();
  const expiresAt = new Date(Date.now() + AGENT_ONBOARDING_TTL_HOURS * 60 * 60_000).toISOString();
  const { data: invite, error } = await supabase
    .from("agent_onboarding_invites")
    .insert({
      driver_access_id: driver.id,
      token_hash: hashOnboardingToken(token),
      expires_at: expiresAt,
      created_by: session.email,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return bad("Could not create the private onboarding link.", 500);

  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    driverName: driver.driver_name,
    expiresAt,
    url: `${getSiteUrl(request)}/driver/onboarding?token=${encodeURIComponent(token)}`,
  });
}
