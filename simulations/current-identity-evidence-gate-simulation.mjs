#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const [
  migration,
  eligibilityRoute,
  eligibilityLibrary,
  checkoutRoute,
  paymentReconciliation,
  identityRoute,
  stripeIdentity,
  operationalMode,
  payPage,
  trackingPage,
  driverPage,
  rjRoute,
  identityRetention,
  bookingsRoute,
  travelerIdentityRoute,
  identityOriginals,
] = await Promise.all([
  read("supabase/migrations/048_current_identity_evidence_gate.sql"),
  read("src/app/api/ops/pilot-eligibility/route.ts"),
  read("src/lib/pilot-eligibility.ts"),
  read("src/app/api/stripe/checkout/route.ts"),
  read("src/lib/stripe-payments.ts"),
  read("src/app/api/identity/verification-request/route.ts"),
  read("src/lib/stripe-identity.ts"),
  read("src/lib/operational-mode.ts"),
  read("src/app/booking/[id]/pay/page.tsx"),
  read("src/app/booking/[id]/page.tsx"),
  read("src/app/driver/job/[id]/page.tsx"),
  read("src/app/api/partner-integrations/royal-jordanian/check-in/route.ts"),
  read("src/lib/identity-retention.ts"),
  read("src/app/api/bookings/route.ts"),
  read("src/app/api/identity/traveler-verification/route.ts"),
  read("src/lib/identity-originals.ts"),
]);

let checks = 0;
function matches(value, pattern, message) {
  assert.match(value, pattern, message);
  checks += 1;
}
function notMatches(value, pattern, message) {
  assert.doesNotMatch(value, pattern, message);
  checks += 1;
}
function truthy(value, message) {
  assert.ok(value, message);
  checks += 1;
}

matches(migration, /identity_verifications_verified_at_status_check/, "Verified timestamps must agree with status.");
matches(migration, /identity_verification_is_current_complete_for_mode/, "Identity completeness must be mode-aware.");
matches(migration, /p_operational_mode in \('rehearsal', 'live'\)/, "Only classified modes can pass identity.");
matches(migration, /case when p_operational_mode = 'live' then 'true' else 'false' end/, "Stripe Identity livemode must exactly match booking mode.");
matches(migration, /identity-biometric-v1-2026-08-15/, "Signed identity consent version is required.");
matches(migration, /government_id_images/, "ID image consent scope is required.");
matches(migration, /selfie_or_liveness_capture/, "Selfie or liveness consent scope is required.");
matches(migration, /authorized_relevant_carrier/, "Limited carrier disclosure scope is required.");
matches(migration, /raw_retention_until > now\(\)/, "Current retained originals are required.");
matches(migration, /raw_document_paths[\s\S]*document[\s\S]*selfie/, "Document and selfie originals are required.");
matches(migration, /booking_has_current_identity_for_mode/, "Authoritative booking identity gate is required.");
matches(migration, /verification_invite_otp_verified_at <= now\(\)/, "Independent adult invite OTP must be verified.");
matches(migration, /nullif\(btrim\(coalesce\(v_passenger->>'email', ''\)\), ''\) is not null/, "Independent adult manifest email cannot be blank.");
matches(migration, /nullif\(btrim\(coalesce\(identity\.email, ''\)\), ''\) is not null/, "Independent adult identity email cannot be blank.");
matches(migration, /identity_age_at_date/, "Age must be evaluated on the travel date.");
matches(migration, /v_account_holder->>'relationship' is distinct from 'self'/, "Account holder must be self.");
matches(migration, /< 18/, "Account holder and independent adults must be adults.");
truthy((migration.match(/limit 1\s+for share;/g) ?? []).length >= 2, "Exact account and passenger identity rows must be share-locked.");

matches(migration, /operational_mode text generated always as/, "Booking mode must be server-derived and canonical.");
matches(migration, /bookings_operational_mode_immutable/, "Booking mode must be immutable after classification.");
matches(migration, /legacyContinuationBlocked[\s\S]*Pre-048 paid history retained/, "Active paid legacy history must be explicitly expired without being relabeled or deleted.");
matches(migration, /classify_pending_booking_operational_mode/, "Legacy pending bookings need one controlled pre-identity classification path.");
matches(bookingsRoute, /pilotEligibilitySnapshot = \{[\s\S]*operationalMode: configuredOperationalMode\(\)/, "New bookings must snapshot the server operating mode at creation.");
matches(identityRoute, /operational_mode: bookingMode[\s\S]*stripe_livemode: bookingStripeLivemode/, "Grouped adult invites must snapshot the booking provider mode.");
matches(travelerIdentityRoute, /data\.metadata\?\.operational_mode !== bookingMode/, "Adult consent must revalidate invite mode against the booking.");
matches(travelerIdentityRoute, /configuredOperationalMode\(\) !== bookingMode/, "Adult identity launch must honor the active-mode kill switch.");
matches(migration, /operational_mode is not null\s+and operational_mode in \('rehearsal', 'live'\)/, "Active checkout rows must have a non-null mode.");
matches(migration, /booking_checkout_sessions_active_state_shape_check/, "Checkout state evidence must have a DB shape constraint.");
matches(migration, /status = 'paid'[\s\S]*captured_at is not null[\s\S]*captured_at >= capture_authorized_at/, "Paid checkout evidence must prove capture.");
matches(migration, /v_operational_mode is null\s+or v_operational_mode not in \('rehearsal', 'live'\)/, "Legacy null mode must fail closed for custody and assignments.");
notMatches(migration, /if v_operational_mode not in \('rehearsal', 'live'\) then/, "Unsafe SQL NULL classification checks must not remain.");
matches(migration, /driver_identity_matches_operational_mode[\s\S]*p_operational_mode in \('rehearsal', 'live'\)/, "Driver identity must fail closed for invalid modes.");
matches(migration, /new\.event_type in \('carrier_transfer', 'recipient_delivery'\)/, "Rehearsal must block real terminal custody outcomes.");
matches(migration, /revoke all on table public\.bookings from public, anon, authenticated/, "Booking direct DML must be revoked.");
matches(migration, /revoke insert, update, delete, truncate on public\.booking_agent_assignments from service_role/, "Assignment mutation and truncation must be revoked.");
matches(migration, /revoke insert, update, delete, truncate on public\.custody_checkpoints from service_role/, "Custody mutation and truncation must be revoked.");
matches(migration, /enforce_assignment_account_deletion_claim[\s\S]*from public\.bookings booking[\s\S]*for update;[\s\S]*pg_advisory_xact_lock/, "Assignment and account deletion must share booking-first lock order.");
matches(migration, /current_setting\('travelyt\.account_deletion_finalize', true\) is distinct from 'on'/, "An unset account-deletion GUC must not bypass driver ownership guards.");
matches(migration, /current_setting\('travelyt\.provider_redaction_transition', true\) is distinct from 'on'/, "An unset provider-redaction GUC must not bypass protected transition guards.");
notMatches(migration, /current_setting\('[^']+', true\) <> 'on'/, "Unset custom GUCs must never weaken protected mutation guards through SQL NULL semantics.");

matches(migration, /claim_booking_checkout_session[\s\S]*for update/, "Checkout claim must lock the booking.");
matches(migration, /finalize_booking_checkout_session/, "Checkout URL exposure must be atomically finalized.");
matches(migration, /authorize_booking_payment_capture/, "Payment capture must be authorized in the DB.");
matches(migration, /finalize_booking_payment_capture/, "Captured payment must be atomically finalized.");
matches(migration, /v_booking\.status <> 'pending'[\s\S]*v_booking\.pilot_eligibility_status <> 'approved'[\s\S]*pilot_eligibility_expires_at <= clock_timestamp\(\)/, "Capture finalization must recheck booking and approval state.");
matches(migration, /new\.paid_at is null[\s\S]*new\.pilot_eligibility_status <> 'approved'/, "Paid activation must require an activation timestamp and current approval.");
matches(migration, /checkout\.captured_at is not null[\s\S]*checkout\.captured_at >= checkout\.capture_authorized_at/, "Paid booking trigger must require durable capture evidence.");

matches(operationalMode, /TRAVELYT_LIVE_OPERATIONS_ENABLED/, "Operating mode must be controlled by a server-only switch.");
matches(eligibilityRoute, /configuredOperationalMode/, "Admin approval must assign the server-controlled mode.");
matches(eligibilityRoute, /booking_has_current_identity_for_mode/, "Admin approval must use mode-aware identity evidence.");
matches(eligibilityLibrary, /identityEvidenceCurrent\?: boolean/, "Eligibility must carry the authoritative evidence result.");

matches(checkoutRoute, /configuredMode !== booking\.operationalMode/, "Checkout must honor the active-mode kill switch.");
matches(checkoutRoute, /booking_has_current_identity/, "Checkout must revalidate authoritative identity.");
matches(checkoutRoute, /capture_method: "manual"/, "Stripe must authorize before Travelyt captures.");
matches(checkoutRoute, /finalize_booking_checkout_session/, "Checkout URL must not escape before DB finalization.");
matches(checkoutRoute, /noPaymentDue: true/, "Zero-dollar activation must not be labeled as payment.");
truthy(checkoutRoute.indexOf("booking.priceCents <= 0") < checkoutRoute.indexOf("const stripe = getStripe()"), "Zero-dollar activation must not depend on Stripe configuration.");
truthy(checkoutRoute.indexOf("booking_has_current_identity") < checkoutRoute.indexOf("stripe.checkout.sessions.create"), "Identity must pass before Stripe Checkout creation.");

matches(paymentReconciliation, /configuredOperationalMode/, "Capture must honor the active-mode kill switch.");
matches(paymentReconciliation, /exactPaidReplay/, "Exact paid webhook replays must remain idempotent.");
truthy(paymentReconciliation.indexOf("exactPaidReplay") < paymentReconciliation.indexOf("const configuredMode"), "Paid replay recognition must happen before pause handling.");
matches(paymentReconciliation, /authorize_booking_payment_capture/, "Capture authorization RPC is required.");
matches(paymentReconciliation, /paymentIntents\.capture/, "Only the controlled manual-capture path may capture.");
matches(paymentReconciliation, /finalize_booking_payment_capture/, "Captured payment needs atomic finalization.");
matches(paymentReconciliation, /paymentFinalized = Boolean\([\s\S]*bookingReadback\.data\?\.paid_at[\s\S]*checkoutReadback\.data\?\.status === "paid"[\s\S]*stripe_payment_intent_id === capturedIntent\.id/, "An ambiguous DB response must be read back before compensation.");
matches(paymentReconciliation, /if \(!paymentFinalized\) \{[\s\S]*status: "manual_review"[\s\S]*claim_token: null[\s\S]*claimed_at: null[\s\S]*last_error: finalizationFailureReason[\s\S]*\.eq\("booking_id", bookingId\)[\s\S]*\.eq\("stripe_checkout_session_id", session\.id\)[\s\S]*\.eq\("stripe_payment_intent_id", capturedIntent\.id\)[\s\S]*\.eq\("status", "capture_authorized"\)/, "Unconfirmed capture finalization must CAS the exact authorized checkout into manual review.");
matches(paymentReconciliation, /capturedAt = new Date\(\)\.toISOString\(\)[\s\S]*captured_at: capturedAt[\s\S]*idempotency_key: `capture-finalization:\$\{capturedIntent\.id\}`[\s\S]*status: "manual_review"/, "Unconfirmed finalization must retain captured-payment evidence and an idempotent review event.");
matches(paymentReconciliation, /capture-finalization-refund:\$\{input\.paymentIntent\.id\}[\s\S]*refunds\.create[\s\S]*idempotencyKey/, "An unconfirmed captured payment must use an idempotent compensating refund.");
matches(paymentReconciliation, /capture-finalization-refund-pending/, "Ambiguous refund outcomes must remain retryable manual review.");
matches(paymentReconciliation, /legacy-automatic-capture/, "Legacy automatic capture must enter manual review.");
matches(paymentReconciliation, /identity-invalid-at-payment/, "Invalid identity at payment must fail closed.");

matches(identityRoute, /identity_verification_is_current_complete_for_mode/, "Profile verified status must be completeness-checked.");
matches(identityRoute, /forcedRetryIdentityId/, "Stale verified evidence must force a fresh provider session.");
matches(identityRoute, /provider_verified_archive_incomplete/, "Archive failure must allow a fresh verification attempt.");
matches(identityRoute, /stripe_livemode: expectedLivemode/, "New identity requests must snapshot expected provider mode.");
matches(stripeIdentity, /getStripeForLivemode\(input\.stripeLivemode\)/, "Identity launch must select a mode-matched Stripe client.");
matches(stripeIdentity, /session\.livemode !== stripeLivemode/, "Created Identity sessions must be mode-verified.");
matches(stripeIdentity, /missing its protected provider mode/, "Identity provider launch must never infer a missing mode from current environment state.");
matches(migration, /provider_session_creation_started_at/, "Provider creation needs an immutable first-attempt clock.");
matches(migration, /clock_timestamp\(\) - interval '23 hours'/, "Outcome-unknown provider creation retries must stop before idempotency retention can expire.");
matches(migration, /provider_session_creation_reconciliation_required_at/, "Expired ambiguous provider attempts must enter manual reconciliation.");
matches(migration, /claim_incomplete_identity_archive_cleanup/, "Incomplete archive cleanup must obtain a database destruction decision.");
truthy(identityOriginals.indexOf("claim_incomplete_identity_archive_cleanup") < identityOriginals.indexOf(".remove(objectPaths)"), "Incomplete archive objects cannot be removed before the protected DB claim.");
matches(migration, /if v_identity\.raw_legal_hold_at is not null[\s\S]*return 'held'/, "A legal hold racing an archive cleanup must retain the originals.");
matches(migration, /create or replace function public\.claim_identity_original_destruction[\s\S]*set status = 'manual_review',[\s\S]*verified_at = null,[\s\S]*raw_purpose_ended_at = coalesce/, "Identity must become non-current before original destruction.");
truthy(identityRetention.indexOf("claim_identity_original_destruction") < identityRetention.indexOf(".remove(deletionPaths)"), "Evidence must be atomically claimed and invalidated before storage deletion.");
matches(identityRetention, /claimed\.raw_document_paths/, "Destruction must use the post-claim path set, not a stale queue snapshot.");
matches(migration, /create or replace function public\.finalize_identity_original_destruction[\s\S]*raw_deletion_claim_token is distinct from p_claim_token[\s\S]*raw_document_paths = '\[\]'::jsonb/, "Destruction receipts must CAS the exact database claim token before clearing evidence paths.");

for (const [surface, source] of [["pay", payPage], ["tracking", trackingPage], ["driver", driverPage]]) {
  matches(source, /Test rehearsal|TEST REHEARSAL/i, `${surface} surface must visibly label rehearsals.`);
}
matches(payPage, /booking\.operationalMode === "rehearsal"/, "Rehearsal payment analytics must be excluded.");
matches(payPage, /No payment due/, "Zero-dollar confirmation must not claim payment.");
matches(payPage, /No payment was confirmed/, "Terminal unpaid bookings must not claim payment.");

matches(rjRoute, /booking_has_current_identity_for_mode/, "RJ boundary must revalidate the whole traveler group.");
matches(rjRoute, /identity_verification_is_current_complete_for_mode/, "RJ identity references must each be current.");
matches(rjRoute, /readiness\.mode !== expectedIntegrationMode/, "RJ sandbox and production must match booking mode.");
matches(rjRoute, /!booking\.paid_at/, "RJ check-in must require a paid active booking.");
matches(rjRoute, /pilot_eligibility_status !== "approved"/, "RJ check-in must require current pilot approval.");

console.log(JSON.stringify({
  verdict: "PASS",
  checks,
  rule: "Rehearsal and live identity, payment, assignment, custody, and airline-integration evidence remain mode-bound and fail closed.",
}, null, 2));
