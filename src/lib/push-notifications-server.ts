import type { BookingRow } from "@/lib/booking-mappers";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const statusTitles: Record<string, string> = {
  pending: "Booking received",
  paid: "Booking confirmed",
  assigned: "Driver assigned",
  accepted: "Driver accepted",
  en_route: "Driver en route",
  arrived: "Driver arrived",
  picked_up: "Bags picked up",
  in_transit: "Bags in transit",
  delivery_pending: "Delivery pending confirmation",
  delivered: "Bags delivered",
  closed: "Booking closed",
  cancelled: "Booking cancelled",
  issue: "Booking issue",
};

export interface PushTokenInput {
  token: string;
  platform: string;
  bookingId?: string | null;
  userId?: string | null;
}

function pushWorkerUrl() {
  const explicitUrl = process.env.SUPABASE_PUSH_WORKER_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) return undefined;

  try {
    const url = new URL(supabaseUrl);
    url.hostname = url.hostname.replace(".supabase.co", ".functions.supabase.co");
    url.pathname = "/send-push-notifications";
    url.search = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

async function triggerPushWorker(limit: number) {
  const secret = process.env.PUSH_WORKER_SECRET?.trim();
  const url = pushWorkerUrl();
  if (!secret || !url) return;

  try {
    const workerUrl = new URL(url);
    workerUrl.searchParams.set("limit", String(Math.max(1, limit)));
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "x-worker-secret": secret,
      },
    });

    if (!response.ok) {
      console.warn("Supabase push worker failed", await response.text());
    }
  } catch (error) {
    console.warn("Supabase push worker trigger failed", error);
  }
}

export async function savePushToken(input: PushTokenInput): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("push_tokens").upsert(
    {
      token: input.token,
      platform: input.platform || "unknown",
      booking_id: input.bookingId || null,
      user_id: input.userId || null,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );

  if (error) {
    console.warn("Supabase push token upsert failed", error);
    return false;
  }

  return true;
}

export async function queueBookingNotification(
  booking: BookingRow,
  reason: "status" | "proof"
): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("token, platform")
    .eq("booking_id", booking.id)
    .eq("enabled", true);

  if (error) {
    console.warn("Supabase push token lookup failed", error);
    return 0;
  }

  if (!tokens?.length) return 0;

  const title = statusTitles[booking.status] ?? "Travelyt update";
  const body =
    reason === "proof"
      ? `New proof photo added for booking ${booking.id}.`
      : `${title} for booking ${booking.id}.`;

  const { error: insertError } = await supabase
    .from("push_notification_events")
    .insert(
      tokens.map((row) => ({
        booking_id: booking.id,
        token: row.token,
        platform: row.platform || "unknown",
        title,
        body,
        data: {
          bookingId: booking.id,
          status: booking.status,
          reason,
        },
      }))
    );

  if (insertError) {
    console.warn("Supabase push notification queue failed", insertError);
    return 0;
  }

  await triggerPushWorker(tokens.length);

  return tokens.length;
}
