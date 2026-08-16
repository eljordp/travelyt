import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  AGENT_EVIDENCE_BUCKET,
  AGENT_EVIDENCE_TYPES,
  evidenceMagicMatches,
  getActiveOnboardingInvite,
  safeEvidenceExtension,
  type AgentEvidenceType,
} from "@/lib/driver-onboarding";
import {
  IDENTITY_CONSENT_VERSION,
  identityConsentScope,
  validConsentSignature,
} from "@/lib/identity-consent";
import { rateLimit } from "@/lib/rate-limit";
import {
  createStripeIdentitySession,
  STRIPE_IDENTITY_PROVIDER,
} from "@/lib/stripe-identity";
import { getStripe } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function consentEvidenceHash(value: string) {
  const secret =
    process.env.TRAVELYT_CONSENT_HASH_SECRET ||
    process.env.TRAVELYT_ADMIN_SESSION_SECRET ||
    "travelyt-consent-evidence";
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function cleanFileName(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._ -]/g, "").slice(0, 160) || "evidence";
}

function isEvidenceType(value: unknown): value is AgentEvidenceType {
  return typeof value === "string" && AGENT_EVIDENCE_TYPES.includes(value as AgentEvidenceType);
}

async function loadContext(token: string) {
  const invite = await getActiveOnboardingInvite(token);
  const supabase = getSupabaseAdmin();
  if (!invite || !supabase) return null;
  const { data: driver, error } = await supabase
    .from("driver_access_codes")
    .select("id, driver_name, driver_email, driver_phone, status")
    .eq("id", invite.driver_access_id)
    .maybeSingle<{
      id: string;
      driver_name: string;
      driver_email: string | null;
      driver_phone: string | null;
      status: string;
    }>();
  if (error || !driver || driver.status !== "active") return null;
  return { invite, driver, supabase };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "driver-onboarding:get", 60);
  if (limited) return limited;
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const context = await loadContext(token);
  if (!context) return bad("This onboarding link is invalid or expired.", 401);

  const [{ data: uploads, error: uploadError }, { data: identity, error: identityError }] =
    await Promise.all([
      context.supabase
        .from("agent_evidence_uploads")
        .select("id, evidence_type, original_name, review_status, uploaded_at")
        .eq("driver_access_id", context.driver.id)
        .order("uploaded_at", { ascending: false }),
      context.supabase
        .from("identity_verifications")
        .select("status, verified_at")
        .eq("email", context.driver.driver_email?.toLowerCase() ?? "")
        .eq("role", "driver")
        .eq("provider", STRIPE_IDENTITY_PROVIDER)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: string; verified_at: string | null }>(),
    ]);
  if (uploadError || identityError) return bad("Could not load onboarding status.", 500);

  return NextResponse.json({
    ok: true,
    driver: { name: context.driver.driver_name },
    expiresAt: context.invite.expires_at,
    identity: identity ?? { status: "not_started", verified_at: null },
    uploads: uploads ?? [],
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "driver-onboarding:post", 30);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  const context = await loadContext(token);
  if (!context) return bad("This onboarding link is invalid or expired.", 401);

  if (action === "prepare_upload") {
    const evidenceType = body.evidenceType;
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const byteSize = typeof body.byteSize === "number" ? body.byteSize : 0;
    const originalName = typeof body.originalName === "string" ? cleanFileName(body.originalName) : "evidence";
    const extension = safeEvidenceExtension(contentType);
    if (!isEvidenceType(evidenceType)) return bad("Select a valid evidence category.");
    if (!extension) return bad("Upload a PDF, JPG, PNG, or WebP file.");
    if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > MAX_EVIDENCE_BYTES) {
      return bad("Evidence files must be between 1 byte and 10 MB.");
    }
    const filePath = `${context.driver.id}/${context.invite.id}/${evidenceType}/${randomUUID()}.${extension}`;
    const { data, error } = await context.supabase.storage
      .from(AGENT_EVIDENCE_BUCKET)
      .createSignedUploadUrl(filePath);
    if (error) return bad("Could not prepare the private upload.", 500);
    return NextResponse.json({
      ok: true,
      filePath,
      signedToken: data.token,
      originalName,
      contentType,
      byteSize,
    });
  }

  if (action === "complete_upload") {
    const evidenceType = body.evidenceType;
    const filePath = typeof body.filePath === "string" ? body.filePath : "";
    const originalName = typeof body.originalName === "string" ? cleanFileName(body.originalName) : "evidence";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const byteSize = typeof body.byteSize === "number" ? body.byteSize : 0;
    if (!isEvidenceType(evidenceType)) return bad("Select a valid evidence category.");
    if (!filePath.startsWith(`${context.driver.id}/${context.invite.id}/${evidenceType}/`)) {
      return bad("Evidence path is invalid.", 403);
    }
    if (!safeEvidenceExtension(contentType) || byteSize <= 0 || byteSize > MAX_EVIDENCE_BYTES) {
      return bad("Evidence metadata is invalid.");
    }
    const { data: file, error: downloadError } = await context.supabase.storage
      .from(AGENT_EVIDENCE_BUCKET)
      .download(filePath);
    if (downloadError || !file) return bad("The private upload could not be verified.", 409);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length !== byteSize || !evidenceMagicMatches(bytes, contentType)) {
      await context.supabase.storage.from(AGENT_EVIDENCE_BUCKET).remove([filePath]);
      return bad("The uploaded file did not match its declared type or size.", 409);
    }
    const { data: upload, error } = await context.supabase
      .from("agent_evidence_uploads")
      .insert({
        driver_access_id: context.driver.id,
        invite_id: context.invite.id,
        evidence_type: evidenceType,
        file_path: filePath,
        original_name: originalName,
        content_type: contentType,
        byte_size: byteSize,
      })
      .select("id, evidence_type, original_name, review_status, uploaded_at")
      .single();
    if (error) {
      await context.supabase.storage.from(AGENT_EVIDENCE_BUCKET).remove([filePath]);
      return bad("Could not record the uploaded evidence.", 500);
    }
    return NextResponse.json({ ok: true, upload });
  }

  if (action === "start_identity") {
    if (!context.driver.driver_email) return bad("The driver account needs an email before identity verification.", 409);
    const signatureName = typeof body.signatureName === "string"
      ? body.signatureName.trim().replace(/\s+/g, " ").slice(0, 160)
      : "";
    if (
      body.consentAccepted !== true ||
      body.consentVersion !== IDENTITY_CONSENT_VERSION ||
      !validConsentSignature(signatureName)
    ) {
      return bad("Review the identity disclosure and enter your legal name as an electronic signature.");
    }
    const stripe = getStripe();
    if (!stripe) return bad("Stripe Identity is not configured.", 503);
    const { data: existing, error: existingError } = await context.supabase
      .from("identity_verifications")
      .select("id, status, provider_session_id")
      .eq("email", context.driver.driver_email.toLowerCase())
      .eq("role", "driver")
      .eq("provider", STRIPE_IDENTITY_PROVIDER)
      .in("status", ["pending", "manual_review", "verified"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string; provider_session_id: string | null }>();
    if (existingError) return bad("Could not check identity status.", 500);
    if (existing?.status === "verified") return NextResponse.json({ ok: true, status: "verified" });
    if (existing?.provider_session_id) {
      const session = await stripe.identity.verificationSessions.retrieve(existing.provider_session_id);
      return NextResponse.json({ ok: true, status: existing.status, url: session.url });
    }

    const now = new Date().toISOString();
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("user-agent")?.trim() || "unknown";
    const { data: verification, error } = await context.supabase
      .from("identity_verifications")
      .insert({
        user_id: null,
        email: context.driver.driver_email.toLowerCase(),
        phone: context.driver.driver_phone,
        role: "driver",
        status: "pending",
        provider: STRIPE_IDENTITY_PROVIDER,
        document_type: "driver_license",
        liveness_required: true,
        liveness_status: "pending",
        consent_at: now,
        consent_version: IDENTITY_CONSENT_VERSION,
        consent_signature_name: signatureName,
        consent_scope: identityConsentScope(STRIPE_IDENTITY_PROVIDER),
        consent_ip_hash: consentEvidenceHash(forwardedFor),
        consent_user_agent_hash: consentEvidenceHash(userAgent),
        metadata: {
          source: "driver-onboarding",
          driver_access_id: context.driver.id,
          invite_id: context.invite.id,
          raw_document_stored_by_travelyt: false,
        },
      })
      .select("id, status")
      .single<{ id: string; status: string }>();
    if (error) return bad("Could not prepare identity verification.", 500);
    try {
      const session = await createStripeIdentitySession({
        verificationId: verification.id,
        userId: context.driver.id,
        email: context.driver.driver_email,
        phone: context.driver.driver_phone ?? undefined,
        role: "driver",
        documentType: "driver_license",
        request,
        returnPath: "/driver/onboarding?identity=return",
      });
      await context.supabase
        .from("identity_verifications")
        .update({ provider_session_id: session.id })
        .eq("id", verification.id);
      return NextResponse.json({ ok: true, status: verification.status, url: session.url });
    } catch (providerError) {
      console.error("Driver Stripe Identity launch failed", providerError);
      await context.supabase
        .from("identity_verifications")
        .update({ status: "manual_review", liveness_status: "manual_review" })
        .eq("id", verification.id);
      return bad("Secure identity verification is temporarily unavailable. Readiness remains blocked.", 503);
    }
  }

  return bad("Unsupported onboarding action.");
}
