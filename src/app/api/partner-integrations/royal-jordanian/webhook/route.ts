import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function signatureIsValid(rawBody: string, signature: string | null) {
  const secret = process.env.RJ_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!signatureIsValid(rawBody, request.headers.get("x-rj-signature"))) return NextResponse.json({ ok: false, error: "Invalid RJ webhook signature." }, { status: 401 });
  const body = (() => { try { return JSON.parse(rawBody) as { idempotencyKey?: string; state?: "tags_activated" | "manual_review"; checkInReference?: string }; } catch { return null; } })();
  if (!body || !/^[A-Za-z0-9:_-]{8,120}$/.test(body.idempotencyKey || "") || !["tags_activated", "manual_review"].includes(body.state || "") || !body.checkInReference) return NextResponse.json({ ok: false, error: "Invalid RJ webhook payload." }, { status: 400 });
  const supabase = getSupabaseAdmin(); if (!supabase) return NextResponse.json({ ok: false, error: "Partner backend is not configured." }, { status: 503 });
  const { data: job, error: jobError } = await supabase.from("partner_check_in_jobs")
    .select("id, booking_id, external_check_in_reference")
    .eq("provider_id", "royal-jordanian")
    .eq("idempotency_key", body.idempotencyKey)
    .maybeSingle<{ id: string; booking_id: string; external_check_in_reference: string | null }>();
  if (jobError || !job || !job.external_check_in_reference || job.external_check_in_reference !== body.checkInReference) return NextResponse.json({ ok: false, error: "RJ check-in correlation failed." }, { status: 409 });
  const patch = body.state === "tags_activated" ? { state: body.state, tag_activation_state: "active" } : { state: body.state, last_error_code: "rj_manual_review" };
  const { error } = await supabase.from("partner_check_in_jobs").update(patch).eq("id", job.id);
  if (error) return NextResponse.json({ ok: false, error: "RJ check-in job could not be updated." }, { status: 500 });
  await supabase.from("bookings").update({ external_status: body.state, external_synced_at: new Date().toISOString() }).eq("id", job.booking_id);
  return NextResponse.json({ ok: true });
}
