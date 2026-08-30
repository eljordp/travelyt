import Stripe from "stripe";

let cached: Stripe | null = null;
const modeClients = new Map<string, Stripe>();

function stripeClient(secretKey: string) {
  const existing = modeClients.get(secretKey);
  if (existing) return existing;
  const client = new Stripe(secretKey, {
    appInfo: {
      name: "Travelyt",
      url: "https://travelyt.us",
    },
  });
  modeClients.set(secretKey, client);
  return client;
}

export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (cached) return cached;

  cached = new Stripe(secretKey, {
    appInfo: {
      name: "Travelyt",
      url: "https://travelyt.us",
    },
  });
  return cached;
}

function keyLivemode(secretKey: string | undefined) {
  const value = secretKey?.trim() ?? "";
  if (/^(?:sk|rk)_live_/.test(value)) return true;
  if (/^(?:sk|rk)_test_/.test(value)) return false;
  return null;
}

export function getStripeForLivemode(livemode: boolean): Stripe | null {
  const modeKey = livemode
    ? process.env.STRIPE_LIVE_SECRET_KEY?.trim()
    : process.env.STRIPE_TEST_SECRET_KEY?.trim();
  if (modeKey && keyLivemode(modeKey) === livemode) return stripeClient(modeKey);
  const current = process.env.STRIPE_SECRET_KEY?.trim();
  if (current && keyLivemode(current) === livemode) return stripeClient(current);
  return null;
}

export function getStripeIdentityRestrictedKeyForLivemode(livemode: boolean) {
  const modeKey = livemode
    ? process.env.STRIPE_IDENTITY_LIVE_RESTRICTED_KEY?.trim()
    : process.env.STRIPE_IDENTITY_TEST_RESTRICTED_KEY?.trim();
  if (modeKey && keyLivemode(modeKey) === livemode) return modeKey;
  const current = process.env.STRIPE_IDENTITY_RESTRICTED_KEY?.trim();
  return current && keyLivemode(current) === livemode ? current : null;
}

export function configuredStripeLivemode(): boolean | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  if (/^(?:sk|rk)_live_/.test(secretKey)) return true;
  if (/^(?:sk|rk)_test_/.test(secretKey)) return false;
  return null;
}

export function getSiteUrl(request?: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  const fallback = request ? new URL(request.url).origin : "https://travelyt.us";
  const value = configured || fallback;
  return value.startsWith("http") ? value : `https://${value}`;
}
