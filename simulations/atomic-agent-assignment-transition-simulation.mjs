#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, opsRoute, driverRoute, driverPage] = await Promise.all([
  readFile(new URL("../supabase/migrations/045_atomic_agent_assignment_transitions.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/ops/agent-assignments/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/drivers/assignments/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/driver/job/[id]/page.tsx", import.meta.url), "utf8"),
]);

const checks = [];
function check(name, run) {
  try {
    run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

check("one private service-role RPC owns all transitions", () => {
  assert.match(migration, /create or replace function public\.transition_agent_assignment/);
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.transition_agent_assignment[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.transition_agent_assignment[\s\S]*to service_role/);
});

check("lock order is booking then assignment then ordered drivers and readiness", () => {
  const bookingLock = migration.indexOf("where id = p_booking_id\n  for update");
  const assignmentLock = migration.indexOf("where id = p_expected_assignment_id and booking_id = p_booking_id\n    for update");
  const driverLock = migration.indexOf("order by access.id");
  const readinessLock = migration.indexOf("order by readiness.driver_access_id");
  assert.ok(bookingLock >= 0 && assignmentLock > bookingLock);
  assert.ok(driverLock > assignmentLock && readinessLock > driverLock);
});

check("same-driver same-date check runs after driver locks", () => {
  assert.match(migration, /for v_lock_id in[\s\S]*order by access\.id[\s\S]*for update/);
  assert.match(migration, /conflict_booking\.travel_date = v_booking\.travel_date/);
  assert.match(migration, /assignment\.primary_driver_access_id in \(v_primary_id, v_backup_id\)/);
  assert.match(migration, /assignment\.backup_driver_access_id in \(v_primary_id, v_backup_id\)/);
});

check("stale response requires exact assignment generation", () => {
  assert.match(migration, /p_expected_assignment_id is null[\s\S]*exact assignment ID is required/i);
  assert.match(migration, /where id = p_expected_assignment_id and booking_id = p_booking_id/);
  assert.match(migration, /This assignment is stale or belongs to another booking/);
  assert.match(driverRoute, /p_expected_assignment_id: assignmentId/);
  assert.match(driverPage, /assignmentId: assignment\.id/);
});

check("expired acceptance closes assignment and booking together", () => {
  assert.match(migration, /v_action = 'accept' and v_assignment\.acceptance_due_at <= v_now/);
  assert.match(migration, /set status = 'expired'[\s\S]*update public\.bookings[\s\S]*set status = 'paid'/);
  assert.match(driverRoute, /transition\.outcome === "expired"/);
});

check("routes do not perform split assignment or booking writes", () => {
  const opsPost = opsRoute.slice(opsRoute.indexOf("export async function POST"));
  const driverPost = driverRoute.slice(driverRoute.indexOf("export async function POST"));
  for (const source of [opsPost, driverPost]) {
    assert.doesNotMatch(source, /\.from\("booking_agent_assignments"\)/);
    assert.doesNotMatch(source, /\.from\("bookings"\)/);
    assert.match(source, /rpc\("transition_agent_assignment"/);
  }
});

class AssignmentModel {
  constructor() {
    this.activeByBooking = new Map();
    this.reservedByDriverDate = new Map();
    this.generation = 0;
  }

  assign(bookingId, date, primary, backup, reason) {
    const current = this.activeByBooking.get(bookingId);
    if (current && !reason) throw new Error("reassignment reason required");
    for (const driver of [primary, backup].sort()) {
      const key = `${driver}:${date}`;
      const owner = this.reservedByDriverDate.get(key);
      if (owner && owner !== bookingId) throw new Error("same-driver/date conflict");
    }
    if (current) {
      current.status = "superseded";
      for (const driver of [current.primary, current.backup]) {
        this.reservedByDriverDate.delete(`${driver}:${current.date}`);
      }
    }
    const assignment = {
      id: `generation-${++this.generation}`,
      bookingId,
      date,
      primary,
      backup,
      status: "assigned",
    };
    this.activeByBooking.set(bookingId, assignment);
    for (const driver of [primary, backup]) {
      this.reservedByDriverDate.set(`${driver}:${date}`, bookingId);
    }
    return assignment;
  }

  accept(bookingId, expectedAssignmentId, driverId) {
    const current = this.activeByBooking.get(bookingId);
    if (!current || current.id !== expectedAssignmentId) throw new Error("stale assignment");
    if (current.primary !== driverId) throw new Error("not primary");
    current.status = "accepted";
  }
}

check("negative control: concurrent same-driver/date reservation loses", () => {
  const model = new AssignmentModel();
  model.assign("booking-a", "2026-09-02", "driver-a", "driver-b");
  assert.throws(
    () => model.assign("booking-b", "2026-09-02", "driver-a", "driver-c"),
    /same-driver\/date conflict/,
  );
  assert.equal(model.activeByBooking.has("booking-b"), false);
});

check("negative control: stale acceptance after reassignment loses", () => {
  const model = new AssignmentModel();
  const stale = model.assign("booking-a", "2026-09-02", "driver-a", "driver-b");
  const current = model.assign("booking-a", "2026-09-02", "driver-c", "driver-d", "dispatch changed driver");
  assert.throws(() => model.accept("booking-a", stale.id, "driver-a"), /stale assignment/);
  assert.equal(current.status, "assigned");
  assert.equal(stale.status, "superseded");
});

const failed = checks.filter((item) => !item.pass);
console.log(`Atomic agent assignment transitions: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}${item.error ? ` — ${item.error.message}` : ""}`);
}
if (failed.length) process.exitCode = 1;
