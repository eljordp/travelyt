import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { isBookingPassengerArray, passengerDisplayName } from "@/lib/passengers";

const roles = ["customer", "driver", "employee", "admin"] as const;
const documentTypes = ["driver_license", "passport", "employee_badge", "other"] as const;

const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <info@travelyt.us>";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function sendVerificationNotification(data: {
  email: string;
  phone?: string;
  role: string;
  documentType: string;
}) {
  if (!resendApiKey || !leadNotifyEmail) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: leadFromEmail,
      to: leadNotifyEmail,
      subject: `Identity verification requested: ${data.email}`,
      reply_to: data.email,
      text: [
        "Travelyt identity verification requested",
        "",
        `Email: ${data.email}`,
        `Phone: ${data.phone || "(none)"}`,
        `Role: ${data.role}`,
        `Document: ${data.documentType}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    console.error("Resend identity notification failed", await response.text());
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function sendAdultTravelerInvite(data: {
  email: string;
  bookingId: string;
  passengerName: string;
  token: string;
}) {
  if (!resendApiKey) return false;
  const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://travelyt.us"}/verify-traveler?token=${encodeURIComponent(data.token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: leadFromEmail,
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
    }),
  });
  if (!response.ok) console.error("Resend adult traveler invite failed", await response.text());
  return response.ok;
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
      role?: string;
      documentType?: string;
      bookingId?: string;
      passengerId?: string;
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
    const roleSource =
      body.role ||
      (typeof metadata.role === "string" ? metadata.role : undefined) ||
      "customer";
    const role = roles.includes(roleSource as (typeof roles)[number])
      ? roleSource
      : "customer";
    const documentType = documentTypes.includes(
      body.documentType as (typeof documentTypes)[number]
    )
      ? body.documentType!
      : "driver_license";
    const phone = typeof metadata.phone === "string" ? metadata.phone : null;

    const { data: existing, error: existingError } = await supabase
      .from("identity_verifications")
      .select("*")
      .eq("user_id", user.id)
      .eq("role", role)
      .in("status", ["pending", "manual_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("Identity verification lookup failed", existingError);
      return bad("Could not check verification status.", 500);
    }

    if (existing) {
      return NextResponse.json({
        ok: true,
        status: existing.status,
        existing: true,
      });
    }

    const { data, error } = await supabase
      .from("identity_verifications")
      .insert({
        user_id: user.id,
        email: user.email ?? null,
        phone,
        role,
        status: "pending",
        provider: "manual_prelaunch",
        document_type: documentType,
        liveness_required: true,
        liveness_status: "pending",
        metadata: {
          source: "profile",
          requested_by: user.id,
        },
      })
      .select("status")
      .single();

    if (error) {
      console.error("Identity verification insert failed", error);
      return bad("Could not request verification.", 500);
    }

    await sendVerificationNotification({
      email: user.email ?? "unknown",
      phone: phone ?? undefined,
      role,
      documentType,
    });

    return NextResponse.json({ ok: true, status: data.status });
  } catch {
    return bad("Could not request verification.");
  }
}
