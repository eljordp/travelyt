import { createHash } from "node:crypto";
import type { ServiceType } from "@/lib/bookings";
import { calcPriceBreakdown, type PriceBreakdown } from "@/lib/pricing";
import { getPromoDiscountCents, normalizePromoCode } from "@/lib/promos";
import type { VerifiedRouteDistance } from "@/lib/server-route-distance";

export const SERVER_PRICING_VERSION = "travelyt-pricing-2026-08-29";

export interface StoredServerPricingQuote {
  version: string;
  bookingId: string;
  generatedAt: string;
  service: ServiceType;
  airport: string;
  address: string;
  bags: number;
  expressPickup: boolean;
  promoCode: string | null;
  promoDiscountCents: number;
  route: {
    provider: "google_routes_v2";
    source: "driving_route";
    distanceMiles: number;
    latitude: number;
    longitude: number;
    verifiedAt: string;
    distanceText?: string;
    durationText?: string;
  };
  breakdown: PriceBreakdown;
  totalCents: number;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function fingerprintServerPricingQuote(quote: StoredServerPricingQuote) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(quote)))
    .digest("hex");
}

export function buildServerPricingQuote({
  bookingId,
  service,
  airport,
  address,
  bags,
  expressPickup,
  promoCode,
  route,
}: {
  bookingId: string;
  service: ServiceType;
  airport: string;
  address: string;
  bags: number;
  expressPickup: boolean;
  promoCode?: string | null;
  route: VerifiedRouteDistance & { ok: true; distanceSource: "driving_route" };
}) {
  const normalizedPromoCode = normalizePromoCode(promoCode);
  const breakdown = calcPriceBreakdown(
    bags,
    service,
    expressPickup,
    route.distanceMiles
  );
  const promoDiscountCents = getPromoDiscountCents(
    breakdown.promoEligibleCents,
    normalizedPromoCode
  );
  const quote: StoredServerPricingQuote = {
    version: SERVER_PRICING_VERSION,
    bookingId,
    generatedAt: route.verifiedAt,
    service,
    airport,
    address,
    bags,
    expressPickup,
    promoCode: normalizedPromoCode ?? null,
    promoDiscountCents,
    route: {
      provider: "google_routes_v2",
      source: "driving_route",
      distanceMiles: route.distanceMiles,
      latitude: route.latitude,
      longitude: route.longitude,
      verifiedAt: route.verifiedAt,
      distanceText: route.distanceText,
      durationText: route.durationText,
    },
    breakdown,
    totalCents: Math.max(
      0,
      breakdown.totalBeforePromoCents - promoDiscountCents
    ),
  };

  return {
    quote,
    fingerprint: fingerprintServerPricingQuote(quote),
  };
}

export function verifyStoredServerPricingQuote({
  bookingId,
  service,
  airport,
  address,
  bags,
  priceCents,
  quoteValue,
  fingerprint,
}: {
  bookingId: string;
  service: ServiceType;
  airport: string;
  address: string;
  bags: number;
  priceCents: number;
  quoteValue: unknown;
  fingerprint?: string | null;
}): { ok: true; quote: StoredServerPricingQuote } | { ok: false; error: string } {
  if (!quoteValue || typeof quoteValue !== "object" || Array.isArray(quoteValue)) {
    return { ok: false, error: "Server pricing provenance is missing." };
  }
  const quote = quoteValue as StoredServerPricingQuote;
  if (
    quote.version !== SERVER_PRICING_VERSION ||
    quote.bookingId !== bookingId ||
    quote.service !== service ||
    quote.airport !== airport ||
    quote.address !== address ||
    quote.bags !== bags ||
    quote.route?.provider !== "google_routes_v2" ||
    quote.route.source !== "driving_route" ||
    !Number.isFinite(quote.route.distanceMiles) ||
    !Number.isFinite(quote.route.latitude) ||
    !Number.isFinite(quote.route.longitude) ||
    Number.isNaN(Date.parse(quote.route.verifiedAt)) ||
    typeof quote.expressPickup !== "boolean"
  ) {
    return { ok: false, error: "Server pricing provenance does not match this booking." };
  }
  if (
    !fingerprint ||
    !/^[a-f0-9]{64}$/i.test(fingerprint) ||
    fingerprintServerPricingQuote(quote) !== fingerprint.toLowerCase()
  ) {
    return { ok: false, error: "Server pricing provenance fingerprint is invalid." };
  }

  const normalizedPromoCode = normalizePromoCode(quote.promoCode);
  if ((normalizedPromoCode ?? null) !== quote.promoCode) {
    return { ok: false, error: "Stored promotion provenance is invalid." };
  }
  const breakdown = calcPriceBreakdown(
    bags,
    service,
    quote.expressPickup,
    quote.route.distanceMiles
  );
  const promoDiscountCents = getPromoDiscountCents(
    breakdown.promoEligibleCents,
    normalizedPromoCode
  );
  const expectedTotalCents = Math.max(
    0,
    breakdown.totalBeforePromoCents - promoDiscountCents
  );
  if (
    JSON.stringify(canonicalize(quote.breakdown)) !==
      JSON.stringify(canonicalize(breakdown)) ||
    quote.promoDiscountCents !== promoDiscountCents ||
    quote.totalCents !== expectedTotalCents ||
    priceCents !== expectedTotalCents
  ) {
    return { ok: false, error: "Stored booking price does not match its server quote." };
  }

  return { ok: true, quote };
}
