import Stripe from "stripe";

let cached: Stripe | null = null;

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

export function getSiteUrl(request?: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  const fallback = request ? new URL(request.url).origin : "https://travelyt.us";
  const value = configured || fallback;
  return value.startsWith("http") ? value : `https://${value}`;
}
