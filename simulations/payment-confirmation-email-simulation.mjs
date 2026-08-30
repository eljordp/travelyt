#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPaymentConfirmationEmail } from "../src/lib/payment-confirmation-copy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [paymentSource, emailSource, webhookSource, confirmationSource, checkoutSource, payPageSource, retrySource, migration, checkoutMigration, vercelSource] = await Promise.all([
  readFile(path.join(root, "src/lib/stripe-payments.ts"), "utf8"),
  readFile(path.join(root, "src/lib/payment-confirmation-email.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/stripe/webhook/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/stripe/confirm-session/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/stripe/checkout/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/booking/[id]/pay/page.tsx"), "utf8"),
  readFile(path.join(root, "src/app/api/internal/payment-email-retry/route.ts"), "utf8"),
  readFile(path.join(root, "supabase/migrations/038_payment_confirmation_receipts.sql"), "utf8"),
  readFile(path.join(root, "supabase/migrations/039_single_active_checkout_session.sql"), "utf8"),
  readFile(path.join(root, "vercel.json"), "utf8"),
]);

const tests = [];
const test = (name, run) => tests.push({ name, run });

test("receipt contains the paid-booking facts and account link", () => {
  const email = buildPaymentConfirmationEmail({
    booking: {
      id: "TVT-RECEIPT",
      service: "departure",
      airport: "ORD",
      bags: 2,
      email: "customer@example.test",
    },
    amountCents: 8800,
    currency: "usd",
    livemode: false,
  }, "https://travelyt.us/");
  assert.match(email.subject, /TVT-RECEIPT/);
  for (const expected of [
    "Booking ID: TVT-RECEIPT",
    "Service: Departure Pickup",
    "Airport: ORD",
    "Bags: 2",
    "Amount paid: $88.00",
    "https://travelyt.us/profile",
    "TEST — no real charge",
    "Airline baggage fees are separate",
  ]) assert.match(email.text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("live receipt omits the sandbox warning", () => {
  const email = buildPaymentConfirmationEmail({
    booking: {
      id: "TVT-LIVE",
      service: "arrival",
      airport: "ORD",
      bags: 3,
      email: "customer@example.test",
    },
    amountCents: 5900,
    currency: "usd",
    livemode: true,
  }, "https://travelyt.us");
  assert.match(email.text, /Service: Arrival Delivery/);
  assert.match(email.text, /Amount paid: \$59\.00/);
  assert.doesNotMatch(email.text, /TEST — no real charge/);
});

test("receipt is called only after Stripe payment_status is paid", () => {
  assert.ok(
    paymentSource.indexOf('session.payment_status !== "paid"') <
      paymentSource.lastIndexOf("sendBookingPaymentConfirmation")
  );
  assert.match(emailSource, /input\.session\.payment_status !== "paid"/);
});

test("webhook and browser confirmation share one paid-session reconciler", () => {
  assert.match(webhookSource, /markBookingPaidFromCheckoutSession/);
  assert.match(confirmationSource, /markBookingPaidFromCheckoutSession/);
});

test("browser return reconciles the receipt even if webhook already marked paid", () => {
  assert.match(payPageSource, /checkoutState === "success" &&\s*checkoutSessionId/);
  assert.doesNotMatch(
    payPageSource,
    /checkoutState === "success" &&\s*checkoutSessionId &&\s*result\?\.status === "pending"/
  );
});

test("booking is marked paid only after amount and currency match", () => {
  assert.ok(
    paymentSource.indexOf("session.amount_total !== existing.price_cents") <
      paymentSource.indexOf(".update(patch)")
  );
  assert.match(paymentSource, /session\.currency\?\.toLowerCase\(\) !== expectedCurrency/);
  assert.match(paymentSource, /const paidAt = new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(paymentSource, /session\.created \* 1000/);
});

test("zero-dollar booking shortcut never enters the Stripe receipt flow", () => {
  const zeroDollarBranch = checkoutSource.slice(
    checkoutSource.indexOf("if (booking.priceCents <= 0)"),
    checkoutSource.indexOf("const siteUrl = getSiteUrl(request)")
  );
  assert.match(zeroDollarBranch, /booking\.priceCents <= 0/);
  assert.doesNotMatch(zeroDollarBranch, /markBookingPaidFromCheckoutSession/);
  assert.doesNotMatch(zeroDollarBranch, /sendBookingPaymentConfirmation/);
});

test("asynchronous Stripe success is reconciled too", () => {
  assert.match(webhookSource, /checkout\.session\.async_payment_succeeded/);
});

test("database keeps exactly one durable receipt state per booking", () => {
  assert.match(migration, /booking_id text primary key/);
  assert.match(migration, /stripe_checkout_session_id text not null unique/);
  assert.match(migration, /status in \('sending', 'sent', 'failed', 'not_configured'\)/);
});

test("failed and unconfigured sends can retry while sent receipts cannot", () => {
  assert.match(migration, /receipt\.status in \('failed', 'not_configured'\)/);
  assert.doesNotMatch(migration, /receipt\.status in \([^)]*'sent'/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(emailSource, /next_attempt_at/);
  assert.match(retrySource, /retryIsDue/);
  assert.match(retrySource, /CRON_SECRET/);
  assert.match(vercelSource, /\/api\/internal\/payment-email-retry/);
});

test("provider idempotency is stable across webhook and browser calls", () => {
  assert.match(emailSource, /idempotencyKey: `payment-confirmation:\$\{input\.booking\.id\}`/);
});

test("receipt claim is private and limited to service-role execution", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.booking_payment_receipts from anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

test("checkout creation has one atomic claim per booking", () => {
  assert.match(checkoutMigration, /booking_id text primary key/);
  assert.match(checkoutMigration, /claim_booking_checkout_session/);
  assert.match(checkoutMigration, /checkout\.status in \('expired', 'failed'\)/);
  assert.match(checkoutSource, /rpc\("claim_booking_checkout_session"/);
  assert.match(checkoutSource, /idempotencyKey: `travelyt-booking:/);
});

test("an existing open checkout is reused instead of duplicated", () => {
  assert.match(checkoutSource, /existingSession\.status === "open"/);
  assert.match(checkoutSource, /reused: true/);
  assert.match(checkoutSource, /checkout\.sessions\.retrieve/);
});

test("an unrecorded created checkout is expired fail closed", () => {
  assert.match(checkoutSource, /checkout\.sessions\.expire\(session\.id\)/);
  assert.match(checkoutSource, /Checkout claim could not be finalized/);
});

test("a different paid checkout becomes durable manual review", () => {
  assert.match(paymentSource, /checkout-session-mismatch/);
  assert.match(paymentSource, /duplicate-checkout:\$\{session\.id\}/);
  assert.match(paymentSource, /status: "manual_review"/);
  assert.match(confirmationSource, /flagged for manual review/);
});

const passed = [];
for (const { name, run } of tests) {
  try {
    await run();
    passed.push(name);
  } catch (error) {
    console.error(JSON.stringify({ verdict: "FAIL", passed: passed.length, failed: name }, null, 2));
    throw error;
  }
}

console.log(JSON.stringify({
  verdict: "PASS",
  checks: passed.length,
  rule: "A genuinely paid Stripe session produces at most one durable customer receipt, with retry after failed or unconfigured delivery.",
}, null, 2));
