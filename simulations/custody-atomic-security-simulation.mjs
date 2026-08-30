#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, custody, migration] = await Promise.all([
  readFile(new URL("../src/app/api/custody/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/custody.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/041_atomic_custody_checkpoints.sql", import.meta.url), "utf8"),
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

check("badge issuance is admin-only", () => {
  assert.match(route, /action === "issue"[\s\S]*if \(!adminSession\)/);
  assert.match(route, /issuedBy: adminSession\.email/);
});

check("driver writes require person-bound database access", () => {
  assert.match(route, /!auth\.driverAccessId/);
  assert.match(route, /auth\.source === "env"/);
  assert.match(migration, /status = 'accepted'[\s\S]*primary_driver_access_id = p_driver_access_id[\s\S]*accepted_by_driver_access_id = p_driver_access_id/);
});

check("actor evidence is derived on the server", () => {
  assert.match(route, /actorRole: "agent"/);
  assert.match(route, /actorName: custodyGate\.driverName/);
  assert.match(route, /verifiedMethod: auth\.source === "session" \? "account_session" : "access_code"/);
  assert.doesNotMatch(route, /body\.actorRole|body\.verifiedMethod|body\.actorName/);
  assert.match(migration, /v_actor_name := v_access\.driver_name/);
});

check("legacy single-bag writes are retired", () => {
  assert.match(route, /Single-bag custody writes are retired/);
  assert.doesNotMatch(route, /appendCustodyEvent/);
  assert.doesNotMatch(custody, /\.from\("custody_events"\)[\s\S]{0,120}\.insert/);
});

check("only modern driver events can enter the route", () => {
  for (const event of [
    "custody_accepted",
    "traveler_return",
    "recipient_delivery",
    "carrier_transfer",
  ]) assert.match(route, new RegExp(`"${event}"`));
  assert.doesNotMatch(
    route.match(/const DRIVER_EVENT_TYPES[\s\S]*?\]\);/)?.[0] ?? "",
    /route_checkpoint|exception_opened|recipient_confirmed|operations_close_override/
  );
  assert.doesNotMatch(route, /DRIVER_EVENT_TYPES[\s\S]{0,500}"delivered"/);
  assert.match(migration, /Legacy or unsupported custody event type/);
});

check("booking, identity, declaration, and manifest gates exist twice", () => {
  assert.match(custody, /pilot_eligibility_status !== "approved"/);
  assert.match(custody, /pilot_eligibility_expires_at/);
  assert.match(custody, /Date\.parse\(booking\.paid_at\) > Date\.parse\(booking\.pilot_eligibility_expires_at\)/);
  assert.match(custody, /customer_identity_verified_at[\s\S]*driver_identity_verified_at[\s\S]*restricted_items_attested_at/);
  assert.match(custody, /passengerManifestCustodyBlockers/);
  assert.match(custody, /booking\.passenger_manifest\.length === 0/);
  assert.match(migration, /pilot_eligibility_status <> 'approved'/);
  assert.match(migration, /v_booking\.paid_at > v_booking\.pilot_eligibility_expires_at/);
  assert.match(migration, /jsonb_array_length\(v_booking\.passenger_manifest\) = 0/);
  assert.match(migration, /Traveler manifest verification is incomplete/);
});

check("every driver event is bound to durable stored proof", () => {
  assert.match(custody, /proof\.custodyCheckpointKey === input\.checkpointKey/);
  assert.match(custody, /typeof proof\.storagePath === "string"/);
  assert.match(migration, /proof->>'custodyCheckpointKey' = p_checkpoint_key/);
  assert.match(migration, /durable stored photo and GPS evidence/);
  assert.match(route, /proofCheckpointKey/);
  assert.match(route, /proofStoragePath/);
  assert.match(migration, /proof->>'custodyCheckpointKey' = submitted->>'proofCheckpointKey'/);
  assert.match(migration, /proof->>'storagePath' = submitted->>'proofStoragePath'/);
  assert.match(migration, /accepted_checkpoint\.event_type = 'custody_accepted'/);
  assert.match(migration, /accepted_event\.id = any\(accepted_checkpoint\.event_ids\)/);
  assert.match(migration, /accepted_event\.note::jsonb->'seal'->>'sealSerial'/);
  assert.match(migration, /accepted_event\.note::jsonb->'seal'->>'sealPhotoPath' = proof->>'storagePath'/);
});

check("current driver readiness and verified identity are rechecked", () => {
  assert.match(custody, /agentReadinessBlockers\(access, readiness\)/);
  assert.match(migration, /v_readiness\.status <> 'active'/);
  assert.match(migration, /training_expires_at is null or v_readiness\.training_expires_at <= now\(\)/);
  assert.match(migration, /insurance_expires_at is null or v_readiness\.insurance_expires_at <= now\(\)/);
  assert.match(migration, /vehicle_expires_at is null or v_readiness\.vehicle_expires_at <= now\(\)/);
  assert.match(migration, /provider = 'stripe_identity'/);
  assert.match(migration, /v_identity_verification_id := split_part/);
  assert.match(migration, /v_actor_role, v_actor_name, v_identity_verification_id/);
  assert.equal((migration.match(/for share/g) ?? []).length >= 5, true);
});

check("carrier transfer is authorization-gated in the database", () => {
  assert.match(migration, /p_event_type = 'carrier_transfer'[\s\S]*external_provider[\s\S]*external_reference[\s\S]*carrier_handoff_authorized/);
});

check("arrival custody requires explicit release authority", () => {
  assert.match(custody, /arrival_release_status === "authorized"/);
  assert.match(migration, /arrival_release_status = 'authorized'[\s\S]*arrival_release_reference[\s\S]*arrival_release_location[\s\S]*arrival_release_authorized_at[\s\S]*arrival_release_authorized_by/);
});

check("modern transitions distinguish delivery, confirmation, and override", () => {
  assert.match(migration, /p_event_type = 'recipient_confirmed'[\s\S]*traveler_return', 'recipient_delivery/);
  assert.match(migration, /p_event_type = 'operations_close_override'[\s\S]*traveler_return', 'recipient_delivery', 'carrier_transfer/);
  assert.match(migration, /p_actor_role <> 'traveler'/);
  assert.match(migration, /p_actor_role <> 'operations' or p_verified_method <> 'manual_record'/);
});

check("checkpoint request requires a stable key and expected count", () => {
  assert.match(route, /Missing checkpointKey/);
  assert.match(route, /Expected bag count must be an integer between 1 and 20/);
  assert.match(custody, /p_checkpoint_key: checkpointKey/);
  assert.match(custody, /p_expected_bag_count: input\.expectedBagCount/);
});

check("one RPC owns all bag-event writes", () => {
  assert.match(custody, /rpc\("record_custody_checkpoint"/);
  assert.match(migration, /for v_bag in[\s\S]*insert into public\.custody_events[\s\S]*cardinality\(v_event_ids\) <> p_expected_bag_count/);
  assert.match(custody, /events\.length !== input\.expectedBagCount/);
  assert.match(custody, /uniqueBagIds\.size !== input\.expectedBagCount/);
});

check("the RPC advances the booking in the same transaction", () => {
  assert.match(migration, /update public\.bookings[\s\S]*where id = p_booking_id and status = v_booking\.status/);
  assert.match(migration, /when 'custody_accepted' then case when v_booking\.service = 'arrival' then 'in_transit' else 'picked_up' end/);
  assert.match(migration, /when 'traveler_return' then 'delivery_pending'/);
  assert.match(migration, /when 'carrier_transfer' then 'delivered'/);
  assert.match(migration, /when 'recipient_delivery' then 'delivery_pending'/);
  assert.match(migration, /when 'recipient_confirmed' then 'closed'/);
  assert.match(migration, /when 'operations_close_override' then 'closed'/);
  assert.match(custody, /bookingStatus: string/);
});

check("idempotency conflicts fail closed", () => {
  assert.match(migration, /unique \(booking_id, checkpoint_key\)/);
  assert.match(migration, /request_fingerprint <> v_fingerprint/);
  assert.match(migration, /Checkpoint key was already used for a different custody request/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /v_canonical_seals::text/);
  assert.doesNotMatch(
    migration.match(/Idempotency compares only immutable request inputs[\s\S]*?select \* into v_existing/)?.[0] ?? "",
    /v_event_proof|v_seal_proofs/
  );
});

check("bag issuance is atomic and complete", () => {
  assert.match(custody, /rpc\("issue_custody_bags"/);
  assert.match(migration, /create or replace function public\.issue_custody_bags/);
  assert.match(migration, /Booking already has bag records outside this issuance checkpoint/);
  assert.match(custody, /bags\.length !== count/);
  assert.match(custody, /events\.length !== count/);
  assert.match(custody, /existingBags\.map\(\(bag\) => String\(bag\.badge_code\)\)/);
  assert.match(migration, /array_to_string\(p_badge_codes, ','\)/);
});

check("bag identity is deterministic and never inferred from UUID order", () => {
  assert.match(migration, /add column if not exists bag_number integer/);
  assert.match(migration, /order by bag_number for update/);
  assert.match(migration, /Existing bag labels need manual reconciliation/);
  assert.doesNotMatch(migration, /fallback_number|row_number\(\).*created_at, id/);
  assert.match(custody, /\.order\("bag_number"/);
});

check("seal serials are bounded in route and database", () => {
  assert.match(route, /\^\[A-Z0-9\]\[A-Z0-9-\]\{2,63\}\$/);
  assert.match(migration, /\^\[A-Z0-9\]\[A-Z0-9-\]\{2,63\}\$/);
});

check("each bag hashes its own proof, GPS, release, and seal", () => {
  assert.match(migration, /when p_event_type = 'custody_accepted' then v_seal/);
  assert.match(migration, /'photoPath', v_event_photo_path/);
  assert.match(migration, /'handoff', v_effective_proof->'handoff'/);
  assert.match(migration, /'bagIndex', v_index/);
  assert.match(migration, /'bagBadge', v_bag\.badge_code/);
  assert.match(migration, /sealProofCheckpointKey/);
  assert.match(migration, /exact durable intact-seal proof per bag/);
});

check("the chain trigger serializes sequence assignment", () => {
  assert.match(migration, /from public\.bags[\s\S]*where id = new\.bag_id[\s\S]*for update/);
  assert.match(migration, /order by seq desc[\s\S]*limit 1/);
});

check("hash functions use explicit extension schema and safe search paths", () => {
  assert.equal((migration.match(/set search_path = pg_catalog/g) ?? []).length >= 5, true);
  assert.doesNotMatch(migration, /set search_path = [^\n]*public/);
  assert.equal((migration.match(/extensions\.digest/g) ?? []).length >= 4, true);
  assert.doesNotMatch(migration, /(?<!extensions\.)digest\(/);
});

check("verification coordinates with concurrent inserts", () => {
  assert.match(migration, /verify_custody_chain[\s\S]*where id = p_bag_id for share/);
});

check("chain rows bind to the locked bag and server time", () => {
  assert.match(migration, /new\.booking_id <> locked_bag\.booking_id/);
  assert.match(migration, /new\.badge_code <> locked_bag\.badge_code/);
  assert.match(migration, /new\.created_at := clock_timestamp\(\)/);
});

check("recipient close records signature but operations override does not", () => {
  assert.match(migration, /customer_signature_name = case[\s\S]*p_event_type = 'recipient_confirmed' then v_actor_name[\s\S]*else customer_signature_name/);
  assert.match(migration, /'reason', left\(coalesce\([\s\S]*nullif\(btrim\(p_note\), ''\)/);
});

check("custody RPCs are unavailable to public app roles", () => {
  assert.match(migration, /revoke all on function public\.issue_custody_bags[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.record_custody_checkpoint[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_custody_checkpoint[\s\S]*to service_role/);
  assert.match(migration, /revoke insert, update, delete, truncate on table[\s\S]*public\.bags, public\.custody_events, public\.custody_checkpoints[\s\S]*from service_role/);
  assert.match(migration, /grant select on table[\s\S]*public\.bags, public\.custody_events, public\.custody_checkpoints[\s\S]*to service_role/);
});

const failed = checks.filter((item) => !item.pass);
console.log(`Atomic custody security: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
if (failed.length) process.exitCode = 1;
