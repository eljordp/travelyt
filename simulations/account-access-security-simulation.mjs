#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { roleRequiresMfa, trustedUserRole } from "../src/lib/auth-policy.ts";

const files = Object.fromEntries(
  await Promise.all(
    [
      "src/lib/admin-auth.ts",
      "src/app/api/admin/login/route.ts",
      "src/app/api/identity/verification-request/route.ts",
      "src/app/login/page.tsx",
      "src/app/security/page.tsx",
      "src/app/profile/page.tsx",
    ].map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

test("editable user metadata cannot grant a trusted role", () => {
  assert.equal(
    trustedUserRole({
      app_metadata: {},
      user_metadata: { role: "admin" },
    }),
    "customer",
  );
});

test("server-controlled app metadata supplies the role", () => {
  assert.equal(
    trustedUserRole({ app_metadata: { role: "dispatcher" } }),
    "dispatcher",
  );
});

test("every operations role requires MFA", () => {
  for (const role of ["driver", "employee", "dispatcher", "manager", "admin"]) {
    assert.equal(roleRequiresMfa(role), true, `${role} must require MFA`);
  }
  assert.equal(roleRequiresMfa("customer"), false);
});

test("admin exchange requires an AAL2 access token", () => {
  assert.match(files["src/lib/admin-auth.ts"], /accessTokenAssuranceLevel\(accessToken\) !== "aal2"/);
  assert.match(files["src/app/api/admin/login/route.ts"], /verifyAdminAccessToken\(accessToken\)/);
});

test("production password-only admin access is fail-closed", () => {
  assert.match(
    files["src/app/api/admin/login/route.ts"],
    /TRAVELYT_ADMIN_BREAK_GLASS_ENABLED !== "true"/,
  );
});

test("identity and MFA decisions do not trust user_metadata.role", () => {
  for (const [path, source] of Object.entries(files)) {
    assert.doesNotMatch(source, /user_metadata\??\.role|user_metadata\.role/, path);
  }
  assert.doesNotMatch(
    files["src/app/api/identity/verification-request/route.ts"],
    /body\.role/,
  );
});
