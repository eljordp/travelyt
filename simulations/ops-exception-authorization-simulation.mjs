#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  OPS_EXCEPTION_MAX_METADATA_BYTES,
  driverExceptionPolicy,
  exceptionMetadata,
} from "../src/lib/ops-exception-policy.ts";

const route = await readFile(
  new URL("../src/app/api/ops-exceptions/route.ts", import.meta.url),
  "utf8",
);

const checks = [];
function check(name, run) {
  try {
    run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

check("driver exception codes are allowlisted", () => {
  assert.equal(driverExceptionPolicy("GPS_DENIED").ok, true);
  assert.equal(driverExceptionPolicy("CUSTODY_LEDGER_WRITE_FAILED").ok, true);
  assert.equal(driverExceptionPolicy("SEAL_STATUS_STOP").ok, true);
  assert.deepEqual(driverExceptionPolicy("FAKE_CRITICAL_OVERRIDE"), {
    ok: false,
    error: "This exception code must be recorded by Travelyt operations.",
  });
});

check("driver severity is server-owned", () => {
  assert.deepEqual(driverExceptionPolicy("GPS_DENIED"), {
    ok: true,
    value: { code: "GPS_DENIED", severity: "warning" },
  });
  assert.deepEqual(driverExceptionPolicy("SEAL_STATUS_STOP"), {
    ok: true,
    value: { code: "SEAL_STATUS_STOP", severity: "critical" },
  });
});

check("metadata must be a bounded object", () => {
  const actor = {
    role: "driver",
    driverAccessId: "a0c90367-80aa-4f70-97bd-e5226e5b9868",
    name: "Test Driver",
  };
  assert.equal(exceptionMetadata([], actor).ok, false);
  assert.equal(
    exceptionMetadata({ payload: "x".repeat(OPS_EXCEPTION_MAX_METADATA_BYTES) }, actor).ok,
    false,
  );
  assert.equal(
    exceptionMetadata(
      Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`key${index}`, index])),
      actor,
    ).ok,
    false,
  );
});

check("client cannot spoof the recorded actor", () => {
  const result = exceptionMetadata(
    { actor: { role: "admin", email: "spoof@example.com" }, workflow: "delivery" },
    {
      role: "driver",
      driverAccessId: "a0c90367-80aa-4f70-97bd-e5226e5b9868",
      name: "Assigned Driver",
      email: "driver@example.com",
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.actor, {
    role: "driver",
    driverAccessId: "a0c90367-80aa-4f70-97bd-e5226e5b9868",
    name: "Assigned Driver",
    email: "driver@example.com",
  });
});

check("driver route rejects legacy or unbound sessions", () => {
  assert.match(route, /!driverAuth\?\.ok \|\| !driverAuth\.driverAccessId \|\| driverAuth\.source === "env"/);
});

check("driver route requires the accepted primary assignment", () => {
  assert.match(route, /\.eq\("status", "accepted"\)/);
  assert.match(route, /\.eq\("primary_driver_access_id", driverAccessId\)/);
  assert.match(route, /\.eq\("accepted_by_driver_access_id", driverAccessId\)/);
});

check("operations and drivers get server-derived actor evidence", () => {
  assert.match(route, /exceptionMetadata\(body\.metadata, actor\)/);
  assert.match(route, /role: operationsSession\.role/);
  assert.match(route, /role: "driver"/);
});

const failed = checks.filter((item) => !item.pass);
console.log(`Ops exception authorization: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
if (failed.length) process.exitCode = 1;
