/// <reference lib="deno.ns" />

import { createClient } from "npm:@supabase/supabase-js@2.105.4";

interface PushEvent {
  id: string;
  booking_id: string;
  token: string;
  platform: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

interface ApnsFailure {
  reason?: string;
  timestamp?: number;
}

const jsonHeaders = {
  "Content-Type": "application/json",
};

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function base64Url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function pemToDer(privateKey: string): ArrayBuffer {
  const normalized = privateKey.replaceAll("\\n", "\n");
  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
}

async function apnsJwt(): Promise<string> {
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const privateKey = env("APNS_PRIVATE_KEY");
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64Url(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64Url(signature)}`;
}

function apnsHost(): string {
  return Deno.env.get("APNS_PRODUCTION") === "true"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
}

function apnsPayload(event: PushEvent) {
  return {
    aps: {
      alert: {
        title: event.title,
        body: event.body,
      },
      sound: "default",
    },
    bookingId: event.booking_id,
    ...(event.data ?? {}),
  };
}

async function sendApns(event: PushEvent, jwt: string) {
  const response = await fetch(`${apnsHost()}/3/device/${event.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": env("APNS_BUNDLE_ID"),
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(apnsPayload(event)),
  });

  if (response.ok) return { ok: true as const };

  const text = await response.text();
  let failure: ApnsFailure = {};
  try {
    failure = JSON.parse(text) as ApnsFailure;
  } catch {
    failure = { reason: text || response.statusText };
  }

  return {
    ok: false as const,
    status: response.status,
    reason: failure.reason || response.statusText,
  };
}

function authorized(request: Request): boolean {
  const secret = Deno.env.get("PUSH_WORKER_SECRET")?.trim();
  if (!secret) return true;
  return request.headers.get("x-worker-secret") === secret;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Use POST." }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (!authorized(request)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? "25");
    const limit = Math.max(1, Math.min(100, requestedLimit || 25));

    const { data: events, error } = await supabase
      .from("push_notification_events")
      .select("id, booking_id, token, platform, title, body, data")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limit)
      .returns<PushEvent[]>();

    if (error) throw error;
    if (!events?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: jsonHeaders,
      });
    }

    const jwt = await apnsJwt();
    const results = {
      sent: 0,
      failed: 0,
      disabledTokens: 0,
    };

    for (const event of events) {
      if (event.platform !== "ios") {
        await supabase
          .from("push_notification_events")
          .update({
            status: "failed",
            error: `Unsupported platform: ${event.platform}`,
          })
          .eq("id", event.id);
        results.failed += 1;
        continue;
      }

      const sent = await sendApns(event, jwt);
      if (sent.ok) {
        await supabase
          .from("push_notification_events")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", event.id);
        results.sent += 1;
        continue;
      }

      const errorMessage = `${sent.status}: ${sent.reason}`;
      await supabase
        .from("push_notification_events")
        .update({
          status: "failed",
          error: errorMessage,
        })
        .eq("id", event.id);
      results.failed += 1;

      if (sent.reason === "Unregistered" || sent.reason === "BadDeviceToken") {
        await supabase
          .from("push_tokens")
          .update({ enabled: false })
          .eq("token", event.token);
        results.disabledTokens += 1;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: events.length, ...results }),
      { headers: jsonHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
