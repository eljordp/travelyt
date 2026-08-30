import { createHash, createHmac, randomInt } from "crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { durableRateLimit } from "@/lib/durable-rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray } from "@/lib/passengers";
import {
  IDENTITY_CONSENT_VERSION,
  identityConsentScope,
  validConsentSignature,
} from "@/lib/identity-consent";
import {
  createBoundStripeIdentitySession,
  STRIPE_IDENTITY_PROVIDER,
} from "@/lib/stripe-identity";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import { configuredOperationalMode, isOperationalMode } from "@/lib/operational-mode";

type InviteRow = {
  id: string; booking_id: string | null; passenger_id: string | null; subject_name: string | null;
  email: string | null; status: string; consent_at: string | null;
  verification_invite_expires_at: string | null; verification_invite_otp_hash: string | null;
  verification_invite_otp_expires_at: string | null; verification_invite_otp_attempts: number | null;
  verification_invite_otp_verified_at: string | null; metadata: Record<string, unknown> | null;
};

function bad(error: string, status = 400) { return NextResponse.json({ ok: false, error }, { status }); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function otpHmac(value: string) {
  const secret = process.env.TRAVELYT_CONSENT_HASH_SECRET?.trim();
  return secret ? createHmac("sha256", secret).update(value).digest("hex") : null;
}
function consentEvidenceHash(value: string) {
  const secret = process.env.TRAVELYT_CONSENT_HASH_SECRET || process.env.TRAVELYT_ADMIN_SESSION_SECRET || "travelyt-consent-evidence";
  return hash(`${secret}:${value}`);
}
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
  const body = await request.json().catch(() => ({})) as {
    token?: string;
    action?: "request_code" | "consent";
    emailCode?: string;
    consent?: boolean;
    consentVersion?: string;
    signatureName?: string;
    documentType?: string;
  };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!validToken(token)) return bad("Verification link is invalid.", 404);
  const requestingCode = body.action === "request_code";
  const durableLimited = await durableRateLimit(
    request,
    requestingCode
      ? "identity:traveler-otp:request"
      : "identity:traveler-otp:consume",
    requestingCode ? 5 : 6,
    10 * 60_000,
    token,
  );
  if (durableLimited) return durableLimited;
  const supabase = getSupabaseAdmin(); if (!supabase) return bad("Identity backend is not configured.", 503);
  const { data, error } = await loadInvite(supabase, token);
  if (error) return bad("Could not load verification link.", 500);
  if (!data || !data.booking_id || !data.passenger_id || !active(data)) return bad("Verification link is invalid or expired.", 410);
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("operational_mode, passenger_manifest")
    .eq("id", data.booking_id)
    .maybeSingle<{ operational_mode: string | null; passenger_manifest: unknown }>();
  if (bookingError || !booking) {
    return bad("The booking could not be loaded for identity verification.", 502);
  }
  if (!isOperationalMode(booking.operational_mode)) {
    return bad("The booking is not bound to an operating mode. Operations review is required.", 409);
  }
  const bookingMode = booking.operational_mode;
  const bookingStripeLivemode = bookingMode === "live";
  if (
    data.metadata?.operational_mode !== bookingMode ||
    data.metadata?.stripe_livemode !== bookingStripeLivemode
  ) {
    return bad("The traveler invite does not match the booking operating mode. Operations review is required.", 409);
  }
  if (configuredOperationalMode() !== bookingMode) {
    return bad("This booking is bound to another operating mode. Identity verification remains blocked.", 409);
  }

  if (body.action === "request_code") {
    if (!data.email) return bad("Email confirmation is not configured.", 503);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHmac = otpHmac(code);
    if (!codeHmac) return bad("Traveler OTP security is not configured.", 503);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error: updateError } = await supabase.from("identity_verifications").update({
      verification_invite_otp_hash: codeHmac, verification_invite_otp_expires_at: expiresAt,
      verification_invite_otp_attempts: 0, verification_invite_otp_verified_at: null,
    }).eq("id", data.id);
    if (updateError) return bad("Could not send email confirmation.", 500);
    const delivery = await sendTransactionalEmail({
      to: data.email,
      subject: "Your Travelyt verification code",
      text: `Your one-time Travelyt traveler verification code is ${code}. It expires in 10 minutes. Do not share it.`,
      idempotencyKey: `traveler-otp:${data.id}:${hash(code).slice(0, 24)}`,
    });
    if (delivery.status !== "accepted") {
      // Do not leave an undeliverable code active. The HMAC predicate prevents
      // this request from clearing a newer code issued concurrently.
      const { error: clearError } = await supabase
        .from("identity_verifications")
        .update({
          verification_invite_otp_hash: null,
          verification_invite_otp_expires_at: null,
          verification_invite_otp_attempts: 0,
          verification_invite_otp_verified_at: null,
        })
        .eq("id", data.id)
        .eq("verification_invite_otp_hash", codeHmac);
      if (clearError) console.error("Could not clear undelivered traveler OTP", clearError);
      if (delivery.status === "not_configured") {
        return bad("Email confirmation is not configured.", 503);
      }
      return bad("Could not send email confirmation.", 502);
    }
    return NextResponse.json({ ok: true, status: "code_sent", expiresAt });
  }

  const signatureName = typeof body.signatureName === "string"
    ? body.signatureName.trim().replace(/\s+/g, " ").slice(0, 160)
    : "";
  if (
    body.action !== "consent" ||
    body.consent !== true ||
    body.consentVersion !== IDENTITY_CONSENT_VERSION ||
    !validConsentSignature(signatureName)
  ) return bad("Review the identity disclosure and enter your legal name as an electronic signature.");
  if (!data.verification_invite_otp_verified_at) {
    const code = typeof body.emailCode === "string" ? body.emailCode.trim() : "";
    if (!/^\d{6}$/.test(code)) return bad("Enter the six-digit code sent to the traveler email.");
    const suppliedOtpHmac = otpHmac(code);
    if (!suppliedOtpHmac) return bad("Traveler OTP security is not configured.", 503);
    const { data: otpResult, error: otpError } = await supabase.rpc(
      "consume_traveler_verification_otp",
      { p_verification_id: data.id, p_supplied_otp_hmac: suppliedOtpHmac, p_max_attempts: 5 },
    );
    if (otpError) return bad("Could not verify the email confirmation code.", 503);
    if (otpResult === "expired") return bad("Email confirmation has expired. Request a new code.", 410);
    if (otpResult === "locked") return bad("Too many invalid code attempts. Ask the booking owner to send a new link.", 429);
    if (otpResult === "already_consumed") {
      return bad("That email confirmation code was already used. Refresh the verification link and try again.", 409);
    }
    if (otpResult !== "verified") return bad("That email confirmation code does not match.", 403);
  }
  const consentAt = new Date().toISOString();
  const documentType = ["passport", "driver_license", "other"].includes(String(body.documentType)) ? body.documentType : "passport";
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent")?.trim() || "unknown";
  let providerSession: Awaited<ReturnType<typeof createBoundStripeIdentitySession>>;
  try {
    providerSession = await createBoundStripeIdentitySession({
      supabase,
      verificationId: data.id,
      userId: data.passenger_id,
      email: data.email ?? undefined,
      role: "adult_traveler",
      documentType: documentType as "passport" | "driver_license" | "other",
      request,
      returnPath: `/verify-traveler?token=${encodeURIComponent(token)}&identity=return`,
      bindFields: {
        provider: STRIPE_IDENTITY_PROVIDER,
        document_type: documentType,
        consent_at: consentAt,
        consent_version: IDENTITY_CONSENT_VERSION,
        consent_signature_name: signatureName,
        consent_scope: identityConsentScope(STRIPE_IDENTITY_PROVIDER),
        consent_ip_hash: consentEvidenceHash(forwardedFor),
        consent_user_agent_hash: consentEvidenceHash(userAgent),
        status: "pending",
        liveness_status: "pending",
      },
      bindMetadata: {
        ...(data.metadata ?? {}),
        invite_state: "accepted",
        self_consent_at: consentAt,
        consent_version: IDENTITY_CONSENT_VERSION,
        stripe_livemode: bookingStripeLivemode,
        operational_mode: bookingMode,
        raw_document_stored_by_travelyt: false,
        archive_required_before_custody: true,
      },
    });
  } catch (providerError) {
    console.error("Adult traveler identity session creation failed", providerError);
    return bad("Secure document and selfie verification is unavailable. Custody remains blocked.", 503);
  }

  if (!isBookingPassengerArray(booking.passenger_manifest)) return bad("Verification submitted, but booking reconciliation is required.", 502);
  const manifest = booking.passenger_manifest.map((passenger) => passenger.id === data.passenger_id ? { ...passenger, consentAt, verificationStatus: "pending" as const } : passenger);
  const { error: manifestError } = await supabase.from("bookings").update({ passenger_manifest: manifest }).eq("id", data.booking_id);
  if (manifestError) return bad("Verification submitted, but booking reconciliation is required.", 502);
  return NextResponse.json({ ok: true, status: "pending", url: providerSession.url });
}
