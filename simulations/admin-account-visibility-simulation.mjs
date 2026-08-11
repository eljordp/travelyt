#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [route, adminPage, migration] = await Promise.all([
  readFile("src/app/api/admin/accounts/route.ts", "utf8"),
  readFile("src/app/admin/page.tsx", "utf8"),
  readFile("supabase/migrations/027_admin_account_visibility.sql", "utf8"),
]);

test("account inventory is restricted to full admins", () => {
  assert.match(route, /isFullAdminSession\(request\)/);
  assert.match(route, /Full admin access required/);
});

test("Supabase users include incomplete and last-login states", () => {
  assert.match(route, /auth\.admin\.listUsers/);
  assert.match(route, /confirmed_never_signed_in/);
  assert.match(route, /unconfirmed/);
  assert.match(route, /lastSignInAt/);
});

test("raw auth audit payloads stay inside the auth schema", () => {
  assert.match(migration, /auth\.audit_log_entries/);
  assert.match(migration, /revoke all .* from authenticated/i);
  assert.match(migration, /grant execute .* to service_role/i);
  assert.doesNotMatch(route, /payload:/);
});

test("admin UI shows account counts and authentication activity", () => {
  assert.match(adminPage, /Customer accounts &amp; logins/);
  assert.match(adminPage, /Incomplete · unconfirmed/);
  assert.match(adminPage, /Authentication activity/);
  assert.match(adminPage, /loadAccounts\(\)/);
});
