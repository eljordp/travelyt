#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emailDeliveryReadiness,
  sendTransactionalEmail,
} from "../src/lib/transactional-email.ts";

const original = {
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.LEAD_FROM_EMAIL,
  fetch: globalThis.fetch,
};
const checks = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function check(name, run) {
  try {
    await run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

await check("missing provider configuration is reported honestly", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.LEAD_FROM_EMAIL;
  assert.deepEqual(emailDeliveryReadiness(), {
    provider: "resend",
    apiKeyConfigured: false,
    fromAddressConfigured: false,
  });
  assert.deepEqual(await sendTransactionalEmail({
    to: "test@example.com",
    subject: "Test",
    text: "Test",
  }), { status: "not_configured" });
});

await check("implicit sender fallback is rejected", async () => {
  process.env.RESEND_API_KEY = "re_test_placeholder";
  delete process.env.LEAD_FROM_EMAIL;
  assert.deepEqual(await sendTransactionalEmail({
    to: "test@example.com",
    subject: "Test",
    text: "Test",
  }), { status: "not_configured" });
});

await check("configured provider sends through one bounded adapter", async () => {
  process.env.RESEND_API_KEY = "re_test_placeholder";
  process.env.LEAD_FROM_EMAIL = "Travelyt <info@travelyt.us>";
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ id: "email_test_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const result = await sendTransactionalEmail({
    to: "first@example.com, second@example.com",
    subject: "Test",
    text: "Test body",
    replyTo: "reply@example.com",
    idempotencyKey: "booking-created:TVT-123",
  });
  assert.deepEqual(result, { status: "sent", providerMessageId: "email_test_123" });
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.headers["Idempotency-Key"], "booking-created:TVT-123");
  const body = JSON.parse(request.init.body);
  assert.deepEqual(body.to, ["first@example.com", "second@example.com"]);
  assert.equal(body.from, "Travelyt <info@travelyt.us>");
  assert.equal(body.reply_to, "reply@example.com");
});

await check("provider rejection remains a failed delivery", async () => {
  process.env.RESEND_API_KEY = "re_test_placeholder";
  process.env.LEAD_FROM_EMAIL = "Travelyt <info@travelyt.us>";
  globalThis.fetch = async () => new Response("rejected", { status: 422 });
  assert.deepEqual(await sendTransactionalEmail({
    to: "test@example.com",
    subject: "Test",
    text: "Test",
  }), { status: "failed", providerStatus: 422 });
});

await check("admin communications readiness requires durable current receipts", async () => {
  const source = await readFile(
    path.join(root, "src/app/api/admin/communications-readiness/route.ts"),
    "utf8"
  );
  assert.match(source, /from\("booking_payment_receipts"\)/);
  assert.match(source, /eq\("status", "sent"\)/);
  assert.match(source, /deliveryTested: Boolean\(latestPaymentEmailSentAt\)/);
  assert.match(source, /latestDeliveryTestedAt: latestPaymentEmailSentAt/);
  assert.match(source, /from\("phone_verification_receipts"\)/);
  assert.match(source, /phoneOtpProviderConfiguration\(/);
  assert.match(source, /\.eq\(\s*"provider_config_hash"/);
  assert.match(source, /phoneOtpEnabled\s*&&[\s\S]*phoneProviderConfiguration\.ok\s*&&[\s\S]*isCurrentPhoneDeliveryReceipt/);
  assert.match(source, /sms:[\s\S]*providerConfigurationBound:/);
  assert.match(source, /sms:[\s\S]*deliveryTested: smsDeliveryTested/);
  assert.match(source, /sms:[\s\S]*latestDeliveryTestedAt: latestPhoneVerifiedAt/);
  assert.doesNotMatch(source, /deliveryTested:\s*phoneOtpEnabled/);
  assert.doesNotMatch(source, /deliveryTested:\s*Boolean\(latestPhoneVerifiedAt\)/);
});

if (original.apiKey === undefined) delete process.env.RESEND_API_KEY;
else process.env.RESEND_API_KEY = original.apiKey;
if (original.from === undefined) delete process.env.LEAD_FROM_EMAIL;
else process.env.LEAD_FROM_EMAIL = original.from;
globalThis.fetch = original.fetch;

const failed = checks.filter((item) => !item.pass);
console.log(`Communications readiness: ${checks.length - failed.length}/${checks.length} passed`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
if (failed.length) process.exitCode = 1;
