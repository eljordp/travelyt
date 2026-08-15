#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const checks = [];

function check(name, pass, detail) {
  checks.push({ name, pass: Boolean(pass), detail });
}

const migration = await readFile(path.join(ROOT, "supabase/migrations/031_identity_consent_retention_and_distinct_agents.sql"), "utf8");
const consent = await readFile(path.join(ROOT, "src/lib/identity-consent.ts"), "utf8");
const profile = await readFile(path.join(ROOT, "src/app/profile/page.tsx"), "utf8");
const traveler = await readFile(path.join(ROOT, "src/app/verify-traveler/page.tsx"), "utf8");
const verificationRequest = await readFile(path.join(ROOT, "src/app/api/identity/verification-request/route.ts"), "utf8");
const travelerRoute = await readFile(path.join(ROOT, "src/app/api/identity/traveler-verification/route.ts"), "utf8");
const webhook = await readFile(path.join(ROOT, "src/app/api/stripe/webhook/route.ts"), "utf8");
const retention = await readFile(path.join(ROOT, "src/lib/identity-retention.ts"), "utf8");
const retentionRoute = await readFile(path.join(ROOT, "src/app/api/internal/identity-retention/route.ts"), "utf8");
const accountDelete = await readFile(path.join(ROOT, "src/app/api/account/delete/route.ts"), "utf8");
const vercel = JSON.parse(await readFile(path.join(ROOT, "vercel.json"), "utf8"));

check("versioned consent schema", migration.includes("consent_version") && migration.includes("consent_signature_name") && migration.includes("consent_scope"), "Consent version, signature, purpose and disclosure scope are preserved separately.");
check("profile electronic signature", profile.includes("Legal name - electronic signature") && profile.includes("IDENTITY_CONSENT_VERSION"), "The account holder must check consent and type a legal name.");
check("adult electronic signature", traveler.includes("Legal name - electronic signature") && traveler.includes("IDENTITY_CONSENT_VERSION"), "A grouped adult signs through their private invite flow.");
check("server consent gate", verificationRequest.includes("validConsentSignature") && verificationRequest.includes("consent_ip_hash"), "Client text cannot bypass the server-side signed-consent requirement.");
check("adult server consent gate", travelerRoute.includes("validConsentSignature") && travelerRoute.includes("consent_user_agent_hash"), "Adult consent keeps versioned request evidence.");
check("bounded disclosure", consent.includes("approved identity-verification provider") && consent.includes("only when required and authorized"), "Disclosure language does not claim blanket carrier sharing.");
check("archive fail closed", webhook.includes('status = "manual_review"') && webhook.includes("archive_required_before_custody"), "Provider verification cannot clear custody when required originals were not archived.");
check("destruction state", migration.includes("raw_deletion_status") && migration.includes("raw_destruction_receipt") && migration.includes("raw_legal_hold_at"), "Retention, destruction proof and legal holds are explicit fields.");
check("private object deletion", retention.includes("IDENTITY_ORIGINALS_BUCKET") && retention.includes(".remove(paths)"), "Deletion removes private storage objects, not only database references.");
check("destruction receipt", retention.includes("object_path_hashes") && retention.includes("raw_destroyed_at"), "Deletion leaves non-image audit evidence.");
check("cron authorization", retentionRoute.includes("CRON_SECRET") && retentionRoute.includes("timingSafeEqual"), "The retention worker is not a public deletion endpoint.");
check("daily retention schedule", Array.isArray(vercel.crons) && vercel.crons.some((job) => job.path === "/api/internal/identity-retention"), "The production deployment schedules the deletion queue.");
check("account deletion no orphans", accountDelete.includes("destroyIdentityOriginals") && accountDelete.includes("raw_legal_hold_at"), "Account deletion destroys originals first or stops on legal hold/failure.");

const failed = checks.filter((item) => !item.pass);
console.log(`Technical identity controls: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name} - ${item.detail}`);
if (failed.length) process.exitCode = 1;
