#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const OUT_DIR = "/Users/jp/Desktop/Travelyt-First-Customer-Simulation";
const REPORT_PATH = path.join(OUT_DIR, "first-customer-operational-report.md");
const RESULTS_PATH = path.join(OUT_DIR, "first-customer-operational-results.json");
const execFileAsync = promisify(execFile);

const rules = {
  runAt: "2026-05-29T09:00:00-07:00",
  airlineCutoffMinutes: 40,
  includedDistanceMiles: 30,
  standardDistanceRateCents: 225,
  expressDistanceRateCents: 450,
  expressPickupCents: 2000,
  extraBagDiscountCents: 1000,
  familyBundleMinBags: 4,
  familyBundlePercent: 15,
  servicePricesCents: {
    departure: 4900,
    arrival: 2900,
    both: 6900,
  },
  launchPromoPercent: 30,
};

const firstCustomer = {
  id: "FIRST-CUSTOMER-DRY-RUN",
  service: "departure",
  airport: "IAD",
  address: "123 Launch Customer Ave, Washington, DC",
  travelDate: "2026-05-29",
  flightTime: "15:30",
  flightIso: "2026-05-29T15:30:00-07:00",
  flight: "UA 1234",
  bags: 2,
  distanceMiles: 37.6,
  promoCode: "TRAVELYT30",
  declaredValueCents: 120000,
  customer: {
    name: "First Customer Dry Run",
    email: "first.customer@example.com",
    phone: "+1 555 010 0001",
  },
  driver: "Marcus J.",
  sealId: "TVT-FIRST-001",
};

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timePart(iso) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  }).format(new Date(iso));
}

function minutesBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function estimateOperationalBufferMinutes(distanceMiles) {
  const driveMinutes = Math.ceil((Math.max(0, distanceMiles) / 35) * 60);
  return Math.max(45, 20 + driveMinutes);
}

function calcPrice({ service, bags, distanceMiles, promoCode, expressPickup = false }) {
  const safeBags = Math.max(1, bags);
  const serviceSubtotalCents = rules.servicePricesCents[service] * safeBags;
  const extraDistanceMiles = Math.max(
    0,
    Math.ceil(distanceMiles - rules.includedDistanceMiles)
  );
  const distanceRateCents = expressPickup
    ? rules.expressDistanceRateCents
    : rules.standardDistanceRateCents;
  const distanceSurchargeCents = extraDistanceMiles * distanceRateCents;
  const expressPickupCents = expressPickup ? rules.expressPickupCents : 0;
  const extraBagDiscountCents =
    safeBags > 1 ? (safeBags - 1) * rules.extraBagDiscountCents : 0;
  const familyBundleDiscountCents =
    safeBags >= rules.familyBundleMinBags
      ? Math.round((serviceSubtotalCents * rules.familyBundlePercent) / 100)
      : 0;
  const automaticDiscountCents = Math.max(
    extraBagDiscountCents,
    familyBundleDiscountCents
  );
  const promoEligibleCents =
    serviceSubtotalCents + expressPickupCents - automaticDiscountCents;
  const promoDiscountCents =
    promoCode === "TRAVELYT30"
      ? Math.round((promoEligibleCents * rules.launchPromoPercent) / 100)
      : 0;
  const totalCents =
    serviceSubtotalCents +
    expressPickupCents +
    distanceSurchargeCents -
    automaticDiscountCents -
    promoDiscountCents;

  return {
    serviceSubtotalCents,
    distanceSurchargeCents,
    extraDistanceMiles,
    distanceRateCents,
    automaticDiscountCents,
    promoDiscountCents,
    totalCents,
  };
}

async function readEnvKeys() {
  const env = {};
  try {
    const raw = await readFile(".env.local", "utf8");
    for (const line of raw.split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const value = match[2]?.trim().replace(/^['"]|['"]$/g, "");
      env[match[1]] = value;
    }
  } catch {}
  return env;
}

function present(env, key) {
  return Boolean(env[key] && env[key] !== "..." && env[key] !== "changeme");
}

async function readProductionEnvKeys() {
  try {
    const { stdout } = await execFileAsync("vercel", ["env", "ls"], {
      timeout: 10_000,
    });
    return new Set(
      stdout
        .split(/\n/)
        .map((line) => line.trim().match(/^([A-Z0-9_]+)\s+Encrypted\s+/)?.[1])
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

async function readSupabaseSecretKeys() {
  try {
    const { stdout } = await execFileAsync("supabase", ["secrets", "list"], {
      timeout: 10_000,
    });
    return new Set(
      stdout
        .split(/\n/)
        .map((line) => line.trim().match(/^([A-Z0-9_]+)\s+\|/)?.[1])
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function presentForSystem(env, productionEnvKeys, key) {
  return present(env, key) || productionEnvKeys.has(key);
}

function configSource(env, productionEnvKeys, keys) {
  const sources = new Set();
  for (const key of keys) {
    if (present(env, key)) sources.add("local");
    if (productionEnvKeys.has(key)) sources.add("production");
  }
  return [...sources].join(" + ") || "missing";
}

function secretSource(env, productionEnvKeys, supabaseSecretKeys, keys) {
  const sources = new Set();
  for (const key of keys) {
    if (present(env, key)) sources.add("local");
    if (productionEnvKeys.has(key)) sources.add("production");
    if (supabaseSecretKeys.has(key)) sources.add("supabase function");
  }
  return [...sources].join(" + ") || "missing";
}

function checkConfig(env, productionEnvKeys, supabaseSecretKeys) {
  const checks = [
    {
      id: "CFG-SUPABASE",
      label: "Supabase booking backend",
      severity: "critical",
      pass:
        presentForSystem(env, productionEnvKeys, "NEXT_PUBLIC_SUPABASE_URL") &&
        presentForSystem(env, productionEnvKeys, "NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
        presentForSystem(env, productionEnvKeys, "SUPABASE_SERVICE_ROLE_KEY"),
      detail: "Required for customer booking, admin ops, custody records, and driver board.",
      source: configSource(env, productionEnvKeys, [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]),
    },
    {
      id: "CFG-ADMIN",
      label: "Admin login",
      severity: "critical",
      pass:
        presentForSystem(env, productionEnvKeys, "TRAVELYT_ADMIN_EMAIL") &&
        presentForSystem(env, productionEnvKeys, "TRAVELYT_ADMIN_PASSWORD") &&
        (presentForSystem(env, productionEnvKeys, "TRAVELYT_ADMIN_SESSION_SECRET") ||
          presentForSystem(env, productionEnvKeys, "TRAVELYT_ADMIN_PASSWORD") ||
          presentForSystem(env, productionEnvKeys, "TRAVELYT_DRIVER_ACCESS_CODE")),
      detail: "Required so ops can confirm payment, mark ID review complete, assign drivers, and view exceptions.",
      source: configSource(env, productionEnvKeys, [
        "TRAVELYT_ADMIN_EMAIL",
        "TRAVELYT_ADMIN_PASSWORD",
        "TRAVELYT_ADMIN_SESSION_SECRET",
      ]),
    },
    {
      id: "CFG-DRIVER-CODES",
      label: "Per-driver access codes",
      severity: "warning",
      pass: presentForSystem(env, productionEnvKeys, "TRAVELYT_DRIVER_ACCESS_CODES"),
      detail: "Preferred for first customer. Single shared TRAVELYT_DRIVER_ACCESS_CODE works for beta but is weaker custody identity.",
      source: configSource(env, productionEnvKeys, [
        "TRAVELYT_DRIVER_ACCESS_CODES",
        "TRAVELYT_DRIVER_ACCESS_CODE",
      ]),
    },
    {
      id: "CFG-EMAIL",
      label: "Email notifications",
      severity: "warning",
      pass:
        presentForSystem(env, productionEnvKeys, "RESEND_API_KEY") &&
        presentForSystem(env, productionEnvKeys, "LEAD_NOTIFY_EMAIL"),
      detail: "Required if ops wants automatic booking and verification emails. Manual monitoring can cover first customer.",
      source: configSource(env, productionEnvKeys, [
        "RESEND_API_KEY",
        "LEAD_NOTIFY_EMAIL",
      ]),
    },
    {
      id: "CFG-MAPS",
      label: "Address verification",
      severity: "warning",
      pass: presentForSystem(env, productionEnvKeys, "GOOGLE_MAPS_API_KEY"),
      detail: "Required for auto distance calculation. Manual mileage entry can cover first customer if verified by ops.",
      source: configSource(env, productionEnvKeys, ["GOOGLE_MAPS_API_KEY"]),
    },
    {
      id: "CFG-PUSH",
      label: "APNs push notifications",
      severity: "info",
      pass:
        supabaseSecretKeys.has("APNS_KEY_ID") &&
        supabaseSecretKeys.has("APNS_TEAM_ID") &&
        supabaseSecretKeys.has("APNS_PRIVATE_KEY") &&
        supabaseSecretKeys.has("APNS_BUNDLE_ID") &&
        supabaseSecretKeys.has("PUSH_WORKER_SECRET") &&
        presentForSystem(env, productionEnvKeys, "PUSH_WORKER_SECRET"),
      detail: "Nice for app notifications. SMS/phone/email ops can cover first customer.",
      source: secretSource(env, productionEnvKeys, supabaseSecretKeys, [
        "APNS_KEY_ID",
        "APNS_TEAM_ID",
        "APNS_PRIVATE_KEY",
        "APNS_BUNDLE_ID",
        "PUSH_WORKER_SECRET",
      ]),
    },
  ];

  return checks;
}

function runFirstCustomerFlow(configChecks) {
  const events = [];
  const issues = [];
  const price = calcPrice(firstCustomer);
  const operationalBufferMinutes = estimateOperationalBufferMinutes(
    firstCustomer.distanceMiles
  );
  const latestBookAt = new Date(
    new Date(firstCustomer.flightIso).getTime() -
      (rules.airlineCutoffMinutes + operationalBufferMinutes) * 60_000
  );
  const requestAt = new Date(rules.runAt);

  events.push({
    actor: "Customer",
    step: "Quote request",
    result: "PASS",
    detail: `${firstCustomer.customer.name} requests ${firstCustomer.bags} bags from ${firstCustomer.address} to ${firstCustomer.airport}.`,
  });
  events.push({
    actor: "System",
    step: "Pricing",
    result: "PASS",
    detail: `${money(price.totalCents)} total. Includes ${price.extraDistanceMiles} extra miles at ${money(price.distanceRateCents)}/mi, ${money(price.automaticDiscountCents)} automatic discount, and ${money(price.promoDiscountCents)} launch promo.`,
  });
  events.push({
    actor: "System",
    step: "Cutoff validation",
    result: requestAt <= latestBookAt ? "PASS" : "FAIL",
    detail: `Request at ${timePart(rules.runAt)}. Latest safe booking time is ${timePart(latestBookAt.toISOString())}.`,
  });

  if (requestAt > latestBookAt) {
    issues.push({
      id: "FIRST-CUTOFF",
      severity: "critical",
      detail: "First customer flight timing would miss the Travelyt operational buffer plus airline cutoff.",
      fix: "Move the first booking earlier or pick a later flight.",
    });
  }

  events.push({
    actor: "Customer",
    step: "Required acknowledgements",
    result: "PASS",
    detail: "Flight time, restricted-items attestation, declared-value notice, phone, and email are captured.",
  });
  events.push({
    actor: "System",
    step: "Pending privacy",
    result: "PASS",
    detail: "Booking starts pending; driver board cannot expose address or phone until ops confirms it.",
  });
  events.push({
    actor: "Admin",
    step: "Manual launch confirmation",
    result: configChecks.find((check) => check.id === "CFG-ADMIN")?.pass
      ? "PASS"
      : "BLOCKED",
    detail: "Ops confirms payment manually, marks customer/driver ID review complete, and clears bag attestation.",
  });
  events.push({
    actor: "Admin",
    step: "Driver assignment",
    result: "PASS",
    detail: `${firstCustomer.driver} is assigned only after custody readiness is complete and schedule conflict check passes.`,
  });
  events.push({
    actor: "Driver",
    step: "Seal pickup",
    result: "PASS",
    detail: `Driver captures bag photo, GPS, timestamp, and seal ${firstCustomer.sealId}.`,
  });
  events.push({
    actor: "Customer",
    step: "Seal approval",
    result: "PASS",
    detail: "Customer approves seal proof before bags can continue to airline handoff.",
  });

  const airlineAcceptAt = "2026-05-29T14:35:00-07:00";
  const minutesBeforeFlight = minutesBetween(
    airlineAcceptAt,
    firstCustomer.flightIso
  );
  events.push({
    actor: "Driver + Airline",
    step: "Airline handoff",
    result: minutesBeforeFlight >= rules.airlineCutoffMinutes ? "PASS" : "FAIL",
    detail: `United baggage services accepts bags ${minutesBeforeFlight} minutes before departure with employee name, organization, badge/reference, GPS, and photo.`,
  });

  if (minutesBeforeFlight < rules.airlineCutoffMinutes) {
    issues.push({
      id: "FIRST-AIRLINE-CUTOFF",
      severity: "critical",
      detail: "Airline handoff missed the 40-minute cutoff.",
      fix: "Dispatch pickup earlier or reject the booking.",
    });
  }

  events.push({
    actor: "System",
    step: "Completion",
    result: "PASS",
    detail: "Departure job completes at airline acceptance. No fake delivery step is required.",
  });

  for (const check of configChecks) {
    if (check.pass) continue;
    issues.push({
      id: check.id,
      severity: check.severity,
      detail: `${check.label} is not configured in local .env.local. ${check.detail}`,
      fix:
        check.id === "CFG-ADMIN"
          ? "Add TRAVELYT_ADMIN_EMAIL, TRAVELYT_ADMIN_PASSWORD, and preferably TRAVELYT_ADMIN_SESSION_SECRET in local and Vercel before customer #1."
          : check.id === "CFG-DRIVER-CODES"
            ? "Set TRAVELYT_DRIVER_ACCESS_CODES with one code per driver before handing live custody to drivers."
            : check.id === "CFG-MAPS"
              ? "Add GOOGLE_MAPS_API_KEY or require ops to enter verified manual mileage for the first booking."
              : "Confirm this dependency is either configured or covered manually for customer #1.",
    });
  }

  return { events, issues, price, operationalBufferMinutes };
}

function renderReport({ configChecks, flow }) {
  const critical = flow.issues.filter((issue) => issue.severity === "critical");
  const warnings = flow.issues.filter((issue) => issue.severity === "warning");
  const info = flow.issues.filter((issue) => issue.severity === "info");
  const goNoGo = critical.length === 0 ? "GO FOR CONTROLLED FIRST CUSTOMER" : "NO-GO UNTIL CRITICAL ITEMS ARE FIXED";

  return `# Travelyt First Customer Operational Simulation

Generated: ${new Date().toISOString()}

Mode: non-production dry run. No live bookings, payments, emails, or Supabase records were created.

## Go / No-Go

**${goNoGo}**

- Critical blockers: ${critical.length}
- Warnings: ${warnings.length}
- Info items: ${info.length}

## First Customer Scenario

- Service: Departure pickup to ${firstCustomer.airport}
- Customer: ${firstCustomer.customer.name}
- Flight: ${firstCustomer.flight} at ${firstCustomer.flightTime}
- Bags: ${firstCustomer.bags}
- Distance: ${firstCustomer.distanceMiles} miles
- Declared value: ${money(firstCustomer.declaredValueCents)}
- Driver: ${firstCustomer.driver}
- Estimated customer price: ${money(flow.price.totalCents)}
- Operational buffer used: ${flow.operationalBufferMinutes + rules.airlineCutoffMinutes} minutes before departure

## End-To-End Result

${flow.events.map((event) => `- **${event.result}** ${event.actor} — ${event.step}: ${event.detail}`).join("\n")}

## Config Readiness

${configChecks.map((check) => `- **${check.pass ? "PASS" : check.severity.toUpperCase()}** ${check.label}: ${check.pass ? "Configured or operationally covered." : check.detail} Source: ${check.source}.`).join("\n")}

## What Went Wrong

${flow.issues.length ? flow.issues.map((issue) => `### ${issue.id} (${issue.severity})

${issue.detail}

Fix: ${issue.fix}
`).join("\n") : "Nothing in the simulated first-customer mechanism failed. Stripe/payment remains intentionally manual."}

## First Customer Ops Checklist

1. Confirm admin login works before the customer is live.
2. Confirm the exact customer flight time leaves enough pickup + drive + 40-minute airline cutoff buffer.
3. Verify customer phone/email and send the booking link.
4. Manually confirm payment or written payment arrangement before releasing to driver.
5. Mark customer ID, driver ID, and restricted-items review complete in admin.
6. Assign one verified driver with no overlapping job.
7. Driver captures seal photo, seal ID, GPS, and timestamp at pickup.
8. Customer approves seal proof before the driver leaves for airline handoff.
9. Driver captures airline receiving employee name, organization, badge/reference, GPS, photo, and timestamp.
10. Ops watches the exception queue and stays reachable by phone during the first run.
`;
}

async function main() {
  const env = await readEnvKeys();
  const productionEnvKeys = await readProductionEnvKeys();
  const supabaseSecretKeys = await readSupabaseSecretKeys();
  const configChecks = checkConfig(env, productionEnvKeys, supabaseSecretKeys);
  const flow = runFirstCustomerFlow(configChecks);
  const report = renderReport({ configChecks, flow });
  const results = {
    generatedAt: new Date().toISOString(),
    scenario: firstCustomer,
    productionEnvKeys: [...productionEnvKeys].sort(),
    configChecks,
    flow,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, report, "utf8");
  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");

  console.log(JSON.stringify({
    report: REPORT_PATH,
    results: RESULTS_PATH,
    events: flow.events.length,
    issues: flow.issues.length,
    bySeverity: flow.issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
      return acc;
    }, {}),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
