import { createHmac, timingSafeEqual } from "node:crypto";

export const RESEND_WEBHOOK_MAX_EVENT_AGE_SECONDS = 5 * 60;

export type ResendDeliveryStatus =
  | "sent"
  | "delivered"
  | "delayed"
  | "bounced"
  | "complained";

const STATUS_BY_EVENT: Record<string, ResendDeliveryStatus> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export function verifyResendWebhookSignature(input: {
  payload: string;
  messageId: string;
  timestamp: string;
  signatures: string;
  secret: string;
  nowMs?: number;
}) {
  const unixSeconds = Number(input.timestamp);
  const nowMs = input.nowMs ?? Date.now();
  if (
    !Number.isInteger(unixSeconds) ||
    Math.abs(nowMs / 1000 - unixSeconds) > RESEND_WEBHOOK_MAX_EVENT_AGE_SECONDS
  ) {
    return false;
  }

  try {
    const encodedSecret = input.secret.startsWith("whsec_")
      ? input.secret.slice("whsec_".length)
      : input.secret;
    const key = Buffer.from(encodedSecret, "base64");
    if (key.length < 16) return false;
    const expected = createHmac("sha256", key)
      .update(`${input.messageId}.${input.timestamp}.${input.payload}`)
      .digest("base64");

    return input.signatures.split(/\s+/).some((candidate) => {
      const signature = candidate.startsWith("v1,") ? candidate.slice(3) : "";
      if (!signature || signature.length !== expected.length) return false;
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    });
  } catch {
    return false;
  }
}

export type ParsedResendDeliveryEvent =
  | { ok: true; ignored: true }
  | {
      ok: true;
      ignored: false;
      providerMessageId: string;
      eventCreatedAt: string;
      status: ResendDeliveryStatus;
    }
  | { ok: false; error: string };

export function parseResendDeliveryEvent(payload: string): ParsedResendDeliveryEvent {
  let event: {
    type?: unknown;
    created_at?: unknown;
    data?: { email_id?: unknown };
  };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return { ok: false, error: "Resend webhook payload is not valid JSON." };
  }

  const eventType = typeof event.type === "string" ? event.type : "";
  const status = STATUS_BY_EVENT[eventType];
  if (!status) return { ok: true, ignored: true };

  const providerMessageId =
    typeof event.data?.email_id === "string" ? event.data.email_id.trim() : "";
  const eventCreatedAt =
    typeof event.created_at === "string" ? event.created_at.trim() : "";
  if (
    !providerMessageId ||
    providerMessageId.length > 255 ||
    !Number.isFinite(Date.parse(eventCreatedAt))
  ) {
    return { ok: false, error: "Resend webhook payload is incomplete." };
  }

  return {
    ok: true,
    ignored: false,
    providerMessageId,
    eventCreatedAt: new Date(eventCreatedAt).toISOString(),
    status,
  };
}
