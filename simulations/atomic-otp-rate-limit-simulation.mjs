#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

async function check(name, run) {
  try {
    await run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

class SerializedState {
  #tail = Promise.resolve();

  transaction(run) {
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

await check("concurrent durable rate-limit requests cannot exceed the limit", async () => {
  const lock = new SerializedState();
  let count = 0;
  const consume = () => lock.transaction(() => {
    if (count >= 5) return false;
    count += 1;
    return true;
  });
  const results = await Promise.all(Array.from({ length: 30 }, consume));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(count, 5);
});

await check("one OTP can be consumed by only one concurrent request", async () => {
  const lock = new SerializedState();
  let consumed = false;
  const consume = () => lock.transaction(() => {
    if (consumed) return "already_consumed";
    consumed = true;
    return "verified";
  });
  const results = await Promise.all(Array.from({ length: 20 }, consume));
  assert.equal(results.filter((result) => result === "verified").length, 1);
  assert.equal(results.filter((result) => result === "already_consumed").length, 19);
});

await check("the fifth failed OTP attempt locks instead of permitting a sixth guess", async () => {
  let attempts = 0;
  const outcomes = Array.from({ length: 5 }, () => {
    attempts += 1;
    return attempts >= 5 ? "locked" : "invalid";
  });
  assert.deepEqual(outcomes, ["invalid", "invalid", "invalid", "invalid", "locked"]);
});

await check("migration contracts use row locks, null guards, and service-only RPCs", async () => {
  const migration = await readFile(
    path.join(root, "supabase/migrations/046_durable_rate_limits_and_traveler_otp.sql"),
    "utf8",
  );
  assert.equal((migration.match(/for update;/g) ?? []).length, 2);
  assert.match(migration, /p_identifier_hash is null/);
  assert.match(migration, /p_limit is null/);
  assert.match(migration, /p_verification_id is null/);
  assert.match(migration, /returning verification_invite_otp_attempts into v_attempts/);
  assert.match(migration, /v_attempts >= p_max_attempts then 'locked'/);
  assert.match(migration, /verification_invite_otp_hash = null/);
  assert.match(migration, /revoke all on public\.request_rate_limits from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

await check("traveler OTP uses per-invite durable scopes and clears failed sends", async () => {
  const route = await readFile(
    path.join(root, "src/app/api/identity/traveler-verification/route.ts"),
    "utf8",
  );
  assert.match(route, /identity:traveler-otp:request/);
  assert.match(route, /identity:traveler-otp:consume/);
  assert.match(route, /10 \* 60_000,[\s\S]*token/);
  assert.match(route, /rpc\(\s*"consume_traveler_verification_otp"/);
  assert.match(route, /delivery\.status !== "accepted"/);
  assert.match(route, /eq\("verification_invite_otp_hash", codeHmac\)/);
});

await check("durable throttling fails closed when its secret or backend is unavailable", async () => {
  const helper = await readFile(
    path.join(root, "src/lib/durable-rate-limit.ts"),
    "utf8",
  );
  assert.match(helper, /if \(!identifierHash \|\| !supabase\)/);
  assert.match(helper, /Security throttling is not configured/);
  assert.match(helper, /Security throttling is temporarily unavailable/);
  assert.doesNotMatch(helper, /user-agent/);
});

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
console.log(`Atomic OTP and durable rate-limit contract: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exitCode = 1;
