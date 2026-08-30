#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [route, bookingRoute, mapper, bookingTypes, adminPage, migration] = await Promise.all([
  readFile(path.join(root, "src/app/api/admin/arrival-release/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/bookings/route.ts"), "utf8"),
  readFile(path.join(root, "src/lib/booking-mappers.ts"), "utf8"),
  readFile(path.join(root, "src/lib/bookings.ts"), "utf8"),
  readFile(path.join(root, "src/app/admin/page.tsx"), "utf8"),
  readFile(path.join(root, "supabase/migrations/041_atomic_custody_checkpoints.sql"), "utf8"),
]);

const tests = [];
const test = (name, run) => tests.push({ name, run });

test("only a full admin can mutate release authority", () => {
  assert.match(route, /await getVerifiedAdminSession\(request\)/);
  assert.match(route, /Full admin access is required/);
});

test("generic booking patch cannot forge release authority", () => {
  assert.match(bookingRoute, /Airport-release authority requires the dedicated full-admin evidence action/);
  assert.doesNotMatch(mapper, /row\.arrival_release_status = patch\.arrivalReleaseStatus/);
});

test("the authority action is limited to arrival bookings", () => {
  assert.match(route, /existing\.service !== "arrival"/);
});

test("status defaults and values fail closed", () => {
  assert.match(bookingTypes, /"pending" \| "authorized" \| "revoked"/);
  assert.match(mapper, /arrivalReleaseStatus: row\.arrival_release_status \?\? "pending"/);
  assert.match(migration, /arrival_release_status text not null default 'pending'/);
});

test("only explicit state transitions are accepted", () => {
  assert.match(route, /current === "pending"[\s\S]*next === "authorized"/);
  assert.match(route, /current === "authorized"[\s\S]*next === "revoked"/);
});

test("authorization requires the complete authority evidence tuple", () => {
  for (const field of ["reference", "location", "authorizedAt", "authorizedBy"]) {
    assert.match(route, new RegExp(field));
  }
  assert.match(route, /Authorization time cannot be in the future/);
});

test("every authority state change requires an audit reason", () => {
  assert.match(route, /reason\.length < 12/);
  assert.match(route, /action: "arrival_release_authority"/);
  assert.match(route, /actorName: session\.email/);
});

test("authority data and audit history are saved in one row update", () => {
  assert.match(route, /arrival_release_status: status/);
  assert.match(route, /status_history: statusHistory/);
});

test("a concurrent booking change fails instead of overwriting audit history", () => {
  assert.match(route, /\.eq\("updated_at", existing\.updated_at\)/);
  assert.match(route, /Booking changed while authority was being recorded/);
});

test("all authority fields are selected and mapped to the Booking model", () => {
  for (const column of [
    "arrival_release_status",
    "arrival_release_reference",
    "arrival_release_location",
    "arrival_release_authorized_at",
    "arrival_release_authorized_by",
  ]) {
    assert.match(mapper, new RegExp(`"${column}"`));
  }
});

test("admin UI labels pending and revoked states as custody-blocking", () => {
  assert.match(adminPage, /Pending · custody blocked/);
  assert.match(adminPage, /Revoked · custody blocked/);
});

test("admin UI does not claim the entry creates airline approval", () => {
  assert.match(adminPage, /does not[\s\S]*create airline, airport, or security approval/);
});

test("dispatcher UI is read-only for release authority", () => {
  assert.match(adminPage, /canManageArrivalRelease=\{adminRole === "admin"\}/);
  assert.match(adminPage, /Full admin access is required to change/);
});

test("custody RPC requires an authorized complete arrival release", () => {
  assert.match(migration, /v_booking\.arrival_release_status = 'authorized'/);
  for (const column of [
    "arrival_release_reference",
    "arrival_release_location",
    "arrival_release_authorized_at",
    "arrival_release_authorized_by",
  ]) {
    assert.match(migration, new RegExp(`v_booking\\.${column}`));
  }
});

const passed = [];
for (const { name, run } of tests) {
  try {
    await run();
    passed.push(name);
  } catch (error) {
    console.error(JSON.stringify({ verdict: "FAIL", passed: passed.length, failed: name }, null, 2));
    throw error;
  }
}

console.log(JSON.stringify({
  verdict: "PASS",
  checks: passed.length,
  authorityRule: "Only a full admin can record complete, per-booking arrival-release authority evidence.",
  custodyRule: "Pending, revoked, incomplete, concurrent, non-arrival, and non-admin paths fail closed.",
}, null, 2));
