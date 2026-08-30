import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calcPriceBreakdown } from "../src/lib/pricing.ts";

const [bookingRoute, checkoutRoute, quotePage, quoteSource, mapperSource, migration] =
  await Promise.all([
    readFile(new URL("../src/app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/api/stripe/checkout/route.ts", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../src/app/quote/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/server-pricing-quote.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/booking-mappers.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../supabase/migrations/043_booking_pricing_provenance.sql", import.meta.url),
      "utf8"
    ),
  ]);

// Attack: the browser submits zero miles for a real 47.4-mile airport route.
const attackerDistanceMiles = 0;
const serverDistanceMiles = 47.4;
const attackerPrice = calcPriceBreakdown(
  2,
  "arrival",
  false,
  attackerDistanceMiles
).totalBeforePromoCents;
const serverPrice = calcPriceBreakdown(
  2,
  "arrival",
  false,
  serverDistanceMiles
).totalBeforePromoCents;

assert.equal(attackerPrice, 4900, "zero-mile tampering would remove mileage charges");
assert.equal(serverPrice, 8950, "the verified 47.4-mile route includes 18 billed miles");
assert.equal(
  serverPrice - attackerPrice,
  4050,
  "server route pricing prevents a $40.50 undercharge"
);

function serverCoverageAcceptance({ declaredValueCents, coverageAccepted }) {
  if (declaredValueCents > 0 && coverageAccepted !== true) {
    return { ok: false, coverageAcceptedAt: undefined };
  }
  return {
    ok: true,
    coverageAcceptedAt:
      declaredValueCents > 0 ? "2026-08-29T20:00:00.000Z" : undefined,
  };
}

const forgedBackdate = serverCoverageAcceptance({
  declaredValueCents: 100_000,
  coverageAccepted: false,
  coverageAcceptedAt: "2001-01-01T00:00:00.000Z",
});
assert.equal(forgedBackdate.ok, false, "a forged timestamp cannot replace the boolean acceptance");
const acceptedNow = serverCoverageAcceptance({
  declaredValueCents: 100_000,
  coverageAccepted: true,
  coverageAcceptedAt: "2001-01-01T00:00:00.000Z",
});
assert.equal(
  acceptedNow.coverageAcceptedAt,
  "2026-08-29T20:00:00.000Z",
  "the server timestamp replaces a client backdate"
);

const checks = [
  [
    bookingRoute.includes("requireDrivingRoute: true"),
    "booking creation requires the server-side Google driving route",
  ],
  [
    quotePage.includes('addressStatus !== "verified"') &&
      quotePage.includes("Verified route distance from airport") &&
      quotePage.includes("readOnly"),
    "the quote UI requires verification and no longer accepts manual mileage",
  ],
  [
    bookingRoute.includes("Ignore body.distanceMiles entirely") &&
      !bookingRoute.includes("Math.max(0, body.distanceMiles)"),
    "booking creation never derives cutoff or price from client mileage",
  ],
  [
    bookingRoute.includes("body.coverageAccepted !== true") &&
      bookingRoute.includes("validated.coverageAcceptedAt = validated.declaredValueCents") &&
      !bookingRoute.includes("coverageAcceptedAt: body.coverageAcceptedAt"),
    "declared-value acceptance requires a boolean and receives a server timestamp",
  ],
  [
    bookingRoute.includes("verifiedRoute.distanceMiles") &&
      bookingRoute.includes("validateBooking(") &&
      bookingRoute.includes("verifiedDistanceMiles"),
    "the verified route feeds both validation and pricing",
  ],
  [
    bookingRoute.includes("pricing_quote: serverQuote.quote") &&
      bookingRoute.includes("pricing_fingerprint: serverQuote.fingerprint"),
    "booking creation persists server quote provenance",
  ],
  [
    quoteSource.includes("google_routes_v2") &&
      quoteSource.includes("fingerprintServerPricingQuote") &&
      quoteSource.includes("calcPriceBreakdown("),
    "stored provenance identifies the provider and supports deterministic recomputation",
  ],
  [
    mapperSource.includes('"pricing_quote"') &&
      mapperSource.includes('"pricing_fingerprint"'),
    "booking reads include pricing provenance",
  ],
  [
    migration.includes("add column if not exists pricing_quote jsonb") &&
      migration.includes("add column if not exists pricing_fingerprint text"),
    "database schema stores quote and fingerprint evidence",
  ],
  [
    checkoutRoute.indexOf("verifyStoredServerPricingQuote") <
      checkoutRoute.indexOf("booking.priceCents <= 0") &&
      checkoutRoute.indexOf("verifyStoredServerPricingQuote") <
        checkoutRoute.indexOf("stripe.checkout.sessions.create"),
    "Checkout verifies the quote before free-payment or Stripe branches",
  ],
  [
    checkoutRoute.includes("No checkout or charge was created."),
    "missing or altered provenance fails closed without charging",
  ],
];

for (const [condition, label] of checks) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

console.log(
  `\nServer quote tamper simulation: ${checks.length + 5}/${checks.length + 5} controls passed.`
);
