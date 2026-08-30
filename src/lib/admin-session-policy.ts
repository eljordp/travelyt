import { createHash } from "node:crypto";

export const ADMIN_SESSION_VERSION = 2;

export type AdminSessionRole = "admin" | "dispatcher";
export type AdminAuthSource = "supabase" | "break_glass";

export type BoundAdminSession = {
  version: typeof ADMIN_SESSION_VERSION;
  userId: string | null;
  email: string;
  role: AdminSessionRole;
  authSource: AdminAuthSource;
  mfaFactorFingerprint: string | null;
  issuedAtMs: number;
  exp: number;
};

export type CurrentAdminPrincipal = {
  userId: string;
  email: string;
  role: AdminSessionRole | false;
  deletedAt?: string | null;
  bannedUntil?: string | null;
  emailConfirmedAt?: string | null;
  verifiedMfaFactorIds: string[];
  sessionsNotBeforeMs?: number | null;
};

export type AdminSessionPolicyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "expired"
        | "wrong_source"
        | "user_missing"
        | "email_changed"
        | "role_changed"
        | "deleted"
        | "banned"
        | "email_unconfirmed"
        | "mfa_missing"
        | "mfa_changed"
        | "revoked";
    };

export function adminMfaFactorFingerprint(factorIds: string[]) {
  const normalized = [...new Set(factorIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) return "";
  return createHash("sha256").update(normalized.join("\n")).digest("base64url");
}

function hasActiveBan(value: string | null | undefined, nowMs: number) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  // A malformed non-empty ban value is treated as active. Authorization must
  // fail closed when the current account state cannot be interpreted safely.
  return !Number.isFinite(timestamp) || timestamp > nowMs;
}

export function evaluateSupabaseAdminSession(
  session: BoundAdminSession,
  principal: CurrentAdminPrincipal | null,
  nowMs = Date.now(),
): AdminSessionPolicyResult {
  if (session.exp <= Math.floor(nowMs / 1000)) return { ok: false, reason: "expired" };
  if (session.authSource !== "supabase") return { ok: false, reason: "wrong_source" };
  if (!principal || !session.userId || session.userId !== principal.userId) {
    return { ok: false, reason: "user_missing" };
  }
  if (session.email !== principal.email.trim().toLowerCase()) {
    return { ok: false, reason: "email_changed" };
  }
  if (!principal.role || session.role !== principal.role) {
    return { ok: false, reason: "role_changed" };
  }
  if (principal.deletedAt) return { ok: false, reason: "deleted" };
  if (hasActiveBan(principal.bannedUntil, nowMs)) return { ok: false, reason: "banned" };
  if (!principal.emailConfirmedAt) return { ok: false, reason: "email_unconfirmed" };

  const currentMfaFingerprint = adminMfaFactorFingerprint(principal.verifiedMfaFactorIds);
  if (!currentMfaFingerprint) return { ok: false, reason: "mfa_missing" };
  if (
    !session.mfaFactorFingerprint ||
    session.mfaFactorFingerprint !== currentMfaFingerprint
  ) {
    return { ok: false, reason: "mfa_changed" };
  }
  if (
    principal.sessionsNotBeforeMs &&
    session.issuedAtMs <= principal.sessionsNotBeforeMs
  ) {
    return { ok: false, reason: "revoked" };
  }
  return { ok: true };
}
