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

export interface PriceBreakdown {
  serviceSubtotalCents: number;
  expressPickupCents: number;
  subtotalCents: number;
  extraBagDiscountCents: number;
  familyBundleDiscountCents: number;
  automaticDiscountCents: number;
  automaticDiscountLabel?: string;
  totalBeforePromoCents: number;
}

export function calcPriceBreakdown(
  bags: number,
  service: ServiceType,
  expressPickup = false
): PriceBreakdown {
  const safeBags = Math.max(1, bags);
  const serviceSubtotalCents = SERVICE_PRICES_CENTS[service] * safeBags;
  const expressPickupCents = expressPickup ? EXPRESS_PICKUP_CENTS : 0;
  const subtotalCents = serviceSubtotalCents + expressPickupCents;
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
    subtotalCents,
    extraBagDiscountCents,
    familyBundleDiscountCents,
    automaticDiscountCents,
    automaticDiscountLabel,
    totalBeforePromoCents: subtotalCents - automaticDiscountCents,
  };
}

export function calcPriceCents(
  bags: number,
  service: ServiceType,
  expressPickup = false
): number {
  return calcPriceBreakdown(bags, service, expressPickup).totalBeforePromoCents;
}
