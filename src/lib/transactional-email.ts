import { createHash } from "node:crypto";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const EMAIL_DELIVERY_PROOF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type TransactionalEmailResult =
  | { status: "accepted"; providerMessageId: string }
  | { status: "not_configured" }
  | { status: "failed"; providerStatus?: number };

export function emailDeliveryReadiness() {
  return {
    provider: "resend" as const,
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    fromAddressConfigured: Boolean(process.env.LEAD_FROM_EMAIL?.trim()),
    webhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
    providerConfigHash: emailProviderConfigHash(),
  };
}

export function emailProviderConfigHash() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.LEAD_FROM_EMAIL?.trim().toLowerCase();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!apiKey || !from || !webhookSecret) return null;
  return createHash("sha256")
    .update(JSON.stringify({ version: 1, provider: "resend", from, apiKey, webhookSecret }))
    .digest("hex");
}

function recipients(value: string | string[]) {
  return (Array.isArray(value) ? value : value.split(","))
    .map((address) => address.trim())
    .filter(Boolean);
}

export async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
  idempotencyKey?: string;
}): Promise<TransactionalEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.LEAD_FROM_EMAIL?.trim();
  const to = recipients(input.to);
  if (!apiKey || !from || to.length === 0) return { status: "not_configured" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { status: "failed", providerStatus: response.status };
    }
    const result = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const providerMessageId =
      typeof result?.id === "string" ? result.id.trim() : "";
    if (!providerMessageId || providerMessageId.length > 255) {
      // A 2xx response without a provider ID cannot be reconciled to a signed
      // delivery webhook, so it is not durable evidence of an accepted send.
      return { status: "failed", providerStatus: response.status };
    }
    return { status: "accepted", providerMessageId };
  } catch {
    return { status: "failed" };
  }
}
