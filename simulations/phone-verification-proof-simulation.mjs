#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHONE_CONFIRMATION_RECEIPT_WINDOW_MS,
  PHONE_DELIVERY_PROOF_MAX_AGE_MS,
  buildPhoneVerificationProof,
  isCurrentPhoneDeliveryReceipt,
  phoneOtpProviderConfiguration,
} from "../src/lib/phone-verification-proof.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const now = new Date("2026-08-30T03:05:00.000Z");
const providerEnvironment = {
  NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://lltbwmjdkfjsqbroiuli.supabase.co",
  TRAVELYT_PHONE_OTP_PROVIDER: "twilio_verify",
  TRAVELYT_PHONE_OTP_PROVIDER_CONFIG_ID: "VA11111111111111111111111111111111",
};
const providerConfiguration = phoneOtpProviderConfiguration(
  providerEnvironment,
  "test-evidence-secret",
);
assert.equal(providerConfiguration.ok, true);
const providerConfigurationHash =
  providerConfiguration.value.provider_config_hash;

async function check(name, run) {
  try {
    await run();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

const user = {
  id: "7ebfd5d9-55fe-4a3c-99fa-7a4c3dfd2a19",
  phone: "+13125550123",
  phone_confirmed_at: "2026-08-30T03:00:00.000Z",
};

function buildProof(overrides = {}, options = {}) {
  return buildPhoneVerificationProof(
    { ...user, ...overrides },
    "test-evidence-secret",
    {
      providerConfigurationHash,
      now,
      ...options,
    },
  );
}

await check("fresh confirmed Supabase user creates minimal durable proof", () => {
  const result = buildProof();
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), [
    "phone_hash",
    "provider",
    "provider_config_hash",
    "recorded_at",
    "user_id",
    "verified_at",
  ]);
  assert.equal(result.value.user_id, user.id);
  assert.equal(result.value.provider, "supabase_auth");
  assert.equal(result.value.verified_at, user.phone_confirmed_at);
  assert.equal(result.value.recorded_at, now.toISOString());
  assert.equal(result.value.provider_config_hash, providerConfigurationHash);
  assert.match(result.value.phone_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result.value), /13125550123|VA111/);
});

await check("phone hash is keyed and deterministic", () => {
  const first = buildProof();
  const repeat = buildProof();
  const rotated = buildPhoneVerificationProof(user, "second-secret", {
    providerConfigurationHash,
    now,
  });
  assert.equal(first.ok && repeat.ok && rotated.ok, true);
  assert.equal(first.value.phone_hash, repeat.value.phone_hash);
  assert.notEqual(first.value.phone_hash, rotated.value.phone_hash);
});

await check("provider binding covers project, provider, identifier, and proof secret", () => {
  const repeat = phoneOtpProviderConfiguration(
    providerEnvironment,
    "test-evidence-secret",
  );
  const differentService = phoneOtpProviderConfiguration(
    {
      ...providerEnvironment,
      TRAVELYT_PHONE_OTP_PROVIDER_CONFIG_ID:
        "VA22222222222222222222222222222222",
    },
    "test-evidence-secret",
  );
  const differentProject = phoneOtpProviderConfiguration(
    {
      ...providerEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co",
    },
    "test-evidence-secret",
  );
  const rotatedSecret = phoneOtpProviderConfiguration(
    providerEnvironment,
    "rotated-evidence-secret",
  );
  assert.equal(
    repeat.ok && differentService.ok && differentProject.ok && rotatedSecret.ok,
    true,
  );
  assert.equal(
    repeat.value.provider_config_hash,
    providerConfigurationHash,
  );
  assert.notEqual(
    differentService.value.provider_config_hash,
    providerConfigurationHash,
  );
  assert.notEqual(
    differentProject.value.provider_config_hash,
    providerConfigurationHash,
  );
  assert.notEqual(
    rotatedSecret.value.provider_config_hash,
    providerConfigurationHash,
  );
});

await check("disabled application or incomplete provider binding fails closed", () => {
  assert.deepEqual(
    phoneOtpProviderConfiguration(
      {
        ...providerEnvironment,
        NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED: "false",
      },
      "secret",
    ),
    { ok: false, reason: "application_disabled" },
  );
  assert.deepEqual(
    phoneOtpProviderConfiguration(
      {
        ...providerEnvironment,
        TRAVELYT_PHONE_OTP_PROVIDER_CONFIG_ID: "",
      },
      "secret",
    ),
    { ok: false, reason: "provider_config_id_missing" },
  );
});

await check("historical phone_confirmed_at cannot be replayed into fresh proof", () => {
  const stale = buildProof({
    phone_confirmed_at: new Date(
      now.getTime() - PHONE_CONFIRMATION_RECEIPT_WINDOW_MS - 1,
    ).toISOString(),
  });
  assert.deepEqual(stale, { ok: false, reason: "confirmation_stale" });
});

await check("materially future phone confirmation is rejected", () => {
  const future = buildProof({
    phone_confirmed_at: new Date(now.getTime() + 61_000).toISOString(),
  });
  assert.deepEqual(future, { ok: false, reason: "confirmation_future" });
});

await check("unconfirmed phone cannot create readiness proof", () => {
  assert.deepEqual(buildProof({ phone_confirmed_at: null }), {
    ok: false,
    reason: "confirmation_missing",
  });
});

await check("malformed or non-E.164 phone is rejected", () => {
  assert.deepEqual(buildProof({ phone: "3125550123" }), {
    ok: false,
    reason: "phone_invalid",
  });
});

await check("missing evidence secret or provider binding fails closed", () => {
  assert.deepEqual(
    buildPhoneVerificationProof(user, "", {
      providerConfigurationHash,
      now,
    }),
    { ok: false, reason: "secret_missing" },
  );
  assert.deepEqual(
    buildPhoneVerificationProof(user, "secret", {
      providerConfigurationHash: "",
      now,
    }),
    { ok: false, reason: "provider_config_missing" },
  );
});

await check("readiness accepts only current proof for current provider binding", () => {
  const proof = buildProof();
  assert.equal(proof.ok, true);
  const receipt = {
    verified_at: proof.value.verified_at,
    recorded_at: proof.value.recorded_at,
    provider_config_hash: proof.value.provider_config_hash,
  };
  assert.equal(
    isCurrentPhoneDeliveryReceipt(receipt, providerConfigurationHash, { now }),
    true,
  );
  assert.equal(
    isCurrentPhoneDeliveryReceipt(receipt, "f".repeat(64), { now }),
    false,
  );
  assert.equal(
    isCurrentPhoneDeliveryReceipt(
      { ...receipt, provider_config_hash: null },
      providerConfigurationHash,
      { now },
    ),
    false,
  );
});

await check("readiness expires old delivery tests and rejects delayed receipts", () => {
  const expiredVerifiedAt = new Date(
    now.getTime() - PHONE_DELIVERY_PROOF_MAX_AGE_MS - 1,
  ).toISOString();
  assert.equal(
    isCurrentPhoneDeliveryReceipt(
      {
        verified_at: expiredVerifiedAt,
        recorded_at: expiredVerifiedAt,
        provider_config_hash: providerConfigurationHash,
      },
      providerConfigurationHash,
      { now },
    ),
    false,
  );
  assert.equal(
    isCurrentPhoneDeliveryReceipt(
      {
        verified_at: user.phone_confirmed_at,
        recorded_at: new Date(
          Date.parse(user.phone_confirmed_at) +
            PHONE_CONFIRMATION_RECEIPT_WINDOW_MS +
            61_000,
        ).toISOString(),
        provider_config_hash: providerConfigurationHash,
      },
      providerConfigurationHash,
      { now: new Date("2026-08-30T03:20:02.000Z") },
    ),
    false,
  );
});

await check("receipt route requires enabled bound provider before fresh proof", async () => {
  const source = await readFile(
    path.join(root, "src/app/api/auth/phone-verification-receipt/route.ts"),
    "utf8",
  );
  assert.match(source, /getRequestUser\(request\)/);
  const configuration = source.indexOf("phoneOtpProviderConfiguration(");
  const proof = source.indexOf("buildPhoneVerificationProof(user");
  assert.ok(configuration >= 0 && proof > configuration);
  assert.match(source, /providerConfiguration\.value\.provider_config_hash/);
  assert.doesNotMatch(source, /request\.json\(/);
  assert.match(source, /from\("phone_verification_receipts"\)/);
  assert.match(source, /onConflict: "user_id,phone_hash"/);
});

await check("phone-change success records evidence before success notice", async () => {
  const source = await readFile(
    path.join(root, "src/app/security/page.tsx"),
    "utf8",
  );
  const verified = source.indexOf('type: "phone_change"');
  const receipt = source.indexOf("/api/auth/phone-verification-receipt");
  const notice = source.indexOf('setNotice("Phone number verified.")');
  assert.ok(verified >= 0 && receipt > verified && notice > receipt);
});

await check("admin SMS readiness requires flag, current binding, and fresh receipt", async () => {
  const source = await readFile(
    path.join(root, "src/app/api/admin/communications-readiness/route.ts"),
    "utf8",
  );
  assert.match(source, /phoneOtpEnabled\s*&&[\s\S]*phoneProviderConfiguration\.ok\s*&&[\s\S]*isCurrentPhoneDeliveryReceipt/);
  assert.match(source, /\.eq\(\s*"provider_config_hash"/);
  assert.match(source, /deliveryTested: smsDeliveryTested/);
  assert.match(source, /latestDeliveryTestedAt: latestPhoneVerifiedAt/);
  assert.doesNotMatch(source, /deliveryTested:\s*Boolean\(latestPhoneVerifiedAt\)/);
});

await check("migrations retain no raw phone and invalidate legacy unbound proof", async () => {
  const base = await readFile(
    path.join(root, "supabase/migrations/040_phone_verification_receipts.sql"),
    "utf8",
  );
  const binding = await readFile(
    path.join(
      root,
      "supabase/migrations/042_phone_verification_provider_binding.sql",
    ),
    "utf8",
  );
  assert.match(base, /phone_hash text not null/);
  assert.doesNotMatch(base, /phone_number|raw_phone|otp\s+text/i);
  assert.match(base, /enable row level security/);
  assert.match(base, /revoke all[\s\S]*public, anon, authenticated/);
  assert.match(base, /grant select, insert, update[\s\S]*service_role/);
  assert.match(binding, /add column if not exists provider_config_hash text/);
  assert.match(binding, /legacy null rows never count/i);
  assert.doesNotMatch(binding, /service_sid|auth_token|account_sid/i);
});

const failed = checks.filter((item) => !item.pass);
console.log(
  `Phone verification proof: ${checks.length - failed.length}/${checks.length} passed`,
);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.pass) console.error(item.error);
}
if (failed.length) process.exitCode = 1;
