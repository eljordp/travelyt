import { NextResponse } from "next/server";
import {
  parseResendDeliveryEvent,
  verifyResendWebhookSignature,
} from "@/lib/resend-webhook";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return json({ ok: false, error: "Resend webhook is not configured." }, 503);
  const messageId = request.headers.get("svix-id")?.trim() ?? "";
  const timestamp = request.headers.get("svix-timestamp")?.trim() ?? "";
  const signatures = request.headers.get("svix-signature")?.trim() ?? "";
  const payload = await request.text();
  if (!messageId || !timestamp || !signatures || !verifyResendWebhookSignature({
    payload, messageId, timestamp, signatures, secret: webhookSecret,
  })) {
    return json({ ok: false, error: "Invalid Resend webhook signature." }, 400);
  }

  const event = parseResendDeliveryEvent(payload);
  if (!event.ok) return json({ ok: false, error: event.error }, 400);
  if (event.ignored) return json({ ok: true, ignored: true });
  const supabase = getSupabaseAdmin();
  if (!supabase) return json({ ok: false, error: "Delivery evidence backend is not configured." }, 503);
  const { data, error } = await supabase.rpc("record_resend_delivery_event", {
    p_provider_message_id: event.providerMessageId,
    p_provider_event_id: messageId,
    p_provider_event_created_at: event.eventCreatedAt,
    p_status: event.status,
  });
  if (error) {
    console.error("Resend delivery reconciliation failed", error);
    return json({ ok: false, error: "Could not record delivery evidence." }, 500);
  }
  return json({ ok: true, recorded: data === true });
}
