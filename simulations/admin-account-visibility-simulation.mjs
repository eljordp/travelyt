#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, activityRoute, loginPage, adminLoginRoute, adminPage, migration] = await Promise.all([
  readFile("src/app/api/admin/accounts/route.ts", "utf8"),
  readFile("src/app/api/auth/activity/route.ts", "utf8"),
  readFile("src/app/login/page.tsx", "utf8"),
  readFile("src/app/api/admin/login/route.ts", "utf8"),
  readFile("src/app/admin/page.tsx", "utf8"),
  readFile("supabase/migrations/028_auth_activity_events.sql", "utf8"),
]);

test("account inventory is restricted to full admins", () => {
  assert.match(route, /await isVerifiedFullAdminSession\(request\)/);
  assert.match(route, /Full admin access required/);
});

test("Supabase users include incomplete and last-login states", () => {
  assert.match(route, /auth\.admin\.listUsers/);
  assert.match(route, /confirmed_never_signed_in/);
  assert.match(route, /unconfirmed/);
  assert.match(route, /lastSignInAt/);
});

test("successful sign-ins use a Travelyt-owned server-only event table", () => {
  assert.match(migration, /auth_activity_events/);
  assert.match(migration, /revoke all .* from authenticated/i);
  assert.match(migration, /grant select, insert .* to service_role/i);
  assert.doesNotMatch(migration, /password\s+text|access_token\s+text/i);
  assert.doesNotMatch(route, /payload:/);
});

test("customer login events require a server-verified account token", () => {
  assert.match(activityRoute, /getRequestUser\(request\)/);
  assert.match(activityRoute, /role !== "customer"/);
  assert.match(loginPage, /\/api\/auth\/activity/);
  assert.match(loginPage, /Authorization: `Bearer/);
});

test("operations login events are written only after AAL2 verification", () => {
  assert.match(adminLoginRoute, /verifyAdminAccessToken/);
  assert.match(adminLoginRoute, /eventType: "admin_login"/);
  assert.match(adminLoginRoute, /authLevel: "aal2"/);
});

test("admin UI shows account counts and authentication activity", () => {
  assert.match(adminPage, /Customer accounts &amp; logins/);
  assert.match(adminPage, /Incomplete · unconfirmed/);
  assert.match(adminPage, /Successful sign-ins/);
  assert.match(adminPage, /loadAccounts\(\)/);
});
