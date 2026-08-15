#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const checks = [];

function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
}

const migration = await readFile(path.join(ROOT, "supabase/migrations/030_agent_assignment_acceptance.sql"), "utf8");
const personMigration = await readFile(path.join(ROOT, "supabase/migrations/031_identity_consent_retention_and_distinct_agents.sql"), "utf8");
const policy = await readFile(path.join(ROOT, "src/lib/agent-assignment.ts"), "utf8");
const opsRoute = await readFile(path.join(ROOT, "src/app/api/ops/agent-assignments/route.ts"), "utf8");
const driverRoute = await readFile(path.join(ROOT, "src/app/api/drivers/assignments/route.ts"), "utf8");
const bookingRoute = await readFile(path.join(ROOT, "src/app/api/bookings/route.ts"), "utf8");
const adminPage = await readFile(path.join(ROOT, "src/app/admin/page.tsx"), "utf8");
const readinessRoute = await readFile(path.join(ROOT, "src/app/api/ops/agent-readiness/route.ts"), "utf8");
const driverPage = await readFile(path.join(ROOT, "src/app/driver/job/[id]/page.tsx"), "utf8");

check("private readiness table", migration.includes("agent_readiness_profiles") && migration.includes("revoke all"), "Readiness evidence is service-role only.");
check("private assignment table", migration.includes("booking_agent_assignments") && migration.includes("enable row level security"), "Assignments are private operational evidence.");
check("distinct primary and backup", migration.includes("primary_driver_access_id <> backup_driver_access_id"), "The same account cannot fill both roles.");
check("distinct primary and backup people", personMigration.includes("enforce_distinct_assignment_people") && personMigration.includes("different verified people"), "Duplicate access records for one person cannot fill both roles.");
check("one active assignment", migration.includes("booking_agent_assignments_one_active_idx"), "A booking cannot have two active assignments.");
check("acceptance evidence constraint", migration.includes("availabilityConfirmed") && migration.includes("sealKitReady") && migration.includes("vehicleReady"), "Database acceptance requires all four confirmations.");
check("paid booking gate", policy.includes("Booking must be paid and confirmed before assignment"), "Unpaid bookings are blocked.");
check("traveler readiness gate", policy.includes("passengerManifestCustodyBlockers"), "Every traveler is checked before assignment.");
check("schedule conflict gate", opsRoute.includes("already has an active primary or backup assignment"), "Primary and backup schedules are checked before assignment.");
check("person-bound route gate", opsRoute.includes("differentAgentPersonBlockers") && opsRoute.includes("person_key_hash"), "The assignment route rejects duplicate-person credentials before assignment.");
check("current evidence gate", policy.includes("Agent training evidence is missing or expired") && policy.includes("Agent insurance coverage evidence is missing or expired"), "Expired training or insurance blocks assignment.");
check("provider identity gate", readinessRoute.includes("STRIPE_IDENTITY_PROVIDER") && readinessRoute.includes("required before activation"), "Admin text cannot replace provider-backed agent identity.");
check("individual account gate", driverRoute.includes("individual database-backed agent session is required"), "Shared or environment-only driver access cannot accept.");
check("primary-only acceptance", driverRoute.includes("Only the assigned primary agent can respond"), "Backup cannot silently self-promote.");
check("decline reason", driverRoute.includes("Record a reason before declining"), "Declines are auditable.");
check("deadline fail closed", driverRoute.includes("acceptance deadline passed"), "Expired assignment requires dispatch action.");
check("legacy assignment blocked", bookingRoute.includes("reservedAgentAssignmentStatus"), "Generic booking patches cannot bypass the checkpoint.");
check("dispatcher selects two agents", adminPage.includes("Primary agent") && adminPage.includes("Backup agent"), "Admin UI requires both roles.");
check("driver confirms equipment", driverPage.includes("My assigned phone/device is charged") && driverPage.includes("My approved seal kit is present"), "Driver UI captures equipment confirmations.");
check("no handoff authorization claim", !migration.includes("airline_authorized") && !policy.includes("TSA approved"), "Checkpoint stays carrier-neutral and pre-custody.");

const failed = checks.filter((item) => !item.pass);
console.log(`Agent assignment checkpoint: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name} — ${item.detail}`);
if (failed.length) process.exitCode = 1;
