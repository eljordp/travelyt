import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <onboarding@resend.dev>";

async function sendLeadEmail({
  email,
  interest,
  source,
}: {
  email: string;
  interest: string;
  source: string;
}) {
  if (!resendApiKey || !leadNotifyEmail) return;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: leadFromEmail,
      to: leadNotifyEmail,
      subject: `New Travelyt lead: ${interest}`,
      reply_to: email,
      text: [
        "New Travelyt lead",
        "",
        `Email:    ${email}`,
        `Interest: ${interest}`,
        `Source:   ${source}`,
        `Created:  ${new Date().toISOString()}`,
      ].join("\n"),
    }),
  });

  if (!resendResponse.ok) {
    const message = await resendResponse.text();
    console.error("Resend lead notification failed", message);
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "leads:post", 10);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      email?: string;
      interest?: string;
      source?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const interest = body.interest?.trim() || "early-access";
    const source = body.source?.trim() || "site";

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

    const { error } = await supabase.from("leads").insert({
      email,
      interest,
      source,
      user_agent: userAgent,
      ip_hash: ipHash,
    });

    if (error) {
      console.error("Supabase lead insert failed", error);
      return NextResponse.json(
        { ok: false, error: "We could not save that request." },
        { status: 500 }
      );
    }

    await sendLeadEmail({ email, interest, source });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We could not save that request." },
      { status: 400 }
    );
  }
}
