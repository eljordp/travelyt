const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type TransactionalEmailResult =
  | { status: "sent"; providerMessageId?: string }
  | { status: "not_configured" }
  | { status: "failed"; providerStatus?: number };

export function emailDeliveryReadiness() {
  return {
    provider: "resend" as const,
    apiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    fromAddressConfigured: Boolean(process.env.LEAD_FROM_EMAIL?.trim()),
  };
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
    const result = (await response.json().catch(() => null)) as { id?: string } | null;
    return { status: "sent", providerMessageId: result?.id };
  } catch {
    return { status: "failed" };
  }
}
