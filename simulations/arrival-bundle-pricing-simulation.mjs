#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  ARRIVAL_ADDITIONAL_BAG_CENTS,
  ARRIVAL_INCLUDED_BAGS,
  calcPriceBreakdown,
  calcPriceCents,
} from "../src/lib/pricing.ts";

const cases = [
  { bags: 1, expected: 4900, label: "one bag uses the arrival booking base" },
  { bags: 2, expected: 4900, label: "two bags are included in the arrival base" },
  { bags: 3, expected: 5900, label: "third bag adds ten dollars" },
  { bags: 6, expected: 8900, label: "six-bag family pays one base plus four additional bags" },
];

assert.equal(ARRIVAL_INCLUDED_BAGS, 2);
assert.equal(ARRIVAL_ADDITIONAL_BAG_CENTS, 1000);

for (const scenario of cases) {
  assert.equal(
    calcPriceCents(scenario.bags, "arrival"),
    scenario.expected,
    scenario.label
  );
  console.log(`PASS ${scenario.label}`);
}

const distance = calcPriceBreakdown(2, "arrival", false, 31);
assert.equal(distance.serviceSubtotalCents, 4900);
assert.equal(distance.distanceSurchargeCents, 225);
assert.equal(distance.totalBeforePromoCents, 5125);
console.log("PASS arrival distance surcharge is added once per booking");

const departure = calcPriceBreakdown(2, "departure");
assert.equal(departure.serviceSubtotalCents, 9800);
assert.equal(departure.extraBagDiscountCents, 1000);
assert.equal(departure.totalBeforePromoCents, 8800);
console.log("PASS departure per-bag pricing and discount remain unchanged");

console.log(`\n${cases.length + 2}/${cases.length + 2} arrival bundle checks passed.`);
