import { NextResponse } from "next/server";
import { savePushToken } from "@/lib/push-notifications-server";
import { rateLimit } from "@/lib/rate-limit";

const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <onboarding@resend.dev>";

export async function POST(request: Request) {
  const limited = rateLimit(request, "push-tokens:post", 20);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      token?: string;
      platform?: string;
      userId?: string;
      bookingId?: string;
    };

    const token = body.token?.trim();
    const platform = body.platform?.trim() || "unknown";
    const userId = body.userId?.trim() || null;
    const bookingId = body.bookingId?.trim() || null;

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
      bookingId,
      receivedAt: new Date().toISOString(),
    };

    const persisted = await savePushToken({ token, platform, userId, bookingId });

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
            `Booking:  ${bookingId ?? "(none)"}`,
            `Received: ${record.receivedAt}`,
            `Persisted: ${persisted ? "yes" : "no"}`,
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
