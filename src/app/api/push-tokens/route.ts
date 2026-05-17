import { NextResponse } from "next/server";

const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <onboarding@resend.dev>";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      platform?: string;
      userId?: string;
    };

    const token = body.token?.trim();
    const platform = body.platform?.trim() || "unknown";
    const userId = body.userId?.trim() || null;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing token." },
        { status: 400 }
      );
    }

    const record = {
      token,
      platform,
      userId,
      receivedAt: new Date().toISOString(),
    };

    console.log("Push token registered", record);

    if (resendApiKey && leadNotifyEmail) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: leadFromEmail,
          to: leadNotifyEmail,
          subject: `Travelyt push token registered (${platform})`,
          text: [
            "Travelyt push token registered",
            "",
            `Platform: ${platform}`,
            `User ID:  ${userId ?? "(anonymous)"}`,
            `Received: ${record.receivedAt}`,
            "",
            "Token (store securely for push send):",
            token,
          ].join("\n"),
        }),
      }).catch((err) =>
        console.warn("token notify email failed", err)
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not register token." },
      { status: 400 }
    );
  }
}
