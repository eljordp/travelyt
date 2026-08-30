#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADMIN_SESSION_VERSION,
  adminMfaFactorFingerprint,
  evaluateSupabaseAdminSession,
} from "../src/lib/admin-session-policy.ts";

const nowMs = Date.parse("2026-08-30T12:00:00.000Z");
const factorId = "4f609dc7-3a48-4980-b12a-993692a8798d";
const session = {
  version: ADMIN_SESSION_VERSION,
  userId: "884dff10-5012-4cb6-a26e-0a1a3340a138",
  email: "ops@travelyt.us",
  role: "admin",
  authSource: "supabase",
  mfaFactorFingerprint: adminMfaFactorFingerprint([factorId]),
  issuedAtMs: nowMs - 60_000,
  exp: Math.floor((nowMs + 60 * 60_000) / 1000),
};
const principal = {
  userId: session.userId,
  email: session.email,
  role: "admin",
  deletedAt: null,
  bannedUntil: null,
  emailConfirmedAt: "2026-08-01T12:00:00.000Z",
  verifiedMfaFactorIds: [factorId],
  sessionsNotBeforeMs: null,
};

test("a current Supabase admin with the same verified TOTP remains authorized", () => {
  assert.deepEqual(evaluateSupabaseAdminSession(session, principal, nowMs), { ok: true });
});

test("demotion invalidates an otherwise valid signed cookie", () => {
  assert.deepEqual(
    evaluateSupabaseAdminSession(session, { ...principal, role: "dispatcher" }, nowMs),
    { ok: false, reason: "role_changed" },
  );
});

test("a current Supabase ban invalidates an otherwise valid signed cookie", () => {
  assert.deepEqual(
    evaluateSupabaseAdminSession(
      session,
      { ...principal, bannedUntil: "2026-09-30T12:00:00.000Z" },
      nowMs,
    ),
    { ok: false, reason: "banned" },
  );
});

test("MFA removal and replacement both invalidate the old cookie", () => {
  assert.deepEqual(
    evaluateSupabaseAdminSession(
      session,
      { ...principal, verifiedMfaFactorIds: [] },
      nowMs,
    ),
    { ok: false, reason: "mfa_missing" },
  );
  assert.deepEqual(
    evaluateSupabaseAdminSession(
      session,
      { ...principal, verifiedMfaFactorIds: ["replacement-factor"] },
      nowMs,
    ),
    { ok: false, reason: "mfa_changed" },
  );
});

test("logout revocation and expiry reject stale cookies", () => {
  assert.deepEqual(
    evaluateSupabaseAdminSession(
      session,
      { ...principal, sessionsNotBeforeMs: session.issuedAtMs + 1 },
      nowMs,
    ),
    { ok: false, reason: "revoked" },
  );
  assert.deepEqual(
    evaluateSupabaseAdminSession(
      { ...session, exp: Math.floor(nowMs / 1000) },
      principal,
      nowMs,
    ),
    { ok: false, reason: "expired" },
  );
});

test("the central guard rechecks Supabase state and sensitive routes do not use cookie-only helpers", async () => {
  const adminAuth = await readFile("src/lib/admin-auth.ts", "utf8");
  assert.match(adminAuth, /auth\.admin\.getUserById\(session\.userId\)/);
  assert.match(adminAuth, /auth\.admin\.mfa\.listFactors/);
  assert.match(adminAuth, /verifiedAdminSessionCache = new WeakMap/);
  assert.match(adminAuth, /TRAVELYT_ADMIN_BREAK_GLASS_ENABLED !== "true"/);
  assert.match(adminAuth, /BREAK_GLASS_TTL_SECONDS = 60 \* 15/);

  const routePaths = [
    "src/app/api/admin/accounts/route.ts",
    "src/app/api/admin/arrival-release/route.ts",
    "src/app/api/admin/communications-readiness/route.ts",
    "src/app/api/admin/seo/route.ts",
    "src/app/api/backup/bookings/[id]/log/route.ts",
    "src/app/api/backup/export/route.ts",
    "src/app/api/bookings/route.ts",
    "src/app/api/custody/route.ts",
    "src/app/api/driver-applications/route.ts",
    "src/app/api/drivers/access-codes/route.ts",
    "src/app/api/identity/verification-review/route.ts",
    "src/app/api/ops-exceptions/route.ts",
    "src/app/api/ops/agent-assignments/route.ts",
    "src/app/api/ops/agent-readiness/route.ts",
    "src/app/api/ops/booking-workflow/route.ts",
    "src/app/api/ops/driver-onboarding-invites/route.ts",
    "src/app/api/ops/pilot-eligibility/route.ts",
    "src/app/api/ops/refunds/route.ts",
    "src/app/api/partner-integrations/route.ts",
    "src/app/api/partner-integrations/royal-jordanian/check-in/route.ts",
    "src/app/api/seo/gsc/route.ts",
  ];
  for (const path of routePaths) {
    const source = await readFile(path, "utf8");
    assert.match(source, /getVerifiedAdminSession|isVerifiedFullAdminSession/, path);
    assert.doesNotMatch(
      source,
      /\bgetAdminSession\(|\bisFullAdminSession\(|\bisOpsSession\(/,
      path,
    );
  }
  const bookingsRoute = await readFile("src/app/api/bookings/route.ts", "utf8");
  assert.match(
    bookingsRoute,
    /function legacyAdminCodeAuthorized[\s\S]*NODE_ENV === "production"\) return false/,
  );
});
