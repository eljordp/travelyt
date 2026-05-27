import type { ServiceType } from "@/lib/bookings";

export const SERVICE_PRICES_CENTS: Record<ServiceType, number> = {
  departure: 4900,
  arrival: 2900,
  both: 6900,
};

export const EXPRESS_PICKUP_CENTS = 2000;
export const EXTRA_BAG_DISCOUNT_CENTS = 1000;
export const FAMILY_BUNDLE_MIN_BAGS = 4;
export const FAMILY_BUNDLE_PERCENT = 15;
export const INCLUDED_DISTANCE_MILES = 30;
export const STANDARD_DISTANCE_RATE_CENTS = 225;
export const EXPRESS_DISTANCE_RATE_CENTS = 450;

export interface PriceBreakdown {
  serviceSubtotalCents: number;
  expressPickupCents: number;
  distanceMiles?: number;
  includedDistanceMiles: number;
  extraDistanceMiles: number;
  distanceRateCents: number;
  distanceSurchargeCents: number;
  subtotalCents: number;
  extraBagDiscountCents: number;
  familyBundleDiscountCents: number;
  automaticDiscountCents: number;
  automaticDiscountLabel?: string;
  promoEligibleCents: number;
  totalBeforePromoCents: number;
}

export function calcPriceBreakdown(
  bags: number,
  service: ServiceType,
  expressPickup = false,
  distanceMiles?: number
): PriceBreakdown {
  const safeBags = Math.max(1, bags);
  const safeDistance =
    typeof distanceMiles === "number" && Number.isFinite(distanceMiles)
      ? Math.max(0, distanceMiles)
      : undefined;
  const extraDistanceMiles =
    safeDistance === undefined
      ? 0
      : Math.max(0, Math.ceil(safeDistance - INCLUDED_DISTANCE_MILES));
  const serviceSubtotalCents = SERVICE_PRICES_CENTS[service] * safeBags;
  const expressPickupCents = expressPickup ? EXPRESS_PICKUP_CENTS : 0;
  const distanceRateCents = expressPickup
    ? EXPRESS_DISTANCE_RATE_CENTS
    : STANDARD_DISTANCE_RATE_CENTS;
  const distanceSurchargeCents =
    extraDistanceMiles * distanceRateCents;
  const subtotalCents =
    serviceSubtotalCents + expressPickupCents + distanceSurchargeCents;
  const extraBagDiscountCents =
    safeBags > 1 ? (safeBags - 1) * EXTRA_BAG_DISCOUNT_CENTS : 0;
  const familyBundleDiscountCents =
    safeBags >= FAMILY_BUNDLE_MIN_BAGS
      ? Math.round((serviceSubtotalCents * FAMILY_BUNDLE_PERCENT) / 100)
      : 0;
  const automaticDiscountCents = Math.max(
    extraBagDiscountCents,
    familyBundleDiscountCents
  );
  const automaticDiscountLabel =
    automaticDiscountCents === 0
      ? undefined
      : familyBundleDiscountCents > extraBagDiscountCents
        ? "Family bundle discount"
        : "Extra bag discount";

  return {
    serviceSubtotalCents,
    expressPickupCents,
    distanceMiles: safeDistance,
    includedDistanceMiles: INCLUDED_DISTANCE_MILES,
    extraDistanceMiles,
    distanceRateCents,
    distanceSurchargeCents,
    subtotalCents,
    extraBagDiscountCents,
    familyBundleDiscountCents,
    automaticDiscountCents,
    automaticDiscountLabel,
    promoEligibleCents:
      serviceSubtotalCents + expressPickupCents - automaticDiscountCents,
    totalBeforePromoCents: subtotalCents - automaticDiscountCents,
  };
}

export function calcPriceCents(
  bags: number,
  service: ServiceType,
  expressPickup = false,
  distanceMiles?: number
): number {
  return calcPriceBreakdown(
    bags,
    service,
    expressPickup,
    distanceMiles
  ).totalBeforePromoCents;
}
