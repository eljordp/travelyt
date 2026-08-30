import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { departureHandoffMode } from "../src/lib/handoff-policy.ts";

const cases = [
  {
    name: "no carrier data defaults to passenger-present",
    booking: {},
    expected: "passenger_present",
  },
  {
    name: "provider name alone is not authorization",
    booking: { externalProvider: "Royal Jordanian" },
    expected: "passenger_present",
  },
  {
    name: "reference without an enabled state is not authorization",
    booking: {
      externalProvider: "Example Air",
      externalReference: "STATION-123",
      externalStatus: "requested",
    },
    expected: "passenger_present",
  },
  {
    name: "authorization state without provider and reference fails closed",
    booking: { externalStatus: "carrier_handoff_authorized" },
    expected: "passenger_present",
  },
  {
    name: "explicit carrier authorization enables carrier mode",
    booking: {
      externalProvider: "Example Air",
      externalReference: "ORD-AUTH-123",
      externalStatus: "carrier_handoff_authorized",
    },
    expected: "carrier_authorized",
  },
  {
    name: "handoff-ready state enables a configured integration",
    booking: {
      externalProvider: "Example Air",
      externalReference: "ORD-READY-456",
      externalStatus: "HANDOFF_READY",
    },
    expected: "carrier_authorized",
  },
];

let passed = 0;
for (const scenario of cases) {
  assert.equal(departureHandoffMode(scenario.booking), scenario.expected, scenario.name);
  passed += 1;
  console.log(`PASS ${scenario.name}`);
}

const [bookingApi, driverPage, quotePage, termsPage, custodySource, custodyMigration] = await Promise.all([
  readFile(new URL("../src/app/api/bookings/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/driver/job/[id]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/quote/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/terms/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/custody.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/026_travelyt_custody_protocol.sql", import.meta.url), "utf8"),
]);

const sourceChecks = [
  [bookingApi.includes('body.proof.kind === "airline_handoff" && !airlineAuthorized'), "API locks unauthorized airline proof"],
  [bookingApi.includes('hasRequiredProof(existing, "customer_handoff")'), "API requires passenger terminal proof"],
  [driverPage.includes("markPassengerTerminalHandoff"), "driver flow records passenger terminal handoff"],
  [driverPage.includes("IDENTITY_MATCHED_NO_DOCUMENT_NUMBER_STORED"), "driver flow avoids storing identity-document numbers"],
  [!quotePage.includes('value: "both"'), "public quote does not combine two custody legs"],
  [termsPage.includes("traveler remains responsible for airline check-in"), "terms preserve traveler check-in responsibility"],
  [termsPage.includes("explicitly authorized"), "terms gate passenger-absent carrier tender"],
  [custodySource.includes('traveler_return: "Returned to traveler"'), "custody ledger uses a traveler-return event"],
  [custodySource.includes('carrier_transfer: "Authorized carrier transfer"'), "carrier transfer is a separate event"],
  [bookingApi.includes('? "recipient_confirmed"') && bookingApi.includes('? "traveler" : "operations"'), "traveler confirmation closes the custody record without conflating an operations override"],
  [custodyMigration.includes("Travelyt Custody Protocol"), "database accepts the carrier-neutral event vocabulary"],
  [termsPage.includes("does not x-ray, clear, open a bag for screening"), "terms exclude Travelyt from screening"],
  [/logCustody\(\s*"carrier_transfer"/.test(driverPage), "driver records carrier transfer rather than screening"],
  [!/logCustody\(\s*"security_handoff"/.test(driverPage), "driver cannot create legacy security-handoff events"],
  [quotePage.includes("Screening is never a Travelyt checkpoint"), "customer review states the screening boundary"],
  [custodyMigration.includes("legacy security_handoff value") && custodyMigration.includes("cannot be rewritten"), "migration preserves immutable legacy rows without reusing the screening label"],
];

for (const [condition, name] of sourceChecks) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${name}`);
}

console.log(`\n${passed}/${cases.length + sourceChecks.length} carrier-neutral checks passed.`);
