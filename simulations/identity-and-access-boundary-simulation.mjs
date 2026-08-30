#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const [
  bookings, verificationReview, travelerVerification, originals, webhook,
  push, driverAccess, driverOnboarding, readiness, otpMigration, resendWebhook,
  resendWebhookVerifier,
] = await Promise.all([
  read("src/app/api/bookings/route.ts"),
  read("src/app/api/identity/verification-review/route.ts"),
  read("src/app/api/identity/traveler-verification/route.ts"),
  read("src/lib/identity-originals.ts"),
  read("src/app/api/stripe/webhook/route.ts"),
  read("src/app/api/push-tokens/route.ts"),
  read("src/lib/driver-access-server.ts"),
  read("src/app/api/driver-onboarding/route.ts"),
  read("src/app/api/ops/agent-readiness/route.ts"),
  read("supabase/migrations/046_durable_rate_limits_and_traveler_otp.sql"),
  read("src/app/api/webhooks/resend/route.ts"),
  read("src/lib/resend-webhook.ts"),
]);

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

check("Generic booking patches cannot stamp identity verified", () => {
  const genericFields = bookings.match(/const genericPatchFields[\s\S]*?\]\);/)?.[0] ?? "";
  assert.doesNotMatch(genericFields, /customerIdentityVerifiedAt|driverIdentityVerifiedAt/);
  assert.match(bookings, /validated\.driverIdentityVerifiedAt = undefined/);
  assert.match(bookings, /validated\.customerIdentityVerifiedAt = undefined/);
});

check("Operations can reject but cannot manually verify an adult identity", () => {
  assert.match(verificationReview, /action !== "reject"/);
  assert.doesNotMatch(verificationReview, /status:\s*"verified"/);
});

check("Independent adults use email OTP plus Stripe Identity", () => {
  assert.match(travelerVerification, /consume_traveler_verification_otp/);
  assert.match(travelerVerification, /createBoundStripeIdentitySession/);
  assert.match(travelerVerification, /provider:\s*STRIPE_IDENTITY_PROVIDER/);
});

check("Identity archive requires separate document and selfie originals", () => {
  assert.match(originals, /kind === "document"/);
  assert.match(originals, /kind === "selfie"/);
  assert.match(originals, /return hasDocument && hasSelfie/);
});

check("Stripe reconciliation binds subject name and uses current provider state", () => {
  assert.match(webhook, /expected_name_match/);
  assert.match(webhook, /session\.status === "verified"/);
  assert.match(webhook, /record\.status === "verified" && verdict\.status !== "verified"/);
});

check("Booking IDs, access tokens and confirmation codes are server owned", () => {
  assert.match(bookings, /randomBytes\(10\)/);
  assert.match(bookings, /randomBytes\(32\)/);
  assert.match(bookings, /randomInt\(100000, 1000000\)/);
});

check("Driver booking authorization uses access ID assignments, never display-name matching", () => {
  assert.doesNotMatch(bookings, /driverMatchesBooking|driverNameMatches/);
  assert.match(bookings, /primary_driver_access_id/);
  assert.match(bookings, /accepted_by_driver_access_id/);
});

check("Push registration derives the user and requires booking authority", () => {
  assert.match(push, /const user = await getRequestUser\(request\)/);
  assert.doesNotMatch(push, /body\.userId/);
  assert.match(push, /customer_access_token/);
});

check("Driver cookies are revalidated against active access and rotation version", () => {
  assert.match(driverAccess, /code_rotation_count === session\.driverSessionVersion/);
  assert.match(driverAccess, /current\.status === "active"/);
});

check("Only accepted onboarding evidence and training can complete readiness", () => {
  assert.match(driverOnboarding, /review_status === "accepted"/);
  assert.match(readiness, /eq\("review_status", "accepted"\)/);
  assert.match(
    readiness,
    /contains\("metadata", \{[\s\S]*driver_access_id: driverAccessId,[\s\S]*stripe_livemode: expectedLivemode,[\s\S]*\}\)/,
  );
  assert.match(readiness, /identity_verification_is_current_complete_for_mode/);
});

check("OTP attempts and public throttles are database-atomic", () => {
  assert.match(otpMigration, /for update/);
  assert.match(otpMigration, /consume_request_rate_limit/);
  assert.match(otpMigration, /consume_traveler_verification_otp/);
});

check("Email delivery evidence requires signed Resend webhooks", () => {
  assert.match(resendWebhook, /svix-signature/);
  assert.match(resendWebhookVerifier, /timingSafeEqual/);
  assert.match(resendWebhook, /record_resend_delivery_event/);
});

console.log(JSON.stringify({ ok: true, passed: checks.length, checks }, null, 2));
