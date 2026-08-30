#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [
  bookings,
  mappers,
  pricing,
  quote,
  bookingApi,
  checkout,
  rjCheckIn,
  backupOps,
  backupOpsServer,
  backupExporter,
  baselineMigration,
  separationMigration,
] = await Promise.all([
  read("../src/lib/bookings.ts"),
  read("../src/lib/booking-mappers.ts"),
  read("../src/lib/pricing.ts"),
  read("../src/app/quote/page.tsx"),
  read("../src/app/api/bookings/route.ts"),
  read("../src/app/api/stripe/checkout/route.ts"),
  read("../src/app/api/partner-integrations/royal-jordanian/check-in/route.ts"),
  read("../src/lib/backup-ops.ts"),
  read("../src/lib/backup-ops-server.ts"),
  read("../scripts/export-backup-ops-kit.mjs"),
  read("../supabase/migrations/001_bookings.sql"),
  read("../supabase/migrations/036_separate_booking_legs.sql"),
]);

const createBookingSource = bookings.slice(
  bookings.indexOf("export async function createBooking"),
  bookings.indexOf("export async function updateBooking"),
);
const runtimeServiceGuard = createBookingSource.indexOf(
  'runtimeService !== "departure" && runtimeService !== "arrival"',
);
const clientPricing = createBookingSource.indexOf("calcPriceBreakdown(");

const checks = [
  [
    bookings.includes('export type ServiceType = "departure" | "arrival";'),
    "active service type contains only one-leg services",
  ],
  [
    bookings.includes('export type LegacyServiceType = "both";'),
    "obsolete value is isolated as a legacy persistence type",
  ],
  [
    runtimeServiceGuard >= 0 &&
      clientPricing >= 0 &&
      runtimeServiceGuard < clientPricing &&
      createBookingSource.includes(
        'throw new Error("Book departure and arrival as separate custody legs.")',
      ),
    "client booking creation rejects an invalid runtime service before pricing or local fallback",
  ],
  [
    bookings.includes("Legacy Combined Booking - Split Required"),
    "legacy rows receive an explicit operator-facing label",
  ],
  [
    mappers.includes('const legacyService = row.service === "both"'),
    "database mapper flags historical combined rows",
  ],
  [
    !pricing.includes("both:"),
    "combined service has no active price",
  ],
  [
    !quote.includes('type ServiceType = "departure" | "arrival" | "both"'),
    "quote state cannot select a combined service",
  ],
  [
    bookingApi.includes("Book departure and arrival as separate custody legs."),
    "booking creation rejects a combined request",
  ],
  [
    bookingApi.includes("This legacy combined booking is read-only."),
    "legacy records cannot progress through custody",
  ],
  [
    checkout.includes('if (row.service === "both")'),
    "Stripe checkout blocks legacy combined records",
  ],
  [
    rjCheckIn.includes('booking.service !== "departure"'),
    "RJ integration accepts departure bookings only",
  ],
  [
    backupOps.includes('booking.legacyService === "both"') &&
      backupOps.includes("Do not operate this legacy combined record"),
    "Backup Ops renders legacy combined rows as manual-resolution records",
  ],
  [
    backupOpsServer.includes('existing.service === "both"') &&
      backupOpsServer.includes('input.status === "issue"') &&
      backupOpsServer.includes('input.status === "cancelled"') &&
      backupOpsServer.includes("investigationNote") &&
      backupOpsServer.includes("administrativeResolution") &&
      backupOpsServer.includes("!investigationNote && !administrativeResolution") &&
      backupOpsServer.includes("!input.sealId?.trim()"),
    "Backup Ops permits only investigation, issue, or cancellation handling for legacy combined rows",
  ],
  [
    backupExporter.includes('both: "Legacy Combined Booking - Split Required"') &&
      backupExporter.includes('booking.service === "both"') &&
      backupExporter.includes("Do not operate this legacy combined record"),
    "static Backup Ops exports warn against operating legacy combined rows",
  ],
  [
    baselineMigration.includes("service in ('departure', 'arrival')"),
    "fresh databases accept only separate legs",
  ],
  [
    separationMigration.includes("reject_combined_booking_service"),
    "existing databases reject new or reassigned combined services",
  ],
  [
    separationMigration.includes("Historical `both` rows") &&
      separationMigration.includes("old.service is distinct from new.service"),
    "migration preserves historical rows for administrative resolution",
  ],
];

for (const [condition, label] of checks) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

console.log(`\n${checks.length}/${checks.length} separate-booking-leg checks passed.`);
