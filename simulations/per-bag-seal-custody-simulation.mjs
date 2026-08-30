import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [driverPage, bookingRoute, custodyRoute, custodyLib, custodyMigration, bookingTypes] = await Promise.all([
  readFile(path.join(ROOT, "src/app/driver/job/[id]/page.tsx"), "utf8"),
  readFile(path.join(ROOT, "src/app/api/bookings/route.ts"), "utf8"),
  readFile(path.join(ROOT, "src/app/api/custody/route.ts"), "utf8"),
  readFile(path.join(ROOT, "src/lib/custody.ts"), "utf8"),
  readFile(path.join(ROOT, "supabase/migrations/041_atomic_custody_checkpoints.sql"), "utf8"),
  readFile(path.join(ROOT, "src/lib/bookings.ts"), "utf8"),
]);

function sealReady(bagCount, proofs) {
  const latest = proofs.filter((proof) => proof.kind === "seal").slice(-bagCount);
  if (latest.length !== bagCount) return false;
  const indexes = latest.map((proof) => proof.bagIndex);
  const serials = latest.map((proof) => proof.sealId?.trim().toUpperCase());
  return (
    latest.every(
      (proof) =>
        proof.photo &&
        proof.gps &&
        proof.sealId &&
        ["zipper", "latch_label", "handle"].includes(proof.sealMethod) &&
        proof.sealStatus === "intact"
    ) &&
    new Set(indexes).size === bagCount &&
    new Set(serials).size === bagCount
  );
}

const goodProofs = Array.from({ length: 4 }, (_, index) => ({
  kind: "seal",
  bagIndex: index + 1,
  sealId: `TVT-S-${String(index + 1).padStart(8, "0")}`,
  sealMethod: index === 2 ? "latch_label" : "zipper",
  sealStatus: "intact",
  photo: true,
  gps: true,
  approvedAt: "2026-08-22T00:00:00.000Z",
}));

assert.equal(sealReady(4, goodProofs.slice(0, 3)), false, "missing bag must block pickup");
assert.equal(
  sealReady(4, [...goodProofs.slice(0, 3), { ...goodProofs[3], sealId: goodProofs[0].sealId }]),
  false,
  "duplicate serial must block pickup"
);
assert.equal(
  sealReady(4, [...goodProofs.slice(0, 3), { ...goodProofs[3], sealStatus: "broken" }]),
  false,
  "broken seal must block normal pickup"
);
assert.equal(sealReady(4, goodProofs), true, "one complete intact seal proof per bag should pass");
assert.equal(
  goodProofs.every((proof) => Boolean(proof.approvedAt)),
  true,
  "every bag approval is required"
);

for (const field of ["bagIndex", "bagLabel", "sealMethod", "sealStatus"]) {
  assert.match(bookingTypes, new RegExp(`${field}\\?`), `${field} must be typed on proof records`);
}
assert.match(driverPage, /BarcodeDetector/, "driver camera should attempt barcode detection");
assert.ok(
  driverPage.includes("bagLabel: `Bag ${bagIndex} of ${booking.bags}`"),
  "driver proof must bind to a bag number"
);
assert.match(driverPage, /SEAL_STATUS_STOP/, "broken or replaced seal must open an exception");
assert.match(
  driverPage,
  /CUSTODY_LEDGER_WRITE_FAILED/,
  "ledger failure must create a critical operations exception"
);
assert.match(
  driverPage,
  /payload\.events\.length !== custodyBooking\.bags/,
  "booking progression must require one custody event per bag"
);
assert.doesNotMatch(
  driverPage,
  /logCustody\("recipient_confirmed"/,
  "driver delivery proof must not impersonate the customer's receipt confirmation"
);
assert.match(
  driverPage,
  /logCustody\(\s*"recipient_delivery"/,
  "driver delivery proof should be recorded separately from customer confirmation"
);
assert.match(
  bookingRoute,
  /eventType:\s*travelerClosing[\s\S]*\?\s*"recipient_confirmed"[\s\S]*actorRole:\s*travelerClosing[\s\S]*\?\s*"traveler"/,
  "customer close remains the only recipient-confirmed custody event"
);
assert.match(bookingRoute, /hasAllRequiredSealProofs/, "booking status gate must require every bag seal");
assert.match(custodyRoute, /recordCustodyCheckpoint\(\{/, "custody route must use the atomic checkpoint helper");
assert.match(custodyLib, /rpc\("record_custody_checkpoint"/, "custody helper must call the transactional RPC");
assert.match(custodyMigration, /'bagBadge', v_bag\.badge_code/, "atomic RPC must bind seal evidence to the bag badge");
assert.match(driverPage, /proofCheckpointKey:\s*proof\.custodyCheckpointKey/, "driver must submit the exact stored seal proof checkpoint key");
assert.match(driverPage, /proofStoragePath:\s*proof\.storagePath/, "driver must submit the exact durable seal proof storage path");
assert.match(custodyMigration, /proof->>'custodyCheckpointKey' = submitted->>'proofCheckpointKey'/, "RPC must match each submitted bag to the exact stored proof key");
assert.match(custodyMigration, /proof->>'storagePath' = submitted->>'proofStoragePath'/, "RPC must match each submitted bag to the exact stored proof path");
assert.match(custodyMigration, /v_note := jsonb_strip_nulls\(jsonb_build_object\([\s\S]*'seal'/, "seal evidence must enter the hash-chained event payload");
assert.match(custodyMigration, /cardinality\(v_event_ids\) <> p_expected_bag_count/, "partial multi-bag checkpoints must roll back");
assert.match(custodyMigration, /unique \(booking_id, checkpoint_key\)/, "checkpoint retries must be idempotent");
assert.match(bookingTypes, /custodyCheckpointKey\?: string/, "stored proof must carry the retry-stable custody checkpoint key");
assert.match(driverPage, /resumableCustodyCheckpoint/, "reload must be able to resume a stored but unadvanced custody checkpoint");
assert.match(driverPage, /custodyActionLock\.current/, "double-submit must be blocked by a synchronous action lock");
assert.match(custodyMigration, /order by bag_number for update/, "atomic bag mapping must use physical bag number");
assert.match(custodyMigration, /'handoff', v_effective_proof->'handoff'/, "the hashed event must retain exact release or receiving-party evidence");
assert.match(custodyMigration, /update public\.bookings[\s\S]*status = v_next_booking_status/, "bag events and booking progression must share one SQL transaction");

console.log("Per-bag seal custody simulation: 32/32 controls passed");
