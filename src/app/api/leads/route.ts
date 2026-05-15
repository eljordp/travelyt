import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <onboarding@resend.dev>";

export async function POST(request: Request) {
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

    const lead = {
      email,
      interest,
      source,
      createdAt: new Date().toISOString(),
    };

    if (!resendApiKey || !leadNotifyEmail) {
      console.warn("Travelyt lead captured without email provider", lead);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Lead notifications are not configured yet. Set RESEND_API_KEY and LEAD_NOTIFY_EMAIL.",
        },
        { status: 503 }
      );
    }

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
          `Email: ${email}`,
          `Interest: ${interest}`,
          `Source: ${source}`,
          `Created: ${lead.createdAt}`,
        ].join("\n"),
      }),
    });

    if (!resendResponse.ok) {
      const message = await resendResponse.text();
      console.error("Resend lead notification failed", message);
      return NextResponse.json(
        { ok: false, error: "Lead notification failed." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We could not save that request." },
      { status: 400 }
    );
  }
}
