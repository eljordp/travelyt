#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  toPublicBagCustodySummary,
  toPublicCustodyChain,
} from "../src/lib/public-custody.ts";

const checks = [];

async function check(name, run) {
  try {
    await run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

const privateBag = {
  id: "internal-bag-uuid",
  booking_id: "internal-booking-uuid",
  badge_code: "TVT-B-QA2026",
  label: "Bag 1 of 2",
  description: "Private contents description",
  weight_grams: 22700,
  declared_value_cents: 75000,
  status: "in_custody",
  created_at: "2026-08-29T18:00:00.000Z",
  updated_at: "2026-08-29T18:05:00.000Z",
};

const privateEvent = {
  id: "internal-event-uuid",
  bag_id: "internal-bag-uuid",
  booking_id: "internal-booking-uuid",
  badge_code: "TVT-B-QA2026",
  seq: 2,
  event_type: "route_checkpoint",
  actor_role: "agent",
  actor_name: "Private Agent Name",
  identity_verification_id: "internal-identity-uuid",
  verified_method: "account_session",
  photo_path: "private/bag-proof.jpg",
  location_lat: 41.974162,
  location_lng: -87.907321,
  note: "Private exception and customer note",
  prev_hash: "private-previous-hash",
  event_hash: "private-current-hash",
  created_at: "2026-08-29T18:05:00.000Z",
};

await check("public bag summary exposes only the scan-safe fields", () => {
  const result = toPublicBagCustodySummary(privateBag);
  assert.deepEqual(Object.keys(result).sort(), ["badge_code", "label", "status"]);
  assert.deepEqual(result, {
    badge_code: "TVT-B-QA2026",
    label: "Bag 1 of 2",
    status: "in_custody",
  });
});

await check("public chain exposes only role, method, event, sequence, and time", () => {
  const [result] = toPublicCustodyChain([privateEvent]);
  assert.deepEqual(Object.keys(result).sort(), [
    "actor_role",
    "created_at",
    "event_type",
    "seq",
    "verified_method",
  ]);
});

await check("public JSON cannot leak names, GPS, notes, media, hashes, or IDs", () => {
  const publicJson = JSON.stringify({
    bag: toPublicBagCustodySummary(privateBag),
    chain: toPublicCustodyChain([privateEvent]),
  });
  for (const privateValue of [
    "internal-bag-uuid",
    "internal-booking-uuid",
    "internal-event-uuid",
    "internal-identity-uuid",
    "Private Agent Name",
    "Private exception and customer note",
    "private/bag-proof.jpg",
    "private-previous-hash",
    "private-current-hash",
    "41.974162",
    "-87.907321",
  ]) {
    assert.ok(!publicJson.includes(privateValue), `Leaked ${privateValue}`);
  }
});

const [apiSource, bookingSource, badgeSource, trackSource, ordSource, jfkSource, laxSource, privacySource, termsSource, embassySource] =
  await Promise.all([
    readFile(new URL("../src/app/api/custody/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/badge/[code]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/track/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/cities/ord/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/cities/jfk/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/cities/lax/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/for/embassies/page.tsx", import.meta.url), "utf8"),
  ]);

await check("custody API separates public and authorized evidence views", () => {
  assert.match(apiSource, /visibility:\s*"public"/);
  assert.match(apiSource, /toPublicBagCustodySummary\(bag\)/);
  assert.match(apiSource, /toPublicCustodyChain\(chain\)/);
  assert.match(apiSource, /adminSession\s*\|\|\s*hasCustomerAccess/);
  assert.match(apiSource, /visibility:\s*"full"[\s\S]*bag, chain, verification/);
  assert.match(apiSource, /Cache-Control["']:\s*["']private, no-store/);
});

await check("proof storage never falls back to retaining a raw image data URL", () => {
  assert.match(bookingSource, /createSignedUrl\(storagePath/);
  assert.match(bookingSource, /signedUrlError\s*\|\|\s*!signed\?\.signedUrl/);
  assert.doesNotMatch(bookingSource, /signed\?\.signedUrl\s*\?\?\s*proof\.dataUrl/);
});

await check("badge page labels and gates the sensitive evidence view", () => {
  assert.match(badgeSource, /Privacy-safe public view/);
  assert.match(badgeSource, /Authorized evidence view/);
  assert.match(badgeSource, /const fullAccess = Boolean\(adminSession \|\| customerHasAccess\)/);
  assert.match(badgeSource, /fullAccess \? \(/);
  assert.match(badgeSource, /toPublicCustodyChain\(chain\)/);
});

await check("customer tracking never puts the long-lived booking token in badge URLs", () => {
  assert.match(trackSource, /\/badge\/\$\{bag\.badge_code\}/);
  assert.doesNotMatch(trackSource, /\?token=/);
  assert.match(trackSource, /privacy-safe custody history/);
});

await check("ORD, JFK, and LAX show authorization gates without implied carrier partnerships", () => {
  for (const [airport, source] of [
    ["ORD", ordSource],
    ["JFK", jfkSource],
    ["LAX", laxSource],
  ]) {
    assert.doesNotMatch(source, /All major carriers/i, `${airport} all-carrier claim remains`);
    assert.doesNotMatch(source, /handle(?:s|d)? (?:bags|baggage) for (?:flights on )?all/i);
    assert.match(source, /Availability is approval-dependent/);
    assert.match(source, /No carrier relationship is implied/);
    assert.match(source, /must clear these requirements before service can be confirmed/);
    assert.match(source, /Written carrier and station authorization/);
    assert.match(source, /Named receiving party and location/);
    assert.match(source, /Confirmed cutoffs and exception procedure/);
    assert.match(source, /Cleared agent, vehicle, and coverage/);
    assert.match(source, /ROUTE_GATES\.map/);
    assert.doesNotMatch(source, /const AIRLINES\s*=/, `${airport} carrier-name list remains`);
  }
});

await check("public privacy copy does not claim unproved screening or AI controls", () => {
  for (const source of [privacySource, termsSource]) {
    assert.doesNotMatch(source, /vetted handlers with background checks/i);
    assert.doesNotMatch(source, /in-house AI to process booking and operational data/i);
    assert.doesNotMatch(source, /anomaly detection on bag photos/i);
    assert.match(source, /does not currently use AI to approve identity/i);
  }
  assert.match(privacySource, /separate activation gate/i);
});

await check("embassy page uses activation-gated agent language", () => {
  assert.doesNotMatch(embassySource, /A vetted courier seals/i);
  assert.match(embassySource, /An activation-gated Travelyt agent seals/i);
});

const failed = checks.filter((item) => !item.pass);
console.log(`Public custody/privacy controls: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
if (failed.length) process.exitCode = 1;
