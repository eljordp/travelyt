import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

type GscConfig = {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
};

export function gscConfig(): GscConfig | null {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  const siteUrl = process.env.GSC_SITE_URL;
  if (!raw || !siteUrl) return null;

  try {
    const serviceAccount = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
    };
    if (!serviceAccount.client_email || !serviceAccount.private_key) return null;
    return {
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
      siteUrl,
    };
  } catch {
    return null;
  }
}

function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

export async function getAccessToken({ clientEmail, privateKey }: GscConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const assertion = `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Google token exchange failed"
    );
  }

  return data.access_token;
}

export async function querySearchAnalytics(
  token: string,
  siteUrl: string,
  body: Record<string, unknown>
) {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    rows?: unknown[];
  };

  if (!response.ok) {
    throw new Error(data.error?.message || "Search Console query failed");
  }

  return data;
}

export function isoDate(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}
