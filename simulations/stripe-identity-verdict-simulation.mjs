#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  expectedDobMatch,
  providerIdentityVerdict,
  requireVerifiedIdentityGate,
  verifiedIdentityProfileComplete,
} from "../src/lib/identity-verdict.ts";

const checks = [];

function check(name, run) {
  try {
    run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

check("provider verified event passes identity and liveness", () => {
  assert.deepEqual(
    providerIdentityVerdict("identity.verification_session.verified"),
    { status: "verified", livenessStatus: "passed" },
  );
});

check("provider requires-input event fails liveness and blocks approval", () => {
  assert.deepEqual(
    providerIdentityVerdict("identity.verification_session.requires_input"),
    { status: "manual_review", livenessStatus: "failed" },
  );
});

check("provider cancellation expires the attempt", () => {
  assert.deepEqual(
    providerIdentityVerdict("identity.verification_session.canceled"),
    { status: "expired", livenessStatus: "manual_review" },
  );
});

check("matching provider DOB passes", () => {
  assert.equal(expectedDobMatch("2001-04-09", "2001-04-09"), true);
});

check("mismatched provider DOB fails", () => {
  assert.equal(expectedDobMatch("2001-04-09", "2001-04-10"), false);
});

check("missing provider DOB fails when a DOB is expected", () => {
  assert.equal(expectedDobMatch("2001-04-09", undefined), false);
});

check("DOB gate is not invented when no expected DOB exists", () => {
  assert.equal(expectedDobMatch(undefined, "2001-04-09"), null);
});

check("DOB mismatch downgrades a provider verification", () => {
  const provider = providerIdentityVerdict("identity.verification_session.verified");
  assert.deepEqual(requireVerifiedIdentityGate(provider, false), {
    status: "manual_review",
    livenessStatus: "manual_review",
  });
});

check("missing original archive downgrades a provider verification", () => {
  const provider = providerIdentityVerdict("identity.verification_session.verified");
  assert.deepEqual(requireVerifiedIdentityGate(provider, false), {
    status: "manual_review",
    livenessStatus: "manual_review",
  });
});

check("a passing gate preserves provider verification", () => {
  const provider = providerIdentityVerdict("identity.verification_session.verified");
  assert.deepEqual(requireVerifiedIdentityGate(provider, true), provider);
});

check("a complete provider identity profile passes", () => {
  assert.equal(verifiedIdentityProfileComplete({
    firstName: "Jordan",
    lastName: "Williams",
    dateOfBirth: "2001-04-09",
  }), true);
});

check("missing provider name or DOB cannot become verified", () => {
  assert.equal(verifiedIdentityProfileComplete({
    firstName: "Jordan",
    lastName: "Williams",
  }), false);
  assert.equal(verifiedIdentityProfileComplete({
    dateOfBirth: "2001-04-09",
  }), false);
});

check("invalid or future provider DOB cannot become verified", () => {
  assert.equal(verifiedIdentityProfileComplete({
    firstName: "Jordan",
    lastName: "Williams",
    dateOfBirth: "2001-02-29",
  }), false);
  assert.equal(verifiedIdentityProfileComplete({
    firstName: "Jordan",
    lastName: "Williams",
    dateOfBirth: "2999-01-01",
  }), false);
});

const failed = checks.filter((item) => !item.pass);
console.log(`Stripe identity verdicts: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
if (failed.length) process.exitCode = 1;
