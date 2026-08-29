import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray, passengerDisplayName } from "@/lib/passengers";
import { trustedUserRole } from "@/lib/auth-policy";
import {
  IDENTITY_CONSENT_VERSION,
  identityConsentScope,
  validConsentSignature,
} from "@/lib/identity-consent";
import {
  createStripeIdentitySession,
  STRIPE_IDENTITY_PROVIDER,
  verifiedDob,
} from "@/lib/stripe-identity";
import {
  providerIdentityVerdict,
  requireVerifiedIdentityGate,
  type StripeIdentityEventType,
} from "@/lib/identity-verdict";
import { archiveIdentityOriginals } from "@/lib/identity-originals";
import { getStripe } from "@/lib/stripe-server";
import { sendTransactionalEmail } from "@/lib/transactional-email";

const documentTypes = ["driver_license", "passport", "employee_badge", "other"] as const;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function consentEvidenceHash(value: string) {
  const secret =
    process.env.TRAVELYT_CONSENT_HASH_SECRET ||
    process.env.TRAVELYT_ADMIN_SESSION_SECRET ||
    "travelyt-consent-evidence";
  return hash(`${secret}:${value}`);
}

async function sendAdultTravelerInvite(data: {
  email: string;
  bookingId: string;
  passengerName: string;
  token: string;
}) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://travelyt.us"}/verify-traveler?token=${encodeURIComponent(data.token)}`;
  const result = await sendTransactionalEmail({
    to: data.email,
    subject: "Confirm your Travelyt traveler verification",
    text: [
      `You were added to Travelyt booking ${data.bookingId}.`,
      "",
      `Open this private link to begin verification: ${verifyUrl}`,
      "",
      "For your security, the link alone is not enough. We will send a separate one-time code to this email after you open it.",
      "Do not forward this link. If you did not expect this message, do not continue.",
      "",
      `Traveler: ${data.passengerName}`,
    ].join("\n"),
    idempotencyKey: `traveler-invite:${data.bookingId}:${hash(data.token).slice(0, 24)}`,
  });
  if (result.status === "failed") console.error("Adult traveler invite delivery failed", result);
  return result.status === "sent";
}

async function reconcileExistingProfileIdentity(input: {
  stripe: NonNullable<ReturnType<typeof getStripe>>;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  verificationId: string;
  providerSessionId: string;
  userId: string;
  metadata: Record<string, unknown> | null;
}) {
  const session = await input.stripe.identity.verificationSessions.retrieve(
    input.providerSessionId,
    { expand: ["last_verification_report"] }
  );
  const eventType: StripeIdentityEventType | null =
    session.status === "verified"
      ? "identity.verification_session.verified"
      : session.status === "requires_input"
        ? "identity.verification_session.requires_input"
        : session.status === "canceled"
          ? "identity.verification_session.canceled"
          : null;
  if (!eventType) {
    return { status: "pending", url: session.url };
  }

  const now = new Date().toISOString();
  let verdict = providerIdentityVerdict(eventType);
  let archive: Awaited<ReturnType<typeof archiveIdentityOriginals>> | null = null;
  let archiveError: string | null = null;
  if (verdict.status === "verified") {
    try {
      archive = await archiveIdentityOriginals({
        stripe: input.stripe,
        supabase: input.supabase,
        verificationId: input.verificationId,
        session,
      });
    } catch (error) {
      archiveError = error instanceof Error ? error.message : "Unknown archive failure.";
      console.error("Identity original archive failed during return reconciliation", error);
    }
  }
  const archived = Boolean(archive && archive.stored > 0);
  verdict = requireVerifiedIdentityGate(verdict, archived);

  const { error: updateError } = await input.supabase
    .from("identity_verifications")
    .update({
      status: verdict.status,
      liveness_status: verdict.livenessStatus,
      verified_at: verdict.status === "verified" ? now : null,
      ...(archive && archived
        ? {
            raw_document_paths: archive.paths,
            raw_stored_at: archive.storedAt,
            raw_retention_until: archive.retentionUntil,
            raw_export_status: "pending_ash",
            raw_deletion_status: "scheduled",
          }
        : {}),
      metadata: {
        ...(input.metadata ?? {}),
        stripe_status: session.status,
        stripe_livemode: session.livemode,
        verified_dob: verifiedDob(session),
        provider_error_code: session.last_error?.code ?? null,
        raw_document_stored_by_travelyt: archived,
        archive_required_before_custody: true,
        ...(archiveError ? { raw_archive_error: archiveError } : {}),
        reconciled_at: now,
        reconciled_via: "profile_return",
      },
    })
    .eq("id", input.verificationId);
  if (updateError) throw updateError;

  if (verdict.status === "verified") {
    const { data: bookings, error: bookingsError } = await input.supabase
      .from("bookings")
      .select("id, passenger_manifest")
      .eq("customer_user_id", input.userId)
      .is("customer_identity_verified_at", null)
      .returns<Array<{ id: string; passenger_manifest: unknown }>>();
    if (bookingsError) throw bookingsError;
    for (const booking of bookings ?? []) {
      const passengerManifest = isBookingPassengerArray(booking.passenger_manifest)
        ? booking.passenger_manifest.map((passenger) =>
            passenger.category === "account_holder"
              ? { ...passenger, identityVerifiedAt: now, verificationStatus: "verified" as const }
              : passenger
          )
        : booking.passenger_manifest;
      const { error: bookingUpdateError } = await input.supabase
        .from("bookings")
        .update({ customer_identity_verified_at: now, passenger_manifest: passengerManifest })
        .eq("id", booking.id);
      if (bookingUpdateError) throw bookingUpdateError;
    }
  }

  return { status: verdict.status, url: null };
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "identity:request", 10);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Identity backend is not configured.", 503);

  const user = await getRequestUser(request);
  if (!user) return bad("Sign in before requesting verification.", 401);

  try {
    const body = (await request.json().catch(() => ({}))) as {
      documentType?: string;
      bookingId?: string;
      passengerId?: string;
      consentAccepted?: boolean;
      consentVersion?: string;
      signatureName?: string;
    };
    const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
    const passengerId = typeof body.passengerId === "string" ? body.passengerId.trim() : "";
    if (bookingId || passengerId) {
      if (!bookingId || !passengerId) return bad("Booking and traveler are required.");
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, customer_user_id, passenger_manifest")
        .eq("id", bookingId)
        .maybeSingle<{ id: string; customer_user_id: string | null; passenger_manifest: unknown }>();
      if (bookingError) return bad("Could not load traveler booking.", 500);
      if (!booking || booking.customer_user_id !== user.id) return bad("You do not have access to this traveler booking.", 403);
      if (!isBookingPassengerArray(booking.passenger_manifest)) return bad("Traveler manifest is unavailable.", 409);
      const passenger = booking.passenger_manifest.find((candidate) => candidate.id === passengerId);
      if (!passenger || passenger.category !== "adult" || passenger.verificationMethod !== "self_service" || !passenger.email) {
        return bad("Only a grouped adult with a separate email can receive this verification invite.", 409);
      }
      const token = randomBytes(36).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
      const values = {
        user_id: user.id,
        email: passenger.email,
        role: "customer",
        status: "pending",
        provider: "manual_prelaunch",
        document_type: "passport",
        liveness_required: true,
        liveness_status: "pending",
        booking_id: booking.id,
        passenger_id: passenger.id,
        subject_name: passengerDisplayName(passenger),
        subject_type: "adult",
        verification_invite_token_hash: hash(token),
        verification_invite_expires_at: expiresAt,
        verification_invite_sent_at: now.toISOString(),
        verification_invite_otp_hash: null,
        verification_invite_otp_expires_at: null,
        verification_invite_otp_attempts: 0,
        verification_invite_otp_verified_at: null,
        consent_at: null,
        metadata: {
          source: "booking-group",
          verification_method: passenger.verificationMethod,
          raw_document_stored_by_travelyt: false,
        },
      };
      const { data: existingInvite, error: inviteLookupError } = await supabase
        .from("identity_verifications")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("passenger_id", passenger.id)
        .in("status", ["pending", "manual_review"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (inviteLookupError) return bad("Could not prepare traveler verification invite.", 500);
      const inviteWrite = existingInvite
        ? await supabase.from("identity_verifications").update(values).eq("id", existingInvite.id)
        : await supabase.from("identity_verifications").insert(values);
      if (inviteWrite.error) {
        console.error("Adult invite creation failed", inviteWrite.error);
        return bad("Could not create traveler verification invite.", 500);
      }
      const sent = await sendAdultTravelerInvite({
        email: passenger.email,
        bookingId: booking.id,
        passengerName: passengerDisplayName(passenger),
        token,
      });
      if (!sent) return bad("Traveler invite email is not configured. No invitation was sent.", 503);
      const updatedManifest = booking.passenger_manifest.map((candidate) =>
        candidate.id === passenger.id
          ? { ...candidate, verificationStatus: "invite_sent" as const }
          : candidate
      );
      const { error: manifestError } = await supabase
        .from("bookings")
        .update({ passenger_manifest: updatedManifest })
        .eq("id", booking.id);
      if (manifestError) {
        console.error("Adult traveler invite status reconciliation failed", manifestError);
        return bad("The traveler email was sent, but the booking status needs reconciliation.", 502);
      }
      return NextResponse.json({ ok: true, status: "invite_sent", expiresAt });
    }
    const metadata = user.user_metadata ?? {};
    const trustedRole = trustedUserRole(user);
    const role =
      trustedRole === "manager"
        ? "admin"
        : trustedRole === "dispatcher"
          ? "employee"
          : trustedRole;
    const documentType: (typeof documentTypes)[number] = documentTypes.includes(
      body.documentType as (typeof documentTypes)[number]
    )
      ? (body.documentType as (typeof documentTypes)[number])
      : "driver_license";
    const phone = typeof metadata.phone === "string" ? metadata.phone : null;
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
    const consentAt = new Date().toISOString();
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("user-agent")?.trim() || "unknown";
    const consentValues = {
      consent_at: consentAt,
      consent_version: IDENTITY_CONSENT_VERSION,
      consent_signature_name: signatureName,
      consent_scope: identityConsentScope(STRIPE_IDENTITY_PROVIDER),
      consent_ip_hash: consentEvidenceHash(forwardedFor),
      consent_user_agent_hash: consentEvidenceHash(userAgent),
    };

    const { data: verified, error: verifiedError } = await supabase
      .from("identity_verifications")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("role", role)
      .eq("provider", STRIPE_IDENTITY_PROVIDER)
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verifiedError) {
      console.error("Verified identity lookup failed", verifiedError);
      return bad("Could not check verification status.", 500);
    }
    if (verified) {
      return NextResponse.json({
        ok: true,
        status: "verified",
        existing: true,
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from("identity_verifications")
      .select("id, status, provider_session_id, metadata")
      .eq("user_id", user.id)
      .eq("role", role)
      .eq("provider", STRIPE_IDENTITY_PROVIDER)
      .in("status", ["pending", "manual_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        status: string;
        provider_session_id: string | null;
        metadata: Record<string, unknown> | null;
      }>();
    if (existingError) {
      console.error("Stripe Identity lookup failed", existingError);
      return bad("Could not check verification status.", 500);
    }
    if (existing?.provider_session_id) {
      const { error: consentUpdateError } = await supabase
        .from("identity_verifications")
        .update(consentValues)
        .eq("id", existing.id);
      if (consentUpdateError) return bad("Could not save the signed identity consent.", 500);
      const stripe = getStripe();
      if (!stripe) return bad("Stripe Identity is not configured.", 503);
      try {
        const reconciled = await reconcileExistingProfileIdentity({
          stripe,
          supabase,
          verificationId: existing.id,
          providerSessionId: existing.provider_session_id,
          userId: user.id,
          metadata: existing.metadata,
        });
        return NextResponse.json({ ok: true, ...reconciled, existing: true });
      } catch (error) {
        console.error("Stripe Identity session retrieval failed", error);
        return bad("Could not reopen the secure identity session.", 502);
      }
    }

    const { data, error } = await supabase
      .from("identity_verifications")
      .insert({
        user_id: user.id,
        email: user.email ?? null,
        phone,
        role,
        status: "pending",
        provider: STRIPE_IDENTITY_PROVIDER,
        document_type: documentType,
        liveness_required: true,
        liveness_status: "pending",
        ...consentValues,
        metadata: {
          source: "profile",
          requested_by: user.id,
          raw_document_stored_by_travelyt: false,
        },
      })
      .select("id, status")
      .single();

    if (error) {
      console.error("Identity verification insert failed", error);
      return bad("Could not request verification.", 500);
    }

    try {
      const session = await createStripeIdentitySession({
        verificationId: data.id,
        userId: user.id,
        email: user.email ?? undefined,
        phone: phone ?? undefined,
        role,
        documentType,
        request,
      });
      const { error: sessionWriteError } = await supabase
        .from("identity_verifications")
        .update({
          provider_session_id: session.id,
          metadata: {
            source: "profile",
            requested_by: user.id,
            stripe_livemode: session.livemode,
            raw_document_stored_by_travelyt: false,
          },
        })
        .eq("id", data.id);
      if (sessionWriteError) throw sessionWriteError;
      return NextResponse.json({ ok: true, status: data.status, url: session.url });
    } catch (providerError) {
      console.error("Stripe Identity session creation failed", providerError);
      await supabase.from("identity_verifications").update({
        status: "manual_review",
        liveness_status: "manual_review",
        metadata: {
          source: "profile",
          requested_by: user.id,
          provider_launch_failed: true,
          raw_document_stored_by_travelyt: false,
        },
      }).eq("id", data.id);
      return bad("Secure identity verification is not available yet. Custody remains blocked.", 503);
    }
  } catch {
    return bad("Could not request verification.");
  }
}
