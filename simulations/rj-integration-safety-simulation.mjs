#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeRjGatewayCheckIn,
  getRjIntegrationReadiness,
  getRjModeConfiguration,
  RjIntegrationError,
} from "../src/lib/rj-check-in.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [checkInRoute, webhookRoute] = await Promise.all([
  readFile(path.join(root, "src/app/api/partner-integrations/royal-jordanian/check-in/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/partner-integrations/royal-jordanian/webhook/route.ts"), "utf8"),
]);

const sandboxEnv = {
  NODE_ENV: "test",
  RJ_INTEGRATION_ENABLED: "true",
  RJ_INTEGRATION_MODE: "sandbox",
  RJ_SANDBOX_INTEGRATION_AUTHORIZED: "true",
  RJ_SANDBOX_IDEMPOTENCY_RECONCILIATION_APPROVED: "true",
  RJ_SANDBOX_API_PROFILE: "rj-sandbox-v1",
  RJ_SANDBOX_API_GATEWAY_URL: "https://sandbox.rj.example/check-in",
  RJ_SANDBOX_API_ALLOWED_HOSTS: "sandbox.rj.example",
  RJ_SANDBOX_API_TOKEN: "sandbox-only-token",
  RJ_SANDBOX_WEBHOOK_SECRET: "sandbox-only-webhook-secret",
};

const input = {
  bookingId: "TVT-RJ-SAFETY",
  pnr: "ABC123",
  flightNumber: "RJ264",
  travelDate: "2026-09-01",
  departureAirport: "ORD",
  bagCount: 1,
  idempotencyKey: "rj-safety:TVT-RJ-SAFETY",
  passengers: [{
    passengerId: "00000000-0000-4000-8000-000000000001",
    firstName: "Test",
    lastName: "Traveler",
    bags: 1,
    identityReference: "identity-test-reference",
    identityVerifiedAt: "2026-08-30T00:00:00.000Z",
  }],
};

assert.equal(
  getRjIntegrationReadiness({
    ...sandboxEnv,
    RJ_INTEGRATION_ENABLED: "false",
  }).mode,
  "disabled",
  "The provider-specific kill switch must override every other RJ setting.",
);

assert.equal(
  getRjIntegrationReadiness({
    NODE_ENV: "test",
    RJ_INTEGRATION_ENABLED: "true",
    RJ_INTEGRATION_MODE: "sandbox",
    RJ_INTEGRATION_AUTHORIZED: "true",
    RJ_API_PROFILE: "legacy-profile",
    RJ_API_GATEWAY_URL: "https://sandbox.rj.example/check-in",
    RJ_API_ALLOWED_HOSTS: "sandbox.rj.example",
    RJ_API_TOKEN: "legacy-token",
    RJ_WEBHOOK_SECRET: "legacy-secret",
  }).readyForConfiguredMode,
  false,
  "Legacy shared credentials must not activate the mode-separated adapter.",
);

const readiness = getRjIntegrationReadiness(sandboxEnv);
assert.equal(readiness.readyForSandbox, true);
assert.equal(readiness.readyForConfiguredMode, true);
assert.equal(getRjModeConfiguration(sandboxEnv).token, "sandbox-only-token");

const originalFetch = globalThis.fetch;
let observedRequest;
globalThis.fetch = async (url, init) => {
  observedRequest = { url, init };
  return new Response(JSON.stringify({
    schemaVersion: "travelyt.rj-check-in.v2",
    integrationMode: "sandbox",
    bookingId: input.bookingId,
    idempotencyKey: input.idempotencyKey,
    checkInReference: "rj-check-in-reference",
    state: "tags_issued_inactive",
    bagTags: [{
      tagReference: "tag-1",
      passengerId: input.passengers[0].passengerId,
      bagIndex: 1,
      bagReference: `${input.bookingId}:${input.passengers[0].passengerId}:1`,
    }],
    tagActivationState: "inactive_until_airline_acceptance",
  }), { status: 200, headers: { "content-type": "application/json" } });
};

try {
  const result = await executeRjGatewayCheckIn(input, sandboxEnv);
  assert.equal(result.checkInReference, "rj-check-in-reference");
  assert.equal(observedRequest.url, sandboxEnv.RJ_SANDBOX_API_GATEWAY_URL);
  assert.equal(observedRequest.init.headers.Authorization, "Bearer sandbox-only-token");
  assert.equal(observedRequest.init.headers["Idempotency-Key"], input.idempotencyKey);
  assert.equal(observedRequest.init.headers["X-Travelyt-Integration-Mode"], "sandbox");

  globalThis.fetch = async () => new Response(JSON.stringify({
    schemaVersion: "travelyt.rj-check-in.v2",
    integrationMode: "sandbox",
    bookingId: "TVT-DIFFERENT",
    idempotencyKey: input.idempotencyKey,
    checkInReference: "rj-check-in-reference",
    state: "tags_issued_inactive",
    bagTags: [{
      tagReference: "tag-1",
      passengerId: input.passengers[0].passengerId,
      bagIndex: 1,
      bagReference: `${input.bookingId}:${input.passengers[0].passengerId}:1`,
    }],
    tagActivationState: "inactive_until_airline_acceptance",
  }), { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(
    () => executeRjGatewayCheckIn(input, sandboxEnv),
    (error) => error instanceof RjIntegrationError && error.code === "unsafe_gateway_response",
  );
} finally {
  globalThis.fetch = originalFetch;
}

assert.match(checkInRoute, /request_fingerprint === requestFingerprint/);
assert.match(checkInRoute, /candidate\.mode === readiness\.mode/);
assert.doesNotMatch(checkInRoute, /partner_check_in_jobs"\)\.upsert/);
assert.match(checkInRoute, /dispatch_reconciliation_required/);
assert.match(checkInRoute, /tags_issued_inactive/);
assert.match(webhookRoute, /job\.booking_id !== body\.bookingId/);
assert.match(webhookRoute, /job\.mode !== body\.integrationMode/);
assert.match(webhookRoute, /job\.request_fingerprint !== body\.requestFingerprint/);

console.log(JSON.stringify({
  verdict: "PASS",
  checks: 14,
  rule: "RJ is off by default and every request/response is bound to one environment, booking, and idempotency key.",
}, null, 2));
