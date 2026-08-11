import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ARRIVAL_DELIVERY_SEQUENCE,
  CARRIER_AUTHORIZED_DEPARTURE_SEQUENCE,
  CUSTODY_CONTROL_CATEGORIES,
  IAC_REFERENCE_ANNEX,
  PASSENGER_PRESENT_DEPARTURE_SEQUENCE,
  TRAVELYT_CONCIERGE_CONTROLS,
  iacOperationalLaneEnabled,
} from "../src/lib/custody-controls.ts";
import { departureCustodySequence } from "../src/lib/handoff-policy.ts";

let passed = 0;
function test(name, check) {
  check();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("all nine requested control categories exist", () => {
  assert.deepEqual(CUSTODY_CONTROL_CATEGORIES, [
    "acceptance",
    "identity",
    "declarations",
    "seal_integrity",
    "custody_events",
    "transfers",
    "exceptions",
    "training",
    "record_retention",
  ]);
});

test("every category has at least one Travelyt control", () => {
  for (const category of CUSTODY_CONTROL_CATEGORIES) {
    assert.ok(
      TRAVELYT_CONCIERGE_CONTROLS.some((control) => control.category === category),
      `Missing ${category}`
    );
  }
});

test("control records are unique and operationally complete", () => {
  const ids = new Set();
  for (const control of TRAVELYT_CONCIERGE_CONTROLS) {
    assert.ok(!ids.has(control.id), `Duplicate ${control.id}`);
    ids.add(control.id);
    assert.ok(control.owner);
    assert.ok(control.trigger);
    assert.ok(control.requiredEvidence.length > 0);
    assert.ok(control.failClosedOutcome);
    assert.ok(control.retentionClass);
    assert.ok(control.implementationRefs.length > 0);
  }
});

test("passenger-present departure excludes carrier transfer", () => {
  assert.ok(PASSENGER_PRESENT_DEPARTURE_SEQUENCE.includes("traveler_terminal_return"));
  assert.ok(!PASSENGER_PRESENT_DEPARTURE_SEQUENCE.includes("carrier_transfer"));
});

test("carrier transfer requires an authorization checkpoint", () => {
  const authorization = CARRIER_AUTHORIZED_DEPARTURE_SEQUENCE.indexOf(
    "carrier_authorization_confirmed"
  );
  const transfer = CARRIER_AUTHORIZED_DEPARTURE_SEQUENCE.indexOf("carrier_transfer");
  assert.ok(authorization >= 0 && transfer > authorization);
});

test("runtime handoff policy selects the matching custody sequence", () => {
  assert.deepEqual(departureCustodySequence({}), PASSENGER_PRESENT_DEPARTURE_SEQUENCE);
  assert.deepEqual(
    departureCustodySequence({
      externalProvider: "Example Air",
      externalReference: "ORD-AUTH-123",
      externalStatus: "carrier_handoff_authorized",
    }),
    CARRIER_AUTHORIZED_DEPARTURE_SEQUENCE
  );
});

test("arrival stays a separate custody sequence", () => {
  assert.ok(ARRIVAL_DELIVERY_SEQUENCE.includes("airport_release"));
  assert.ok(ARRIVAL_DELIVERY_SEQUENCE.includes("recipient_confirmation"));
  assert.ok(!ARRIVAL_DELIVERY_SEQUENCE.includes("traveler_terminal_return"));
});

test("IAC annex is inactive and cannot be enabled by configuration", () => {
  assert.equal(IAC_REFERENCE_ANNEX.status, "inactive_reference_only");
  assert.equal(IAC_REFERENCE_ANNEX.runtimeEnabled, false);
  assert.equal(IAC_REFERENCE_ANNEX.canEnableWithEnvironmentVariable, false);
  assert.equal(iacOperationalLaneEnabled(), false);
});

test("training and retention stay visible as incomplete gates", () => {
  const training = TRAVELYT_CONCIERGE_CONTROLS.find(
    (control) => control.category === "training"
  );
  const retention = TRAVELYT_CONCIERGE_CONTROLS.find(
    (control) => control.category === "record_retention"
  );
  assert.equal(training?.state, "procedure_required");
  assert.equal(retention?.state, "procedure_required");
  assert.equal(retention?.retentionClass, "legal_schedule_pending");
});

const [bookingApi, handoffPolicy, custodyMigration, controlSpec, iacAnnex] =
  await Promise.all([
    readFile(new URL("../src/app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/handoff-policy.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../supabase/migrations/026_travelyt_custody_protocol.sql", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../docs/custody/travelyt-concierge-control-spec.md", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../docs/custody/iac-applicability-annex.md", import.meta.url),
      "utf8"
    ),
  ]);

test("existing booking flow enforces identity, declaration, and proof gates", () => {
  assert.match(bookingApi, /custodyIdentityReady/);
  assert.match(bookingApi, /restricted_items_attested_at/);
  assert.match(bookingApi, /hasRequiredProof/);
});

test("existing handoff policy fails closed without carrier authorization", () => {
  assert.match(handoffPolicy, /passenger_present/);
  assert.match(handoffPolicy, /carrier_handoff_authorized/);
});

test("custody vocabulary remains Travelyt-owned and screening-neutral", () => {
  assert.match(custodyMigration, /Travelyt Custody Protocol/);
  assert.match(
    custodyMigration,
    /Screening is\s+-- never recorded as a Travelyt checkpoint/
  );
  assert.doesNotMatch(custodyMigration, /cargo_accepted|known_shipper|iac_transfer/);
});

test("documents preserve the passenger-baggage and restricted-information boundaries", () => {
  assert.match(controlSpec, /traveler remains responsible/i);
  assert.match(controlSpec, /does not perform or claim screening/i);
  assert.match(iacAnnex, /INACTIVE — REFERENCE ONLY/);
  assert.match(iacAnnex, /does not reproduce, summarize, map, or operationalize restricted/i);
  assert.match(iacAnnex, /IAC status authorizes passenger checked-baggage acceptance/);
});

console.log(`\n${passed}/${passed} concierge-control checks passed.`);
