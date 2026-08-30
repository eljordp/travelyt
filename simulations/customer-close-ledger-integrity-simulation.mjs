import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bookingRoute = await readFile(
  new URL("../src/app/api/bookings/route.ts", import.meta.url),
  "utf8"
);
const custodyMigration = await readFile(
  new URL("../supabase/migrations/041_atomic_custody_checkpoints.sql", import.meta.url),
  "utf8"
);

const closeCheckpointIndex = bookingRoute.indexOf(
  "const checkpoint = await recordCustodyCheckpoint"
);
const bookingUpdateIndex = bookingRoute.indexOf(
  '.from("bookings")\n      .update(rowPatch)'
);
const closedReloadIndex = bookingRoute.indexOf(
  '.eq("status", "closed")\n        .maybeSingle<BookingRow>()'
);

const checks = [
  [
    bookingRoute.includes('import { recordCustodyCheckpoint } from "@/lib/custody"'),
    "booking close uses the atomic booking-wide custody helper",
  ],
  [
    !bookingRoute.includes("appendCustodyEvent") &&
      !bookingRoute.includes("getBagsForBooking"),
    "booking close no longer appends bag events one at a time",
  ],
  [
    closeCheckpointIndex >= 0 &&
      closedReloadIndex > closeCheckpointIndex &&
      bookingUpdateIndex > closedReloadIndex,
    "close returns from the atomic checkpoint path before the generic booking PATCH",
  ],
  [
    custodyMigration.includes("update public.bookings") &&
      custodyMigration.includes("when 'recipient_confirmed' then 'closed'") &&
      custodyMigration.includes("when 'operations_close_override' then 'closed'") &&
      custodyMigration.includes("where id = p_booking_id and status = v_booking.status"),
    "the custody transaction owns the expected-state booking close",
  ],
  [
    custodyMigration.includes("customer_signature_name = case") &&
      custodyMigration.includes("when p_event_type = 'recipient_confirmed' then v_actor_name"),
    "traveler signature is written only inside recipient confirmation",
  ],
  [
    bookingRoute.includes("if (!checkpoint.ok)") &&
      bookingRoute.includes("Booking remains open."),
    "custody RPC failure blocks booking close",
  ],
  [
    bookingRoute.includes("expectedBagCount: Number(existing.bags)"),
    "close checkpoint requires the booking's complete bag count",
  ],
  [
    bookingRoute.includes("`booking:${id}:recipient-confirmed`") &&
      bookingRoute.includes("`booking:${id}:operations-close-override`"),
    "traveler close and operations override have distinct deterministic keys",
  ],
  [
    bookingRoute.includes('? "recipient_confirmed"') &&
      bookingRoute.includes(': "operations_close_override"'),
    "operations override never creates a recipient-confirmed event",
  ],
  [
    bookingRoute.includes('actorRole: travelerClosing ? "traveler" : "operations"'),
    "traveler confirmation and operations override use distinct ledger actors",
  ],
  [
    bookingRoute.includes(
      'verifiedMethod: travelerClosing ? "confirmation_code" : "manual_record"'
    ),
    "operations override never claims use of the traveler confirmation code",
  ],
  [
    bookingRoute.includes("OPERATIONS_CLOSE_OVERRIDE_LEDGER_FAILED") &&
      bookingRoute.includes(
        "the operations override was not durably recorded for every bag"
      ),
    "operations failure evidence is not mislabeled as traveler confirmation",
  ],
  [
    bookingRoute.includes("!existing.delivery_confirmation_code ||"),
    "a missing server-side confirmation code fails closed",
  ],
  [
    bookingRoute.includes("if (opsOverrideClosing && !reason)"),
    "operations closure requires a recorded override reason",
  ],
  [
    bookingRoute.includes(
      "Traveler-confirmation and close timestamps are server-recorded by the atomic custody close action."
    ) &&
      custodyMigration.includes(
        "when p_event_type = 'recipient_confirmed' then coalesce(customer_confirmed_at"
      ) &&
      custodyMigration.includes(
        "when p_event_type = 'recipient_confirmed' then v_actor_name"
      ),
    "operations override cannot populate traveler-confirmation fields",
  ],
  [
    !bookingRoute.includes("Customer receipt custody event failed"),
    "ledger failures are no longer caught and ignored after close",
  ],
  [
    bookingRoute.includes("function hasAllArrivalReleaseProofs") &&
      bookingRoute.includes("latestRequiredSealProofs(row).every"),
    "arrival release validates the latest required seal proof for every bag",
  ],
  [
    bookingRoute.includes(
      'existing.status !== "arrived" || !hasAllArrivalReleaseProofs(existing)'
    ),
    "arrival cannot enter transit until every bag has release-and-seal evidence",
  ],
  [
    bookingRoute.includes(
      "Every airport-release bag requires the releasing party name, organization, and badge/reference."
    ),
    "arrival seal uploads fail early without releasing-party evidence",
  ],
];

for (const [condition, label] of checks) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

console.log(`\nCustomer close ledger integrity: ${checks.length}/${checks.length} controls passed.`);
