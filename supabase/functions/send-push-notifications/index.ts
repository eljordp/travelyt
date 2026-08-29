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

interface FcmServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface FcmFailure {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ errorCode?: string }>;
  };
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
  const bytes = typeof input === "string"
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
    bytes.byteOffset + bytes.byteLength,
  );
}

async function apnsJwt(): Promise<string> {
  const keyId = env("APNS_KEY_ID");
  const teamId = env("APNS_TEAM_ID");
  const privateKey = env("APNS_PRIVATE_KEY");
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64Url(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
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

function fcmServiceAccount(): FcmServiceAccount {
  const raw = env("FCM_SERVICE_ACCOUNT_JSON");
  const parsed = JSON.parse(raw) as Partial<FcmServiceAccount>;

  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is missing required fields");
  }

  return parsed as FcmServiceAccount;
}

async function fcmAccessToken(account: FcmServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      body.error_description || "Could not authorize Firebase Messaging",
    );
  }

  return body.access_token;
}

function fcmData(event: PushEvent): Record<string, string> {
  const data: Record<string, string> = { bookingId: event.booking_id };
  for (const [key, value] of Object.entries(event.data ?? {})) {
    if (value !== null && value !== undefined) data[key] = String(value);
  }
  return data;
}

async function sendFcm(
  event: PushEvent,
  account: FcmServiceAccount,
  accessToken: string,
) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: event.token,
          notification: { title: event.title, body: event.body },
          data: fcmData(event),
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
        },
      }),
    },
  );

  if (response.ok) return { ok: true as const };

  const text = await response.text();
  let failure: FcmFailure = {};
  try {
    failure = JSON.parse(text) as FcmFailure;
  } catch {
    failure = { error: { message: text || response.statusText } };
  }
  const errorCode = failure.error?.details?.find((detail) => detail.errorCode)
    ?.errorCode;

  return {
    ok: false as const,
    status: response.status,
    reason: errorCode ||
      failure.error?.status ||
      failure.error?.message ||
      response.statusText,
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
    const supabase = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

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

    let apnsTokenPromise: Promise<string> | undefined;
    let fcmAccount: FcmServiceAccount | undefined;
    let fcmTokenPromise: Promise<string> | undefined;
    const results = {
      sent: 0,
      failed: 0,
      disabledTokens: 0,
    };

    for (const event of events) {
      if (event.platform !== "ios" && event.platform !== "android") {
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

      let sent:
        | { ok: true }
        | { ok: false; status: number; reason: string };
      try {
        if (event.platform === "ios") {
          apnsTokenPromise ??= apnsJwt();
          sent = await sendApns(event, await apnsTokenPromise);
        } else {
          fcmAccount ??= fcmServiceAccount();
          fcmTokenPromise ??= fcmAccessToken(fcmAccount);
          sent = await sendFcm(event, fcmAccount, await fcmTokenPromise);
        }
      } catch (error) {
        sent = {
          ok: false,
          status: 500,
          reason: error instanceof Error
            ? error.message
            : "Push provider failed",
        };
      }

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

      if (
        sent.reason === "Unregistered" ||
        sent.reason === "BadDeviceToken" ||
        sent.reason === "UNREGISTERED"
      ) {
        await supabase
          .from("push_tokens")
          .update({ enabled: false })
          .eq("token", event.token);
        results.disabledTokens += 1;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: events.length, ...results }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
