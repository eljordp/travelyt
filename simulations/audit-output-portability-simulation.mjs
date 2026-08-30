import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const audits = [
  "simulations/enhanced-new-dimensions-audit.mjs",
  "simulations/original-nine-readiness-audit.mjs",
  "simulations/rj-ord-integrated-checkpoint.mjs",
];

for (const relative of audits) {
  const source = await readFile(path.join(root, relative), "utf8");
  if (source.includes("/private/tmp")) {
    throw new Error(`${relative} still hard-codes the macOS-only /private/tmp path.`);
  }
  if (!source.includes('from "node:os"') || !source.includes("tmpdir()")) {
    throw new Error(`${relative} does not derive its default output directory from node:os.`);
  }
  console.log(`PASS ${relative} uses the operating system temp directory`);
}

console.log(`Audit output portability: ${audits.length}/${audits.length} passed`);
