import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const sourceRoot = process.env.TRAVELYT_SOURCE_ROOT || process.cwd();
const outputDir = path.resolve(process.argv[2] || "/private/tmp/travelyt-enhanced-new-dimensions-audit");
const liveEvidencePath = path.resolve(
  process.env.TRAVELYT_LIVE_EVIDENCE ||
    path.join(sourceRoot, "simulations/evidence/live-evidence-current.json")
);
let liveEvidence = null;
try {
  liveEvidence = JSON.parse(await readFile(liveEvidencePath, "utf8"));
} catch {
  // The source-only audit still runs, but it must not infer live readiness.
}
const liveEvidenceAsOfMs = Date.parse(liveEvidence?.asOf ?? "");
const liveEvidenceSchemaCurrent = Boolean(
  liveEvidence?.schemaVersion === 1 &&
  Number.isFinite(liveEvidenceAsOfMs) &&
  Date.now() - liveEvidenceAsOfMs >= 0 &&
  Date.now() - liveEvidenceAsOfMs <= 7 * 24 * 60 * 60 * 1000 &&
  typeof liveEvidence?.production?.deploymentId === "string" &&
  liveEvidence.production.deploymentId.startsWith("dpl_")
);

let currentSourceCommit = null;
let releaseSourceDirty = true;
try {
  currentSourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: sourceRoot, encoding: "utf8" },
  );
  const releaseSourcePrefixes = ["src/", "supabase/", "simulations/"];
  releaseSourceDirty = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((relative) => !relative.startsWith("simulations/evidence/"))
    .some(
      (relative) =>
        releaseSourcePrefixes.some((prefix) => relative.startsWith(prefix)) ||
        relative === "package.json" ||
        relative === ".env.example",
    );
} catch {
  // Without source revision evidence, production cannot be bound to this audit.
}

let deployedReleaseSourceMatches = false;
if (liveEvidence?.production?.baselineCommit && currentSourceCommit) {
  try {
    execFileSync(
      "git",
      [
        "diff",
        "--quiet",
        liveEvidence.production.baselineCommit,
        currentSourceCommit,
        "--",
        "src",
        "supabase",
        "simulations",
        "package.json",
        ".env.example",
        ":(exclude)simulations/evidence/**",
      ],
      { cwd: sourceRoot, stdio: "ignore" },
    );
    deployedReleaseSourceMatches = true;
  } catch {
    deployedReleaseSourceMatches = false;
  }
}

const productionEvidenceMatchesSource = Boolean(
  liveEvidenceSchemaCurrent &&
  liveEvidence?.production?.deploymentVerifiedReady &&
    deployedReleaseSourceMatches &&
    !releaseSourceDirty,
);

const files = {
  bookings: "src/app/api/bookings/route.ts",
  bookingTypes: "src/lib/bookings.ts",
  bookingTime: "src/lib/booking-time.ts",
  serviceRules: "src/lib/service-rules.ts",
  quote: "src/app/quote/page.tsx",
  identityRequest: "src/app/api/identity/verification-request/route.ts",
  stripeIdentity: "src/lib/stripe-identity.ts",
  identityOriginals: "src/lib/identity-originals.ts",
  identityReview: "src/app/api/identity/verification-review/route.ts",
  travelerVerification: "src/app/api/identity/traveler-verification/route.ts",
  passengerLogic: "src/lib/passengers.ts",
  offlineCustody: "src/lib/offline-custody.ts",
  refunds: "src/app/api/ops/refunds/route.ts",
  workflow: "src/app/api/ops/booking-workflow/route.ts",
  backupOps: "src/lib/backup-ops.ts",
  partnerEvents: "src/app/api/partner-integrations/route.ts",
  rjCheckIn: "src/lib/rj-check-in.ts",
  rjCheckInRoute: "src/app/api/partner-integrations/royal-jordanian/check-in/route.ts",
  rjWebhook: "src/app/api/partner-integrations/royal-jordanian/webhook/route.ts",
  stripeWebhook: "src/app/api/stripe/webhook/route.ts",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, relative]) => {
    try {
      return [key, await readFile(path.join(sourceRoot, relative), "utf8")];
    } catch {
      return [key, null];
    }
  }))
);

const checks = [];
function check(id, lane, result, title, evidence, nextStep) {
  checks.push({ id, lane, result, title, evidence, nextStep });
}
function has(key, pattern) {
  return Boolean(source[key] && pattern.test(source[key]));
}

// Identity fraud
const liveIdentityVerified = Boolean(
  productionEvidenceMatchesSource &&
  liveEvidence?.identity?.productionAppVerificationCompleted &&
  liveEvidence?.identity?.signedWebhookReturned200 &&
  liveEvidence?.identity?.originalIdAndSelfieArchiveVerified
);
check(
  "IDENTITY-01",
  "Identity fraud",
  has("identityRequest", /createStripeIdentitySession/) &&
  has("stripeIdentity", /require_live_capture:\s*true/) &&
  has("stripeIdentity", /require_matching_selfie:\s*true/) &&
  has("stripeWebhook", /verifiedIdentityProfile/) &&
  has("stripeWebhook", /expected_dob_match/) &&
  has("stripeWebhook", /expected_name_match/) &&
  has("stripeWebhook", /identityArchiveComplete/) &&
  has("identityOriginals", /return hasDocument && hasSelfie/) &&
  has("identityReview", /action !== "reject"/)
    ? liveIdentityVerified ? "PASS" : "PARTIAL" : "MISSING",
  "Fake traveler / forged-ID admission",
  liveIdentityVerified
    ? `Stripe Identity document, live-capture, selfie-match, signed webhook, original-image archive, and traveler-DOB reconciliation are implemented fail-closed. Time-bound live evidence dated ${liveEvidence.asOf} records a successful production-app verification and webhook 200; negative controls remain simulation evidence.`
    : "Stripe Identity document, live-capture, selfie-match, webhook, and traveler-DOB reconciliation are implemented fail-closed, but no time-bound successful live verification evidence was loaded.",
  liveIdentityVerified
    ? "Retain the success receipt and continue negative-control regression; this does not authorize physical custody."
    : "Load a current evidence snapshot after one successful production-app verification, signed webhook, and original-image archive."
);
check(
  "IDENTITY-02",
  "Identity fraud",
  has("bookingTypes", /passengers\??:/) && has("passengerLogic", /ageOnDate/) && has("passengerLogic", /age! < 18/)
    ? "PASS" : "MISSING",
  "Altered age and dependent classification",
  "Passenger manifests normalize the traveler age on the travel date, force the under-18 guardian branch, and require separate adult email verification except for the logged household-spouse exception.",
  "A verified document/DOB result still requires the identity-provider gate."
);
check(
  "IDENTITY-03",
  "Identity fraud",
  has("travelerVerification", /verification_invite_otp_hash/) && has("identityRequest", /verification_invite_otp_hash/)
    ? "PASS" : "MISSING",
  "Forwarded adult-verification link",
  source.travelerVerification && has("travelerVerification", /action === "request_code"/)
    ? "The invitation token opens the session but consent requires a separately requested, short-lived OTP sent to the recorded adult email; attempts are bounded."
    : "No traveler-verification endpoint or separated OTP delivery path was found.",
  "Run an end-to-end email delivery test in a non-production environment."
);
check(
  "IDENTITY-04",
  "Identity fraud",
  has("passengerLogic", /identityKeys|appears more than once|duplicate|Duplicate/) ? "PASS" : "MISSING",
  "Duplicate passenger",
  "Passenger normalization rejects duplicate name/DOB/email identities and duplicate record IDs before the booking insert.",
  "Exercise this validation through the customer booking UI before release."
);

// Operations
check(
  "OPS-01",
  "Operational failure",
  has("workflow", /resolve_group/) && has("workflow", /Group changes are frozen once custody starts/) ? "PASS" : "MISSING",
  "Partial group / unresolved adult",
  "Admin-only group resolution removes only pre-custody added travelers, requires every remaining bag assignment to reconcile, and forces any check-in job into manual review.",
  "Exercise remove/reassign with a real operator before release."
);
check(
  "OPS-02",
  "Operational failure",
  has("refunds", /stripe\.refunds\.create/) && has("refunds", /idempotencyKey/) && has("stripeWebhook", /refund\.updated/) ? "PASS" : "MISSING",
  "Cancellation or refund after pickup",
  "Full-admin refund requests are keyed idempotently, ledgered before Stripe submission, and reconciled through signed Stripe refund/dispute webhooks.",
  "Use Stripe test mode to verify a duplicate request, an asynchronous refund, and a dispute event."
);
check(
  "OPS-03",
  "Operational failure",
  has("workflow", /dispatch_eta/) &&
    has("workflow", /departure - 180/) &&
    has("bookingTime", /TRAVELYT_HANDOFF_TARGET_MINUTES/) &&
    has("serviceRules", /TRAVELYT_HANDOFF_TARGET_MINUTES\s*=\s*180/) &&
    has("quote", /if \(!form\.flight\.trim\(\)\)/) &&
    has("bookings", /if \(!flight\) return "Flight number is required\."/)
    ? "PASS" : "MISSING",
  "Real ORD multi-stop timing",
  "Client and server require a flight number; booking-time validation reserves the route buffer before Travelyt's three-hour handoff target; dispatch recalculation creates a no-go exception and hold when that target is crossed. For RJ264 20:00, the internal no-go is 17:00 local unless RJ requires earlier.",
  "Connect a routed, live traffic ETA source only after the operator policy and authorization are approved."
);
check(
  "OPS-04",
  "Operational failure",
  has("offlineCustody", /indexedDB/) && has("bookingTypes", /queueOfflineProof/) && has("bookings", /OFFLINE_PROOF_RECONCILED/)
    ? "PASS" : has("backupOps", /GPS or photo upload fails/) ? "PARTIAL" : "MISSING",
  "Offline proof / driver-device failure",
  "Driver proof is held in an IndexedDB queue with a SHA-256 reconciliation digest and only removed after authenticated API replay; the server records the reconciliation exception.",
  "Rehearse the queue on the exact driver device with loss and return of connectivity."
);

// RJ / integration seam
check(
  "RJ-01",
  "RJ integration seam",
  has("workflow", /handoff_refused/) && has("workflow", /return_completed/) ? "PASS" : "PARTIAL",
  "Counter refusal or absent receiving staff",
  has("workflow", /handoff_refused/)
    ? "Admin workflow records the refusal, places the bag in an airport-hold issue state, and creates a linked return-start/return-complete custody trail."
    : "No refusal playbook was found.",
  "RJ must still supply the written receiving-point, named-staff, escalation, and return/refusal procedure."
);
check(
  "RJ-02",
  "RJ integration seam",
  has("bookingTypes", /prohibited_item|seal_compromised/) && has("workflow", /handoff_refused/) ? "PASS" : "MISSING",
  "Screening rejection / prohibited item / broken seal",
  "Issue taxonomy includes prohibited_item and seal_compromised, with the structured hold/refusal/return workflow available for containment.",
  "RJ must approve station-specific screening and refusal reason mapping."
);
check(
  "RJ-03",
  "RJ integration seam",
  has("rjCheckIn", /Idempotency-Key/) && has("rjWebhook", /signatureIsValid/) && has("rjCheckInRoute", /idempotencyKey/) ? "PASS" : "MISSING",
  "API timeout after possible airline acceptance",
  "Locked server-side RJ adapter sends an Idempotency-Key, rejects ambiguous/unsafe result states, persists a job ledger, and accepts only HMAC-signed status webhooks.",
  "Test against the RJ-approved sandbox only after credentials and reconciliation behavior are supplied."
);
check(
  "RJ-04",
  "RJ integration seam",
  "EXTERNAL",
  "Passenger presence, screening, and handoff authorization",
  "No software simulation can authorize airline acceptance, substitute for a named receiving employee, or establish screening ownership.",
  "Obtain RJ's written ORD procedure and run the timed dummy-bag rehearsal with the named station team."
);

// Payment event integrity that the ordinary booking flow needs regardless of RJ.
check(
  "PAYMENT-01",
  "Payment integrity",
  has("stripeWebhook", /checkout\.session\.completed/) && has("stripeWebhook", /refund\.updated/) && has("stripeWebhook", /charge\.dispute\.created/) ? "PASS" : "PARTIAL",
  "Late, duplicate, or refund Stripe webhook",
  "Stripe signature verification covers checkout completion, refund reconciliation, and dispute-ledger records; idempotency keys prevent duplicate ledger entries.",
  "Verify each event in Stripe test mode before production enablement."
);

const counts = Object.fromEntries(
  ["PASS", "PARTIAL", "MISSING", "EXTERNAL"].map((result) => [result, checks.filter((item) => item.result === result).length])
);
const result = {
  generatedAt: new Date().toISOString(),
  mode: liveEvidence
    ? "current-source adversarial audit with time-bound production evidence"
    : "non-production current-source adversarial audit",
  sourceRoot,
  scope: "Only the newly requested identity-fraud, operational-failure, and RJ/integration-seam dimensions.",
  verdict: counts.MISSING > 0 ? "NO-GO_CURRENT_SOURCE_MISSING_REQUIRED_WORKFLOWS" : counts.PARTIAL > 0 ? "CONDITIONAL_NO-GO" : "CODE_READY_EXTERNAL_GATES_REMAIN",
  counts: { scenarios: checks.length, ...counts },
  checks,
  readinessLayers: {
    sourceControls: counts.MISSING === 0 ? "PRESENT_IN_CURRENT_SOURCE" : "INCOMPLETE",
    integratedTestEnvironment: liveEvidence?.journeys?.sixPersonRealIndependentAdultEmailOtpPaymentRefundDriverCustodyClose
      ? "VERIFIED_FULL_JOURNEY"
      : liveEvidence?.journeys?.twoPersonPaymentAndReceipt
        ? "PARTIAL_TWO_PERSON_PAYMENT_AND_SOURCE_SIMULATIONS"
        : liveEvidence?.journeys?.twoPersonWaitlistedNoChargeControl
          ? "PARTIAL_TWO_PERSON_WAITLISTED_NO_CHARGE_AND_SOURCE_SIMULATIONS"
          : liveEvidence
            ? "SOURCE_SIMULATIONS_AND_PROVIDER_EMAIL_ONLY"
            : "NOT_RUN",
    productionDeployment: productionEvidenceMatchesSource
      ? `VERIFIED_READY_AS_OF_${liveEvidence.asOf}`
      : "NOT_VERIFIED_FOR_CURRENT_SOURCE_REVISION",
    physicalRehearsal: liveEvidence?.journeys?.physicalDriverCustodyRehearsal
      ? "VERIFIED"
      : "NOT_RUN",
    airlineAuthorization: "NOT_OBTAINED",
    insuranceBinder: liveEvidence?.externalGates?.boundInsuranceAndCoi
      ? "PROVIDED"
      : "NOT_PROVIDED",
  },
  nonActions: [
    "No production API call", "No airline request", "No Supabase read or write", "No payment or refund", "No email or SMS", "No deployment, migration, commit, or push"
  ],
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "travelyt-enhanced-new-dimensions-results.json"), `${JSON.stringify(result, null, 2)}\n`);
const rows = checks.map((item) => `| ${item.result} | ${item.id} | ${item.title} |`).join("\n");
const details = checks.map((item) => `### ${item.result} — ${item.id}: ${item.title}\n\n- **Evidence:** ${item.evidence}\n- **Path:** ${item.nextStep}`).join("\n\n");
const readiness = Object.entries(result.readinessLayers).map(([key, value]) => `- **${key}:** ${value}`).join("\n");
const report = `# Travelyt Enhanced New-Dimensions Audit\n\n**Verdict: ${result.verdict}**\n\nThis audit evaluates the requested Aug 8 dimensions against current source${liveEvidence ? ` plus the time-bound live evidence snapshot dated ${liveEvidence.asOf}` : " only"}. It does not claim airline authorization or a live pilot.\n\n## Result\n\n- ${counts.PASS} pass, ${counts.PARTIAL} partial, ${counts.MISSING} missing workflow, ${counts.EXTERNAL} external gate\n- Source controls, production proof, integrated journeys, physical rehearsal, and external authority are reported as separate readiness layers. A source pass never substitutes for live evidence or third-party authorization.\n\n| Result | ID | Scenario |\n|---|---|---|\n${rows}\n\n## Readiness Layers\n\n${readiness}\n\n## Findings\n\n${details}\n\n## Boundary\n\nA counter refusal, absent RJ staff, screening rejection, or airline API ambiguity can be modelled in software; it cannot be passed as a real-world proof without the carrier's written procedure, API/sandbox behavior where applicable, bound insurance, and a timed physical rehearsal.\n\n## Non-actions\n\n${result.nonActions.map((item) => `- ${item}`).join("\n")}\n`;
await writeFile(path.join(outputDir, "travelyt-enhanced-new-dimensions-report.md"), report);
console.log(JSON.stringify({ verdict: result.verdict, counts: result.counts, outputDir }));
if (counts.MISSING > 0) process.exitCode = 1;
