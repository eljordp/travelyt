import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { arePartnerIntegrationsEnabled } from "@/lib/partner-integrations";
import {
  getRjIntegrationReadiness,
  getRjModeConfiguration,
  RJ_PROVIDER_ID,
} from "@/lib/rj-check-in";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function signatureIsValid(rawBody: string, signature: string | null, secret: string) {
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
export async function POST(request: Request) {
  const limited = rateLimit(request, "rj-check-in:webhook", 60); if (limited) return limited;
  const readiness = getRjIntegrationReadiness();
  if (!arePartnerIntegrationsEnabled() || !readiness.enabled || !readiness.readyForConfiguredMode) {
    return NextResponse.json({ ok: false, error: "RJ integration is disabled." }, { status: 404 });
  }
  const rawBody = await request.text();
  const body = (() => { try { return JSON.parse(rawBody) as { bookingId?: string; integrationMode?: "sandbox" | "production"; idempotencyKey?: string; requestFingerprint?: string; state?: "tags_activated" | "manual_review"; checkInReference?: string }; } catch { return null; } })();
  if (!body || !/^[A-Za-z0-9_-]{1,80}$/.test(body.bookingId || "") || !["sandbox", "production"].includes(body.integrationMode || "") || !/^[A-Za-z0-9:_-]{8,120}$/.test(body.idempotencyKey || "") || !/^[a-f0-9]{64}$/.test(body.requestFingerprint || "") || !["tags_activated", "manual_review"].includes(body.state || "") || !body.checkInReference) return NextResponse.json({ ok: false, error: "Invalid RJ webhook payload." }, { status: 400 });
  if (body.integrationMode !== readiness.mode) return NextResponse.json({ ok: false, error: "RJ webhook mode does not match the enabled integration mode." }, { status: 409 });
  const modeConfiguration = getRjModeConfiguration(process.env, readiness.mode);
  if (!signatureIsValid(rawBody, request.headers.get("x-rj-signature"), modeConfiguration.webhookSecret)) return NextResponse.json({ ok: false, error: "Invalid RJ webhook signature." }, { status: 401 });
  const supabase = getSupabaseAdmin(); if (!supabase) return NextResponse.json({ ok: false, error: "Partner backend is not configured." }, { status: 503 });
  const { data: job, error: jobError } = await supabase.from("partner_check_in_jobs")
    .select("id, booking_id, idempotency_key, request_fingerprint, mode, state, external_check_in_reference")
    .eq("provider_id", RJ_PROVIDER_ID)
    .eq("idempotency_key", body.idempotencyKey)
    .maybeSingle<{ id: string; booking_id: string; idempotency_key: string; request_fingerprint: string; mode: string; state: string; external_check_in_reference: string | null }>();
  if (jobError || !job || job.booking_id !== body.bookingId || job.mode !== body.integrationMode || job.request_fingerprint !== body.requestFingerprint || job.idempotency_key !== body.idempotencyKey || !job.external_check_in_reference || job.external_check_in_reference !== body.checkInReference) return NextResponse.json({ ok: false, error: "RJ check-in booking, mode, idempotency, or reference correlation failed." }, { status: 409 });
  if (job.state === body.state) {
    const { error: replaySyncError } = await supabase.from("bookings").update({ external_status: body.state, external_synced_at: new Date().toISOString() }).eq("id", job.booking_id);
    if (replaySyncError) return NextResponse.json({ ok: false, error: "RJ webhook replay could not reconcile the booking." }, { status: 500 });
    return NextResponse.json({ ok: true, idempotent: true });
  }
  const allowedPriorStates = body.state === "tags_activated"
    ? ["handoff_ready"]
    : ["requested", "tags_issued_inactive", "handoff_ready"];
  if (!allowedPriorStates.includes(job.state)) return NextResponse.json({ ok: false, error: "RJ webhook state transition is not allowed." }, { status: 409 });
  const patch = body.state === "tags_activated" ? { state: body.state, tag_activation_state: "active" } : { state: body.state, last_error_code: "rj_manual_review" };
  const { data: updated, error } = await supabase.from("partner_check_in_jobs").update(patch).eq("id", job.id).eq("booking_id", body.bookingId).eq("idempotency_key", body.idempotencyKey).eq("request_fingerprint", body.requestFingerprint).eq("mode", body.integrationMode).in("state", allowedPriorStates).select("id").maybeSingle<{ id: string }>();
  if (error || !updated) return NextResponse.json({ ok: false, error: "RJ check-in job could not be updated exactly once." }, { status: 500 });
  const { error: bookingSyncError } = await supabase.from("bookings").update({ external_status: body.state, external_synced_at: new Date().toISOString() }).eq("id", job.booking_id);
  if (bookingSyncError) return NextResponse.json({ ok: false, error: "RJ check-in job was recorded, but booking reconciliation must retry." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
