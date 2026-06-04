import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";

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
    };
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
