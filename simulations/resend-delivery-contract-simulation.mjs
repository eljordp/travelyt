#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseResendDeliveryEvent,
  verifyResendWebhookSignature,
} from "../src/lib/resend-webhook.ts";
import { sendTransactionalEmail } from "../src/lib/transactional-email.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = {
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.LEAD_FROM_EMAIL,
  fetch: globalThis.fetch,
};
const checks = [];

async function check(name, run) {
  try {
    await run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

const key = Buffer.alloc(32, 11);
const secret = `whsec_${key.toString("base64")}`;
const nowMs = Date.parse("2026-08-30T12:00:00.000Z");
const timestamp = String(Math.floor(nowMs / 1000));
const messageId = "msg_webhook_delivery_001";
const payload = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-08-30T11:59:58.000Z",
  data: { email_id: "email_provider_123" },
});
const signature = createHmac("sha256", key)
  .update(`${messageId}.${timestamp}.${payload}`)
  .digest("base64");

await check("Resend API acceptance is not labeled sent or delivered", async () => {
  process.env.RESEND_API_KEY = "re_test_placeholder";
  process.env.LEAD_FROM_EMAIL = "Travelyt <info@travelyt.us>";
  globalThis.fetch = async () => new Response(
    JSON.stringify({ id: "email_provider_123" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
  assert.deepEqual(await sendTransactionalEmail({
    to: "traveler@example.test",
    subject: "Receipt",
    text: "Paid",
  }), { status: "accepted", providerMessageId: "email_provider_123" });
});

await check("only the current signed webhook parses as delivery evidence", () => {
  assert.equal(verifyResendWebhookSignature({
    payload,
    messageId,
    timestamp,
    signatures: `v1,${signature}`,
    secret,
    nowMs,
  }), true);
  assert.deepEqual(parseResendDeliveryEvent(payload), {
    ok: true,
    ignored: false,
    providerMessageId: "email_provider_123",
    eventCreatedAt: "2026-08-30T11:59:58.000Z",
    status: "delivered",
  });
  assert.equal(verifyResendWebhookSignature({
    payload: `${payload} `,
    messageId,
    timestamp,
    signatures: `v1,${signature}`,
    secret,
    nowMs,
  }), false);
  assert.equal(verifyResendWebhookSignature({
    payload,
    messageId,
    timestamp: String(Number(timestamp) - 301),
    signatures: `v1,${signature}`,
    secret,
    nowMs,
  }), false);
});

await check("malformed and incomplete signed payloads cannot become evidence", () => {
  assert.deepEqual(parseResendDeliveryEvent("{"), {
    ok: false,
    error: "Resend webhook payload is not valid JSON.",
  });
  assert.deepEqual(parseResendDeliveryEvent(JSON.stringify({
    type: "email.delivered",
    created_at: "not-a-date",
    data: {},
  })), {
    ok: false,
    error: "Resend webhook payload is incomplete.",
  });
  assert.deepEqual(parseResendDeliveryEvent(JSON.stringify({
    type: "email.opened",
    created_at: "2026-08-30T11:59:58.000Z",
    data: { email_id: "email_provider_123" },
  })), { ok: true, ignored: true });
});

await check("signed events are retained before receipt linking and replay safely", async () => {
  const migration = await readFile(
    path.join(root, "supabase/migrations/044_resend_delivery_evidence.sql"),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.resend_delivery_events/);
  assert.match(migration, /provider_event_id text primary key/);
  assert.match(migration, /on conflict \(provider_event_id\) do nothing/);
  assert.match(migration, /booking_payment_receipt_reconcile_resend_events/);
  assert.match(migration, /after insert or update of provider_message_id/);
  assert.match(migration, /'accepted', 'sent', 'delivered'/);
  assert.match(migration, /revoke all on public\.resend_delivery_events from public, anon, authenticated/);
});

await check("admin readiness requires recent delivered proof bound to current config", async () => {
  const readiness = await readFile(
    path.join(root, "src/app/api/admin/communications-readiness/route.ts"),
    "utf8",
  );
  assert.match(readiness, /eq\("status", "delivered"\)/);
  assert.match(readiness, /eq\("provider_config_hash"/);
  assert.match(readiness, /EMAIL_DELIVERY_PROOF_MAX_AGE_MS/);
  assert.doesNotMatch(readiness, /eq\("status", "accepted"\)/);
});

if (original.apiKey === undefined) delete process.env.RESEND_API_KEY;
else process.env.RESEND_API_KEY = original.apiKey;
if (original.from === undefined) delete process.env.LEAD_FROM_EMAIL;
else process.env.LEAD_FROM_EMAIL = original.from;
globalThis.fetch = original.fetch;

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
console.log(`Resend signed-delivery contract: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exitCode = 1;
