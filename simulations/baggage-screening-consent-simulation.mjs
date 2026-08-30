#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(
  await Promise.all(
    Object.entries({
      quote: new URL("../src/app/quote/page.tsx", import.meta.url),
      api: new URL("../src/app/api/bookings/route.ts", import.meta.url),
      mapper: new URL("../src/lib/booking-mappers.ts", import.meta.url),
      custody: new URL("../src/lib/custody.ts", import.meta.url),
      assignment: new URL("../src/lib/agent-assignment.ts", import.meta.url),
      migration: new URL("../supabase/migrations/048_current_identity_evidence_gate.sql", import.meta.url),
      terms: new URL("../src/app/terms/page.tsx", import.meta.url),
    }).map(async ([key, url]) => [key, await readFile(url, "utf8")]),
  ),
);

const checks = [
  [
    files.quote.includes("BAGGAGE_SCREENING_CONSENT_COPY") &&
      files.quote.includes("!form.consentToSearchAccepted"),
    "booking UI presents and requires the separate inspection/search consent",
  ],
  [
    files.api.includes("body.consentToSearchAccepted !== true"),
    "server rejects a missing or forged checkbox value",
  ],
  [
    files.api.includes("validated.consentToSearchAt = new Date().toISOString()") &&
      files.api.includes("BAGGAGE_SCREENING_CONSENT_VERSION"),
    "server—not the browser—records the time and consent version",
  ],
  [
    files.mapper.includes('"consent_to_search_at"') &&
      files.mapper.includes('"consent_to_search_version"'),
    "consent evidence round-trips through booking reads and writes",
  ],
  [
    files.migration.includes("bookings_consent_to_search_shape_check") &&
      files.migration.includes("enforce_booking_search_consent_insert") &&
      files.migration.includes("enforce_booking_search_consent_immutability"),
    "database requires every new booking and preserves paired, versioned, immutable consent evidence",
  ],
  [
    files.migration.includes("booking_has_current_search_consent") &&
      files.migration.includes("required before pilot approval") &&
      files.migration.includes("required before payment activation") &&
      files.migration.includes("required before assignment") &&
      files.migration.includes("required before custody"),
    "database approval, payment, assignment, and custody transitions all require consent",
  ],
  [
    files.assignment.includes("consent_to_search_version !== \"2026-08-30\"") &&
      files.custody.includes("consent_to_search_version !== \"2026-08-30\""),
    "assignment and custody fail closed when consent is absent or stale",
  ],
  [
    files.terms.includes("does not authorize Travelyt to open or screen a bag"),
    "terms preserve the airline/TSA-versus-Travelyt boundary",
  ],
];

for (const [condition, label] of checks) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

console.log(`\nBaggage-screening consent simulation: ${checks.length}/${checks.length} controls passed.`);
