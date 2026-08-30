import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { savePushToken } from "@/lib/push-notifications-server";
import { rateLimit } from "@/lib/rate-limit";
import { durableRateLimit } from "@/lib/durable-rate-limit";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";

const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;

function tokenMatches(expected: string | null, supplied: string | undefined) {
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "push-tokens:post", 20);
  if (limited) return limited;
  const durableLimited = await durableRateLimit(request, "push-tokens:post", 20, 60_000);
  if (durableLimited) return durableLimited;

  try {
    const body = (await request.json()) as {
      token?: string;
      platform?: string;
      bookingId?: string;
      accessToken?: string;
    };

    const token = body.token?.trim();
    const platform = body.platform?.trim() || "unknown";
    const bookingId = body.bookingId?.trim() || null;
    const accessToken = body.accessToken?.trim();

    if (!token || token.length > 4096) {
      return NextResponse.json(
        { ok: false, error: "Push token is invalid." },
        { status: 400 }
      );
    }
    if (!/^[a-z0-9._-]{1,32}$/i.test(platform)) {
      return NextResponse.json({ ok: false, error: "Push platform is invalid." }, { status: 400 });
    }

    const user = await getRequestUser(request);
    const userId = user?.id ?? null;
    if (bookingId) {
      if (!/^TVT-[A-Za-z0-9_-]{6,40}$/.test(bookingId)) {
        return NextResponse.json({ ok: false, error: "Booking ID is invalid." }, { status: 400 });
      }
      const supabase = getSupabaseAdmin();
      if (!supabase) {
        return NextResponse.json({ ok: false, error: "Push registration is unavailable." }, { status: 503 });
      }
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("customer_user_id, customer_access_token")
        .eq("id", bookingId)
        .maybeSingle<{ customer_user_id: string | null; customer_access_token: string | null }>();
      if (bookingError) {
        return NextResponse.json({ ok: false, error: "Could not authorize push registration." }, { status: 500 });
      }
      if (!booking) {
        return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
      }
      const ownerAuthorized = Boolean(userId && booking.customer_user_id === userId);
      if (!ownerAuthorized && !tokenMatches(booking.customer_access_token, accessToken)) {
        return NextResponse.json({ ok: false, error: "Customer access is required." }, { status: 403 });
      }
    } else if (!userId) {
      return NextResponse.json({ ok: false, error: "Sign in before enabling account notifications." }, { status: 401 });
    }

    const receivedAt = new Date().toISOString();

    const persisted = await savePushToken({ token, platform, userId, bookingId });

    console.log("Push token registered", {
      platform,
      userId: userId ?? "(access-token customer)",
      bookingId,
      receivedAt,
      persisted,
    });

    if (leadNotifyEmail) {
      const delivery = await sendTransactionalEmail({
        to: leadNotifyEmail,
        subject: `Travelyt push token registered (${platform})`,
        text: [
          "Travelyt push token registered",
          "",
          `Platform: ${platform}`,
          `User ID:  ${userId ?? "(anonymous)"}`,
          `Booking:  ${bookingId ?? "(none)"}`,
          `Received: ${receivedAt}`,
          `Persisted: ${persisted ? "yes" : "no"}`,
        ].join("\n"),
      });
      if (delivery.status === "failed") {
        console.warn("Push-token notification delivery failed", delivery);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not register token." },
      { status: 400 }
    );
  }
}
