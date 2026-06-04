export const PROMO_CODES: Record<string, { percentOff: number; label: string }> = {
  TRAVELYT30: { percentOff: 30, label: "Launch offer — 30% off" },
};

export function normalizePromoCode(input?: string | null): string | undefined {
  if (!input) return undefined;
  const code = input.trim().toUpperCase();
  return PROMO_CODES[code] ? code : undefined;
}

export function getPromoDiscountCents(
  subtotalCents: number,
  code?: string | null
): number {
  const normalized = normalizePromoCode(code);
  if (!normalized) return 0;
  const promo = PROMO_CODES[normalized];
  return Math.round((subtotalCents * promo.percentOff) / 100);
}
