import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const driverPage = await readFile(
  path.join(root, "src/app/driver/job/[id]/page.tsx"),
  "utf8",
);

assert.match(
  driverPage,
  /needsPickupPhoto \|\| needsAirportRelease/,
  "arrival release must expose the same per-bag seal controls as departure pickup",
);
assert.match(
  driverPage,
  /Airport release \+ seal — bag \$\{nextSealBagNumber\} of \$\{booking\.bags\}/,
  "arrival UI must identify the bag being sealed",
);
assert.match(
  driverPage,
  /async function markAirportRelease\(\)[\s\S]*sealId\.trim\(\)\.toUpperCase\(\)[\s\S]*sealStatus !== "intact"/,
  "arrival release must require an intact numbered seal",
);
assert.match(
  driverPage,
  /async function markAirportRelease\(\)[\s\S]*kind: "seal"[\s\S]*bagIndex[\s\S]*sealMethod[\s\S]*sealStatus/,
  "arrival release must persist one structured seal proof per bag",
);
assert.match(
  driverPage,
  /sealedCount < booking\.bags[\s\S]*clearPhoto\(\{ preserveHandoff: true, preserveCheckpoint: true \}\)/,
  "arrival custody must wait for every bag while preserving release-party details",
);
assert.match(
  driverPage,
  /sealedCount < booking\.bags[\s\S]*logCustody\(\s*"custody_accepted"/,
  "arrival custody event must occur only after the final bag seal",
);

console.log("Arrival seal custody controls: 6/6 passed");
