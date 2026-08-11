import { createHash, randomInt, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray } from "@/lib/passengers";

const resendApiKey = process.env.RESEND_API_KEY;
const leadFromEmail = process.env.LEAD_FROM_EMAIL || "Travelyt <info@travelyt.us>";

type InviteRow = {
  id: string; booking_id: string | null; passenger_id: string | null; subject_name: string | null;
  email: string | null; status: string; consent_at: string | null;
  verification_invite_expires_at: string | null; verification_invite_otp_hash: string | null;
  verification_invite_otp_expires_at: string | null; verification_invite_otp_attempts: number | null;
  verification_invite_otp_verified_at: string | null; metadata: Record<string, unknown> | null;
};

function bad(error: string, status = 400) { return NextResponse.json({ ok: false, error }, { status }); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function validToken(token: string) { return /^[A-Za-z0-9_-]{40,100}$/.test(token); }
function active(row: InviteRow) {
  return Boolean(row.verification_invite_expires_at && Date.parse(row.verification_invite_expires_at) > Date.now() && row.status !== "expired");
}
async function loadInvite(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, token: string) {
  return supabase.from("identity_verifications")
    .select("id, booking_id, passenger_id, subject_name, email, status, consent_at, verification_invite_expires_at, verification_invite_otp_hash, verification_invite_otp_expires_at, verification_invite_otp_attempts, verification_invite_otp_verified_at, metadata")
    .eq("verification_invite_token_hash", hash(token)).maybeSingle<InviteRow>();
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "identity:traveler-invite:get", 30); if (limited) return limited;
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!validToken(token)) return bad("Verification link is invalid.", 404);
  const supabase = getSupabaseAdmin(); if (!supabase) return bad("Identity backend is not configured.", 503);
  const { data, error } = await loadInvite(supabase, token);
  if (error) return bad("Could not load verification link.", 500);
  if (!data || !active(data)) return bad("Verification link is invalid or expired. Ask the booking owner to send a new one.", 410);
  return NextResponse.json({ ok: true, traveler: { name: data.subject_name || "Traveler", status: data.consent_at ? "submitted" : "invited", emailCodeRequired: !data.verification_invite_otp_verified_at } });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "identity:traveler-invite:post", 12); if (limited) return limited;
  const supabase = getSupabaseAdmin(); if (!supabase) return bad("Identity backend is not configured.", 503);
  const body = await request.json().catch(() => ({})) as { token?: string; action?: "request_code" | "consent"; emailCode?: string; consent?: boolean; documentType?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!validToken(token)) return bad("Verification link is invalid.", 404);
  const { data, error } = await loadInvite(supabase, token);
  if (error) return bad("Could not load verification link.", 500);
  if (!data || !data.booking_id || !data.passenger_id || !active(data)) return bad("Verification link is invalid or expired.", 410);

  if (body.action === "request_code") {
    if (!data.email || !resendApiKey) return bad("Email confirmation is not configured.", 503);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error: updateError } = await supabase.from("identity_verifications").update({
      verification_invite_otp_hash: hash(code), verification_invite_otp_expires_at: expiresAt,
      verification_invite_otp_attempts: 0, verification_invite_otp_verified_at: null,
    }).eq("id", data.id);
    if (updateError) return bad("Could not send email confirmation.", 500);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({
      from: leadFromEmail, to: data.email, subject: "Your Travelyt verification code",
      text: `Your one-time Travelyt traveler verification code is ${code}. It expires in 10 minutes. Do not share it.`,
    }) });
    if (!response.ok) return bad("Could not send email confirmation.", 502);
    return NextResponse.json({ ok: true, status: "code_sent", expiresAt });
  }

  if (body.action !== "consent" || body.consent !== true) return bad("Your consent is required to continue.");
  const code = typeof body.emailCode === "string" ? body.emailCode.trim() : "";
  if (!/^\d{6}$/.test(code)) return bad("Enter the six-digit code sent to the traveler email.");
  if (!data.verification_invite_otp_hash || !data.verification_invite_otp_expires_at || Date.parse(data.verification_invite_otp_expires_at) <= Date.now()) return bad("Email confirmation has expired. Request a new code.", 410);
  if ((data.verification_invite_otp_attempts ?? 0) >= 5) return bad("Too many invalid code attempts. Ask the booking owner to send a new link.", 429);
  const supplied = hash(code); const expected = data.verification_invite_otp_hash;
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    await supabase.from("identity_verifications").update({ verification_invite_otp_attempts: (data.verification_invite_otp_attempts ?? 0) + 1 }).eq("id", data.id);
    return bad("That email confirmation code does not match.", 403);
  }
  const consentAt = new Date().toISOString();
  const documentType = ["passport", "driver_license", "other"].includes(String(body.documentType)) ? body.documentType : "passport";
  const { error: consentError } = await supabase.from("identity_verifications").update({
    provider: "manual_prelaunch", document_type: documentType, consent_at: consentAt,
    status: "manual_review",
    verification_invite_otp_verified_at: consentAt,
    metadata: { ...(data.metadata ?? {}), invite_state: "accepted", self_consent_at: consentAt, raw_document_stored_by_travelyt: false },
  }).eq("id", data.id).is("consent_at", null);
  if (consentError) return bad("Could not submit traveler verification.", 500);
  const { data: booking, error: bookingError } = await supabase.from("bookings").select("passenger_manifest").eq("id", data.booking_id).maybeSingle<{ passenger_manifest: unknown }>();
  if (bookingError || !booking || !isBookingPassengerArray(booking.passenger_manifest)) return bad("Verification submitted, but booking reconciliation is required.", 502);
  const manifest = booking.passenger_manifest.map((passenger) => passenger.id === data.passenger_id ? { ...passenger, consentAt, verificationStatus: "manual_review" as const } : passenger);
  const { error: manifestError } = await supabase.from("bookings").update({ passenger_manifest: manifest }).eq("id", data.booking_id);
  if (manifestError) return bad("Verification submitted, but booking reconciliation is required.", 502);
  return NextResponse.json({ ok: true, status: "manual_review" });
}
