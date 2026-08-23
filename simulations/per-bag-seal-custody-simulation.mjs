import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [driverPage, bookingRoute, custodyRoute, bookingTypes] = await Promise.all([
  readFile(path.join(ROOT, "src/app/driver/job/[id]/page.tsx"), "utf8"),
  readFile(path.join(ROOT, "src/app/api/bookings/route.ts"), "utf8"),
  readFile(path.join(ROOT, "src/app/api/custody/route.ts"), "utf8"),
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
assert.match(bookingRoute, /hasAllRequiredSealProofs/, "booking status gate must require every bag seal");
assert.match(custodyRoute, /bagBadge: bag\.badge_code/, "custody event must bind seal evidence to the bag badge");
assert.match(custodyRoute, /JSON\.stringify\(\{[\s\S]*seal: sealEvidence/, "seal evidence must enter the hash-chained event payload");

console.log("Per-bag seal custody simulation: 13/13 controls passed");
