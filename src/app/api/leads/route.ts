import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <info@travelyt.us>";

function safeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

async function sendLeadNotification(lead: {
  email: string;
  name?: string;
  phone?: string;
  interest: string;
  source: string;
  metadata?: Record<string, unknown>;
}) {
  if (!resendApiKey || !leadNotifyEmail) return;

  const metadataLines = Object.entries(lead.metadata ?? {})
    .map(([key, value]) => `${key}: ${safeText(value) || JSON.stringify(value)}`)
    .join("\n");

  const text = [
    "New Travelyt lead",
    "",
    `Email:    ${lead.email}`,
    `Name:     ${lead.name || "(none)"}`,
    `Phone:    ${lead.phone || "(none)"}`,
    `Interest: ${lead.interest}`,
    `Source:   ${lead.source}`,
    "",
    metadataLines || "(no trip metadata)",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: leadFromEmail,
      to: leadNotifyEmail,
      subject:
        lead.interest === "booking-started"
          ? `Travelyt booking started: ${lead.email}`
          : `New Travelyt lead: ${lead.email}`,
      reply_to: lead.email,
      text,
    }),
  });

  if (!response.ok) {
    console.error("Resend lead notification failed", await response.text());
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "leads:post", 10);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      phone?: string;
      interest?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    };

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const phone = body.phone?.trim();
    const interest = body.interest?.trim() || "early-access";
    const source = body.source?.trim() || "site";
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    if (!email || !emailPattern.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      console.warn("Travelyt lead captured without Supabase configured", {
        email,
        interest,
        source,
      });
      return NextResponse.json(
        { ok: false, error: "Lead capture is not configured yet." },
        { status: 503 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "";
    const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null;
    const userAgent = request.headers.get("user-agent") || null;

    const basePayload = {
      email,
      interest,
      source,
      user_agent: userAgent,
      ip_hash: ipHash,
    };

    const extendedPayload = {
      ...basePayload,
      name: name || null,
      phone: phone || null,
      metadata,
    };

    const { error } = await supabase.from("leads").insert(extendedPayload);

    if (error && /column .* does not exist/i.test(error.message)) {
      const fallback = await supabase.from("leads").insert(basePayload);
      if (fallback.error) {
        console.error("Supabase lead insert failed", fallback.error);
        return NextResponse.json(
          { ok: false, error: "We could not save that request." },
          { status: 500 }
        );
      }
    } else if (error) {
      console.error("Supabase lead insert failed", error);
      return NextResponse.json(
        { ok: false, error: "We could not save that request." },
        { status: 500 }
      );
    }

    await sendLeadNotification({ email, name, phone, interest, source, metadata });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We could not save that request." },
      { status: 400 }
    );
  }
}
