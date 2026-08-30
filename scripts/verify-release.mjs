#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  ["npx", ["tsc", "--noEmit"], "TypeScript"],
  ["npm", ["run", "lint"], "ESLint"],
  ["node", ["simulations/account-access-security-simulation.mjs"], "Account security"],
  ["node", ["simulations/technical-identity-controls-simulation.mjs"], "Identity controls"],
  ["node", ["simulations/identity-and-access-boundary-simulation.mjs"], "Identity and access boundaries"],
  ["node", ["--experimental-strip-types", "simulations/stripe-identity-verdict-simulation.mjs"], "Stripe Identity verdicts"],
  ["node", ["simulations/current-identity-evidence-gate-simulation.mjs"], "Current identity evidence gate"],
  ["node", ["simulations/multi-passenger-household-simulation.mjs"], "Family booking"],
  ["node", ["--experimental-strip-types", "simulations/household-size-journey-simulation.mjs"], "Household sizes"],
  ["node", ["--experimental-strip-types", "simulations/pilot-eligibility-gate-simulation.mjs"], "Pilot eligibility"],
  ["node", ["--experimental-strip-types", "simulations/ops-service-level-simulation.mjs"], "ORD service levels"],
  ["node", ["simulations/server-quote-tamper-simulation.mjs"], "Server pricing quote"],
  ["node", ["simulations/baggage-screening-consent-simulation.mjs"], "Baggage screening consent"],
  ["node", ["simulations/agent-assignment-acceptance-simulation.mjs"], "Agent assignment"],
  ["node", ["--experimental-strip-types", "simulations/ops-exception-authorization-simulation.mjs"], "Exception authorization"],
  ["node", ["simulations/custody-atomic-security-simulation.mjs"], "Atomic custody"],
  ["node", ["simulations/customer-close-ledger-integrity-simulation.mjs"], "Customer close"],
  ["node", ["--experimental-strip-types", "simulations/communications-readiness-simulation.mjs"], "Communications"],
  ["node", ["simulations/audit-output-portability-simulation.mjs"], "Audit output portability"],
  ["node", ["simulations/enhanced-new-dimensions-audit.mjs"], "Enhanced audit"],
  ["node", ["simulations/original-nine-readiness-audit.mjs"], "Original-nine audit"],
  ["npm", ["run", "build"], "Production build"],
];

for (const [command, args, label] of checks) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.stderr.write(`\nRelease verification stopped at: ${label}\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write("\nRelease verification passed.\n");
