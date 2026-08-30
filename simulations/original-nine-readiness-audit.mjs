#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(
  process.argv[2] || "/private/tmp/travelyt-original-nine-readiness-audit"
);
const evidencePath = path.resolve(
  process.env.TRAVELYT_LIVE_EVIDENCE ||
    path.join(root, "simulations/evidence/live-evidence-2026-08-29.json")
);

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

let evidence;
try {
  evidence = JSON.parse(await readFile(evidencePath, "utf8"));
} catch {
  evidence = {
    asOf: "NO_LIVE_EVIDENCE",
    identity: {},
    payments: {},
    communications: {},
    journeys: {},
    pilotPolicy: {},
    externalGates: {},
  };
}
const [
  pricing,
  bookingTypes,
  separateLegMigration,
  identityWebhook,
  handoffPolicy,
  assignment,
  custodySpec,
  opsRules,
  driverJob,
  adminPage,
  privacyPage,
  custodyApi,
  bookingApi,
  ordPage,
  jfkPage,
  laxPage,
] = await Promise.all([
  read("src/lib/pricing.ts"),
  read("src/lib/bookings.ts"),
  read("supabase/migrations/036_separate_booking_legs.sql"),
  read("src/app/api/stripe/webhook/route.ts"),
  read("src/lib/handoff-policy.ts"),
  read("src/lib/agent-assignment.ts"),
  read("docs/custody/travelyt-concierge-control-spec.md"),
  read("src/lib/ops-rules.ts"),
  read("src/app/driver/job/[id]/page.tsx"),
  read("src/app/admin/page.tsx"),
  read("src/app/privacy/page.tsx"),
  read("src/app/api/custody/route.ts"),
  read("src/app/api/bookings/route.ts"),
  read("src/app/cities/ord/page.tsx"),
  read("src/app/cities/jfk/page.tsx"),
  read("src/app/cities/lax/page.tsx"),
]);

const gaps = [];
function gap(number, title, status, evidenceText, missing, owner) {
  gaps.push({ number, title, status, evidence: evidenceText, missing, owner });
}

const carrierAuthorityFailClosed =
  /passenger-absent airline tender needs an explicit provider authorization/i.test(
    handoffPolicy
  );
gap(
  1,
  "Operating authority and airport release paths",
  "EXTERNAL_BLOCKER",
  carrierAuthorityFailClosed
    ? "The app fails back to traveler-present departure return and keeps passenger-absent carrier transfer authorization-gated."
    : "The expected carrier-authorization fail-closed source marker is missing.",
  [
    "Written airport release authority for arrival service",
    "Carrier authorized-representative procedure for any passenger-absent departure tender",
    "Named receiving role, location, screening owner, rejection path, and station contacts",
  ],
  "Carrier, airport/station owner, and Travelyt counsel"
);

const insuranceGatePresent =
  /insurance/i.test(assignment) &&
  /bound insurance for the final operating model/i.test(custodySpec);
gap(
  2,
  "Bound insurance and COI",
  "EXTERNAL_BLOCKER",
  insuranceGatePresent
    ? "Software blocks incomplete insurance evidence and the control specification keeps bound coverage as a live-custody gate."
    : "The insurance activation gate is incomplete in source.",
  ["Bound policy", "Certificate of insurance matching the final custody and driver model"],
  "Mo and insurance broker"
);

const fullSixPersonJourney =
  evidence.journeys.sixPersonRealIndependentAdultEmailOtpPaymentRefundDriverCustodyClose ===
  true;
gap(
  3,
  "One real integrated functional test",
  fullSixPersonJourney ? "VERIFIED_DONE" : "PARTIAL",
  `Two-person Stripe sandbox checkout and delivered payment receipt: ${
    evidence.journeys.twoPersonPaymentAndReceipt ? "verified" : "not verified"
  }. Family policy: ${evidence.journeys.familyPolicyControls}. Household source simulations: ${
    evidence.journeys.householdSizeSourceSimulation
  }.`,
  fullSixPersonJourney
    ? []
    : [
        "One six-person run with a separate adult inbox and OTP",
        "A refund control in Stripe test mode",
        "Driver assignment, custody proof, and customer close in the same run",
      ],
  "JP for software run; Mo/Mansur for physical steps"
);

const allEmailLanes =
  evidence.communications.resendPaymentReceiptDelivered === true &&
  evidence.communications.adultFamilyInviteAndOtpRealInboxTested === true &&
  evidence.communications.supabaseSignupConfirmationTested === true &&
  evidence.communications.supabasePasswordRecoveryTested === true;
const smsLive =
  evidence.communications.smsPhoneProviderEnabled === true &&
  evidence.communications.smsPhoneOtpDeliveredAndVerified === true;
gap(
  4,
  "Working communications",
  allEmailLanes && smsLive ? "VERIFIED_DONE" : "PARTIAL",
  `Resend payment receipt delivered: ${evidence.communications.resendPaymentReceiptDelivered}. Supabase auth SMTP complete: ${evidence.communications.supabaseCustomSmtpComplete}. SMS enabled/tested: ${smsLive}.`,
  [
    !evidence.communications.supabaseCustomSmtpComplete &&
      "Complete Supabase Auth custom SMTP with the verified Travelyt sender",
    !evidence.communications.adultFamilyInviteAndOtpRealInboxTested &&
      "Deliver and redeem one adult-family invite plus separate OTP in a second real inbox",
    !evidence.communications.supabaseSignupConfirmationTested &&
      "Test signup confirmation email",
    !evidence.communications.supabasePasswordRecoveryTested &&
      "Test password-recovery email",
    !smsLive && "Enable Twilio Verify through Supabase and complete one real-phone OTP plus negative controls",
  ].filter(Boolean),
  "JP with Supabase, Resend, Twilio, and Vercel access"
);

const identitySourceReady =
  /identity\.verification_session\.verified/.test(identityWebhook) &&
  /original/i.test(identityWebhook);
const identityLive =
  identitySourceReady &&
  evidence.identity.productionAppVerificationCompleted === true &&
  evidence.identity.signedWebhookReturned200 === true &&
  evidence.identity.originalIdAndSelfieArchiveVerified === true;
gap(
  5,
  "Production identity verification",
  identityLive ? "VERIFIED_DONE" : "PARTIAL",
  `${evidence.identity.modeBoundary} Signed webhook 200: ${evidence.identity.signedWebhookReturned200}; original archive: ${evidence.identity.originalIdAndSelfieArchiveVerified}; negative controls: ${evidence.identity.successFailureCancellationAndDobControls}.`,
  identityLive ? [] : ["Complete and durably record one successful verification through the production app"],
  "JP"
);

gap(
  6,
  "Physical driver rehearsal",
  evidence.journeys.physicalDriverCustodyRehearsal ? "VERIFIED_DONE" : "EXTERNAL_BLOCKER",
  "Driver onboarding, evidence, training, assignment, seal, GPS, offline, and handoff source paths exist; no signed physical run is recorded in the evidence snapshot.",
  evidence.journeys.physicalDriverCustodyRehearsal
    ? []
    : ["Mo and Mansur complete the portal and one sealed dummy-bag rehearsal with signed after-action result"],
  "Mo and Mansur"
);

const policy = evidence.pilotPolicy;
const policyComplete = Boolean(
  policy.operatingHours && policy.departureSla && policy.arrivalSla
);
gap(
  7,
  "Real service area and SLA",
  policyComplete ? "VERIFIED_DONE" : "PARTIAL",
  `Known internal pilot facts: ${policy.airport}, ${policy.routeBoundaryMiles}-mile route boundary, ${policy.operatingDays}, ${policy.minimumBookingNoticeMinutes / 60}-hour minimum notice, capacity ${policy.capacity}. The four-hour custody timer is labeled as an internal review threshold, not a published SLA: ${/not a published delivery SLA/.test(opsRules)}.`,
  [
    !policy.operatingHours && "Exact operating hours",
    !policy.departureSla && "Departure service-level target",
    !policy.arrivalSla && "Arrival service-level target",
  ].filter(Boolean),
  "Mo"
);

const pricingReady =
  /arrival:\s*4900/.test(pricing) &&
  /ARRIVAL_INCLUDED_BAGS\s*=\s*2/.test(pricing) &&
  /ARRIVAL_ADDITIONAL_BAG_CENTS\s*=\s*1000/.test(pricing);
gap(
  8,
  "Pricing correction",
  pricingReady ? "VERIFIED_DONE" : "MISSING",
  pricingReady
    ? "Arrival is $49 per booking including two bags, then $10 for each additional bag."
    : "The arrival bundle constants do not match the approved pricing.",
  pricingReady ? [] : ["Restore and test the approved arrival bundle"],
  "JP"
);

const separateLegsReady =
  /type ServiceType = "departure" \| "arrival"/.test(bookingTypes) &&
  /reject_combined_booking_service/.test(separateLegMigration) &&
  /new\.service = 'both'/.test(separateLegMigration);
gap(
  9,
  "Separate departure/arrival technical cleanup",
  separateLegsReady ? "VERIFIED_DONE" : "MISSING",
  separateLegsReady
    ? "New bookings are departure or arrival only; historical combined rows are isolated by migration 036."
    : "The active type or database constraint still permits a combined booking.",
  separateLegsReady ? [] : ["Restore the separate-leg source and database constraints"],
  "JP"
);

const cityAndPrivacyText = [ordPage, jfkPage, laxPage, privacyPage].join("\n");
const internalRemediations = {
  custodyLedgerFailsClosed:
    /CUSTODY_LEDGER_WRITE_FAILED/.test(driverJob) &&
    /payload\.events\.length !== custodyBooking\.bags/.test(driverJob),
  driverAndCustomerReceiptEventsSeparated:
    !/logCustody\(\s*"recipient_confirmed"/.test(driverJob) &&
    /logCustody\(\s*"recipient_delivery"/.test(driverJob) &&
    /\? "recipient_confirmed"/.test(bookingApi) &&
    /\? "traveler" : "operations"/.test(bookingApi),
  pilotApprovalUsesExplicitChecks:
    /REQUIRED_PILOT_CHECKS\.map/.test(adminPage) &&
    /eligibilityChecks\[checkKey\] !== true/.test(adminPage),
  publicClaimsScrubbed:
    !/vetted handlers with background checks|in-house AI|anomaly detection on bag photos|handle baggage for flights on all major|handle bags for all carriers/i.test(
      cityAndPrivacyText
    ),
  publicBadgeEvidenceRedacted:
    /toPublicBagCustodySummary\(bag\)/.test(custodyApi) &&
    /toPublicCustodyChain\(chain\)/.test(custodyApi) &&
    !/returns the bag, its full custody chain/i.test(custodyApi),
};

const counts = Object.fromEntries(
  ["VERIFIED_DONE", "PARTIAL", "EXTERNAL_BLOCKER", "MISSING"].map((status) => [
    status,
    gaps.filter((item) => item.status === status).length,
  ])
);
const verdict = counts.MISSING
  ? "NO_GO_TECHNICAL_GAPS"
  : counts.PARTIAL || counts.EXTERNAL_BLOCKER
    ? "CONDITIONAL_NO_GO_LIVE_CUSTODY"
    : "READY_FOR_CONTROLLED_PILOT";

const result = {
  generatedAt: new Date().toISOString(),
  evidenceAsOf: evidence.asOf,
  evidencePath,
  verdict,
  counts,
  gaps,
  internalRemediations,
  accessNeeded: [
    "Twilio Console signed into the Travelyt account; paid/current account plus a Verify Service SID",
    "Supabase Auth Phone provider access to bind the Twilio Verify configuration",
    "One real phone and its received OTP for the delivery test",
    "Two controlled real inboxes for the independent-adult family invite/OTP test",
    "Stripe test access for the refund/dispute control",
    "Vercel production access for the phone feature flag and redeploy",
    "Mo's exact operating hours and separate departure/arrival SLA",
  ],
  meetingBoundary:
    "TSA meeting readiness is separate from live-custody readiness. Do not present carrier authorization, insurance, physical rehearsal, SMS, AI bag analysis, or a direct TSA data feed as complete.",
};

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "travelyt-original-nine-readiness-results.json"),
  `${JSON.stringify(result, null, 2)}\n`
);

const rows = gaps
  .map(
    (item) =>
      `| ${item.number} | ${item.status} | ${item.title} | ${item.missing.join("; ") || "—"} | ${item.owner} |`
  )
  .join("\n");
const remediationRows = Object.entries(internalRemediations)
  .map(([name, pass]) => `| ${pass ? "PASS" : "OPEN"} | ${name} |`)
  .join("\n");
const report = `# Travelyt Original Nine Readiness Audit\n\n**Verdict: ${verdict}**  \n**Evidence current through: ${evidence.asOf}**\n\nThis audit separates verified production behavior, source simulations, and external authority. A software pass is not airline, airport, TSA, insurance, or physical-rehearsal approval.\n\n## Score\n\n- ${counts.VERIFIED_DONE} verified done\n- ${counts.PARTIAL} partial\n- ${counts.EXTERNAL_BLOCKER} external blocker\n- ${counts.MISSING} missing technical control\n\n| # | Status | Original gap | What is still missing | Owner |\n|---:|---|---|---|---|\n${rows}\n\n## Internal remediation checks\n\n| Result | Control |\n|---|---|\n${remediationRows}\n\n## Access needed for the next closure run\n\n${result.accessNeeded.map((item) => `- ${item}`).join("\n")}\n\n## TSA boundary\n\n${result.meetingBoundary}\n`;
await writeFile(
  path.join(outputDir, "travelyt-original-nine-readiness-report.md"),
  report
);

console.log(
  JSON.stringify(
    { verdict, counts, internalRemediations, outputDir },
    null,
    2
  )
);
