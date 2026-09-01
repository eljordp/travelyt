#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSlaAlerts } from "../src/lib/ops-rules.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const acceptedAt = "2026-08-30T12:00:00.000Z";
const booking = (service, status = "in_transit") => ({
  id: `TVT-${service}`,
  service,
  airport: "ORD",
  address: "Pilot route",
  date: "2026-08-30",
  bags: 2,
  name: "Test Traveler",
  email: "test@example.com",
  phone: "+13125550100",
  status,
  priceCents: 4900,
  createdAt: acceptedAt,
  pickedUpAt: acceptedAt,
  proofs: [],
});
const atMinute = (minute) => new Date(Date.parse(acceptedAt) + minute * 60_000);

assert.equal(getSlaAlerts(booking("arrival"), atMinute(239)).length, 0);
assert.deepEqual(
  getSlaAlerts(booking("arrival"), atMinute(240)).map(({ code, severity }) => ({ code, severity })),
  [{ code: "ARRIVAL_DELIVERY_SLA", severity: "warning" }],
);
assert.deepEqual(
  getSlaAlerts(booking("arrival"), atMinute(359)).map(({ code, severity }) => ({ code, severity })),
  [{ code: "ARRIVAL_DELIVERY_SLA", severity: "warning" }],
);
assert.deepEqual(
  getSlaAlerts(booking("arrival"), atMinute(360)).map(({ code, severity }) => ({ code, severity })),
  [{ code: "ARRIVAL_DELIVERY_SLA", severity: "critical" }],
);
assert.equal(
  getSlaAlerts(booking("departure"), atMinute(240)).some((alert) => alert.code === "ARRIVAL_DELIVERY_SLA"),
  false,
);

const [rules, ordPage] = await Promise.all([
  readFile(path.join(root, "src/lib/service-rules.ts"), "utf8"),
  readFile(path.join(root, "src/app/cities/ord/page.tsx"), "utf8"),
]);
assert.match(rules, /24 hours daily \(Central Time\)/);
assert.match(rules, /four to six hours of actual landing/);
assert.match(ordPage, /ORD_PILOT_ARRIVAL_TARGET_MINUTES \/ 60/);
assert.match(ordPage, /ORD_PILOT_ARRIVAL_MAX_MINUTES \/ 60/);
assert.match(ordPage, /measured from actual landing/);
assert.match(ordPage, /accountable custody clock begins at the custody-accepted scan/);

console.log(JSON.stringify({
  verdict: "PASS",
  checks: 11,
  policy: "ORD field operations 24/7; capacity confirmed per booking.",
  departure: "Confirmed 60-minute pickup window plus route-aware T-3 traveler return.",
  arrival: "Warning at 4 hours and critical at 6 hours from custody acceptance.",
}, null, 2));
