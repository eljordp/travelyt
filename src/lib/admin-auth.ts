import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  ADMIN_SESSION_VERSION,
  adminMfaFactorFingerprint,
  evaluateSupabaseAdminSession,
  type AdminAuthSource,
  type BoundAdminSession,
} from "@/lib/admin-session-policy";

const ADMIN_COOKIE = "travelyt_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const BREAK_GLASS_TTL_SECONDS = 60 * 15;
const ADMIN_SESSIONS_NOT_BEFORE = "travelyt_admin_sessions_not_before_ms";
const verifiedAdminSessionCache = new WeakMap<
  Request,
  Promise<VerifiedAdminSession | null>
>();

export type AdminRole = "admin" | "dispatcher";

type AdminSessionPayload = BoundAdminSession;

export type VerifiedAdminSession = Pick<
  AdminSessionPayload,
  "userId" | "email" | "role" | "authSource" | "issuedAtMs" | "exp"
>;

function adminEmail() {
  return process.env.TRAVELYT_ADMIN_EMAIL?.trim().toLowerCase();
}

function adminPassword() {
  return process.env.TRAVELYT_ADMIN_PASSWORD;
}

function dispatcherEmail() {
  return process.env.TRAVELYT_DISPATCHER_EMAIL?.trim().toLowerCase();
}

function dispatcherPassword() {
  return process.env.TRAVELYT_DISPATCHER_PASSWORD;
}

function sessionSecret() {
  const explicit = process.env.TRAVELYT_ADMIN_SESSION_SECRET;
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "production") return undefined;

  return process.env.TRAVELYT_ADMIN_PASSWORD || process.env.TRAVELYT_DRIVER_ACCESS_CODE;
}

function supabaseAuthConfigured() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(payload: string) {
  const secret = sessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function adminAuthConfigured() {
  return Boolean(
    sessionSecret() &&
      ((adminEmail() && adminPassword()) ||
        (dispatcherEmail() && dispatcherPassword()) ||
        supabaseAuthConfigured())
  );
}

function roleFromSupabaseUser(user: User): AdminRole | false {
  const metadataRole =
    typeof user.app_metadata?.role === "string"
      ? user.app_metadata.role
      : "";
  const role = metadataRole.trim().toLowerCase();
  if (role === "admin" || role === "manager") return "admin";
  if (role === "dispatcher" || role === "employee") return "dispatcher";
  return false;
}

function accessTokenAssuranceLevel(accessToken: string) {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) return "";
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { aal?: unknown };
    return typeof claims.aal === "string" ? claims.aal : "";
  } catch {
    return "";
  }
}

export async function verifyAdminAccessToken(accessToken: string): Promise<
  | {
      userId: string;
      email: string;
      role: AdminRole;
      mfaFactorFingerprint: string;
    }
  | false
> {
  if (!supabaseAuthConfigured() || accessTokenAssuranceLevel(accessToken) !== "aal2") {
    return false;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return false;

  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const [{ data: currentData, error: currentError }, factorResult] = await Promise.all([
    admin.auth.admin.getUserById(data.user.id),
    admin.auth.admin.mfa.listFactors({ userId: data.user.id }),
  ]);
  const currentUser = currentData.user;
  const email = currentUser?.email?.trim().toLowerCase();
  const role = currentUser ? roleFromSupabaseUser(currentUser) : false;
  const verifiedMfaFactorIds =
    factorResult.data?.factors
      .filter((factor) => factor.status === "verified" && factor.factor_type === "totp")
      .map((factor) => factor.id) ?? [];
  const mfaFactorFingerprint = adminMfaFactorFingerprint(verifiedMfaFactorIds);
  if (
    currentError ||
    factorResult.error ||
    !currentUser ||
    currentUser.id !== data.user.id ||
    !email ||
    !role ||
    !mfaFactorFingerprint
  ) {
    return false;
  }
  const issuedAtMs = Date.now();
  const policy = evaluateSupabaseAdminSession(
    {
      version: ADMIN_SESSION_VERSION,
      userId: currentUser.id,
      email,
      role,
      authSource: "supabase",
      mfaFactorFingerprint,
      issuedAtMs,
      exp: Math.floor(issuedAtMs / 1000) + SESSION_TTL_SECONDS,
    },
    {
      userId: currentUser.id,
      email,
      role,
      deletedAt: currentUser.deleted_at,
      bannedUntil: currentUser.banned_until,
      emailConfirmedAt: currentUser.email_confirmed_at ?? currentUser.confirmed_at,
      verifiedMfaFactorIds,
      sessionsNotBeforeMs: currentSessionNotBeforeMs(currentUser),
    },
    issuedAtMs,
  );
  if (!policy.ok) return false;
  return { userId: currentUser.id, email, role, mfaFactorFingerprint };
}

export function verifyAdminCredentials(email: string, password: string) {
  const expectedEmail = adminEmail();
  const expectedPassword = adminPassword();
  const cleanEmail = email.trim().toLowerCase();

  if (
    expectedEmail &&
    expectedPassword &&
    safeEqual(cleanEmail, expectedEmail) &&
    safeEqual(password, expectedPassword)
  ) {
    return "admin" satisfies AdminRole;
  }

  const expectedDispatcherEmail = dispatcherEmail();
  const expectedDispatcherPassword = dispatcherPassword();
  if (
    expectedDispatcherEmail &&
    expectedDispatcherPassword &&
    safeEqual(cleanEmail, expectedDispatcherEmail) &&
    safeEqual(password, expectedDispatcherPassword)
  ) {
    return "dispatcher" satisfies AdminRole;
  }

  return false;
}

function breakGlassRoleIsValid(email: string, role: AdminRole) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.TRAVELYT_ADMIN_BREAK_GLASS_ENABLED !== "true"
  ) {
    return false;
  }
  if (role === "admin") return Boolean(adminEmail() && email === adminEmail());
  return Boolean(dispatcherEmail() && email === dispatcherEmail());
}

function breakGlassCredentialFingerprint(email: string, role: AdminRole) {
  const password = role === "admin" ? adminPassword() : dispatcherPassword();
  const secret = sessionSecret();
  if (!password || !secret) return "";
  return createHmac("sha256", secret)
    .update(`${role}\n${email.trim().toLowerCase()}\n${password}`)
    .digest("base64url");
}

export function createAdminSession(input: {
  userId?: string | null;
  email: string;
  role: AdminRole;
  authSource: AdminAuthSource;
  mfaFactorFingerprint?: string | null;
}) {
  const cleanEmail = input.email.trim().toLowerCase();
  const issuedAtMs = Date.now();
  const ttl = input.authSource === "break_glass" ? BREAK_GLASS_TTL_SECONDS : SESSION_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({
      version: ADMIN_SESSION_VERSION,
      userId: input.userId ?? null,
      email: cleanEmail,
      role: input.role,
      authSource: input.authSource,
      mfaFactorFingerprint:
        input.authSource === "break_glass"
          ? breakGlassCredentialFingerprint(cleanEmail, input.role)
          : input.mfaFactorFingerprint ?? null,
      issuedAtMs,
      exp: Math.floor(issuedAtMs / 1000) + ttl,
    } satisfies AdminSessionPayload)
  ).toString("base64url");
  const signature = sign(payload);
  if (!signature) return "";
  return `${payload}.${signature}`;
}

function normalizeDecodedSession(decoded: Partial<AdminSessionPayload>) {
  const role = decoded.role;
  if (role !== "admin" && role !== "dispatcher") return null;
  if (
    decoded.version !== ADMIN_SESSION_VERSION ||
    !decoded.email ||
    (decoded.authSource !== "supabase" && decoded.authSource !== "break_glass") ||
    typeof decoded.issuedAtMs !== "number" ||
    typeof decoded.exp !== "number"
  ) {
    return null;
  }
  return {
    version: ADMIN_SESSION_VERSION,
    userId: typeof decoded.userId === "string" ? decoded.userId : null,
    email: decoded.email.trim().toLowerCase(),
    role,
    authSource: decoded.authSource,
    mfaFactorFingerprint:
      typeof decoded.mfaFactorFingerprint === "string"
        ? decoded.mfaFactorFingerprint
        : null,
    issuedAtMs: decoded.issuedAtMs,
    exp: decoded.exp,
  } satisfies AdminSessionPayload;
}

function readSignedAdminSession(request: Request) {
  const value = readCookie(request, ADMIN_COOKIE);
  if (!value) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const decoded = normalizeDecodedSession(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    );
    if (!decoded) return null;
    const isFresh = decoded.exp > Math.floor(Date.now() / 1000);
    if (!isFresh) return null;
    return decoded;
  } catch {
    return null;
  }
}

function currentSessionNotBeforeMs(user: User) {
  const value = user.app_metadata?.[ADMIN_SESSIONS_NOT_BEFORE];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function revalidateAdminSession(
  request: Request,
): Promise<VerifiedAdminSession | null> {
  const session = readSignedAdminSession(request);
  if (!session) return null;

  if (session.authSource === "break_glass") {
    const currentCredentialFingerprint = breakGlassCredentialFingerprint(
      session.email,
      session.role,
    );
    if (
      !breakGlassRoleIsValid(session.email, session.role) ||
      !session.mfaFactorFingerprint ||
      !currentCredentialFingerprint ||
      !safeEqual(session.mfaFactorFingerprint, currentCredentialFingerprint)
    ) {
      return null;
    }
    return session;
  }

  if (!session.userId || !session.mfaFactorFingerprint) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const [{ data, error }, factorResult] = await Promise.all([
      admin.auth.admin.getUserById(session.userId),
      admin.auth.admin.mfa.listFactors({ userId: session.userId }),
    ]);
    const user = data.user;
    if (error || factorResult.error || !user) return null;
    const verifiedMfaFactorIds =
      factorResult.data?.factors
        .filter((factor) => factor.status === "verified" && factor.factor_type === "totp")
        .map((factor) => factor.id) ?? [];
    const policy = evaluateSupabaseAdminSession(session, {
      userId: user.id,
      email: user.email?.trim().toLowerCase() ?? "",
      role: roleFromSupabaseUser(user),
      deletedAt: user.deleted_at,
      bannedUntil: user.banned_until,
      emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at,
      verifiedMfaFactorIds,
      sessionsNotBeforeMs: currentSessionNotBeforeMs(user),
    });
    return policy.ok ? session : null;
  } catch (error) {
    console.warn("Admin session revalidation failed closed", error);
    return null;
  }
}

export function getVerifiedAdminSession(
  request: Request,
): Promise<VerifiedAdminSession | null> {
  const cached = verifiedAdminSessionCache.get(request);
  if (cached) return cached;
  const verification = revalidateAdminSession(request);
  verifiedAdminSessionCache.set(request, verification);
  return verification;
}

export async function isVerifiedFullAdminSession(request: Request) {
  return (await getVerifiedAdminSession(request))?.role === "admin";
}

export async function isVerifiedOpsSession(request: Request) {
  return Boolean(await getVerifiedAdminSession(request));
}

export async function revokeAdminSessionsForRequest(request: Request) {
  const session = readSignedAdminSession(request);
  if (!session || session.authSource !== "supabase" || !session.userId) return false;
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const { data, error } = await admin.auth.admin.getUserById(session.userId);
    if (error || !data.user) return false;
    const { error: updateError } = await admin.auth.admin.updateUserById(session.userId, {
      app_metadata: {
        ...data.user.app_metadata,
        [ADMIN_SESSIONS_NOT_BEFORE]: Date.now(),
      },
    });
    return !updateError;
  } catch (error) {
    console.warn("Admin session revocation failed", error);
    return false;
  }
}

/*
 * Kept below for compatibility with imports from older compiled chunks during
 * rolling Vercel deployments.
 */
export function legacyVerifyAdminCredentials(email: string, password: string) {
  const expectedEmail = adminEmail();
  const expectedPassword = adminPassword();
  if (!expectedEmail || !expectedPassword) return false;

  return (
    safeEqual(email.trim().toLowerCase(), expectedEmail) &&
    safeEqual(password, expectedPassword)
  );
}

export function setAdminSessionCookie(response: NextResponse, value: string) {
  response.cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
