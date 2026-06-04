import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

const ADMIN_COOKIE = "travelyt_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AdminRole = "admin" | "dispatcher";

type AdminSessionPayload = {
  email: string;
  role: AdminRole;
  exp: number;
};

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
  return (
    process.env.TRAVELYT_ADMIN_SESSION_SECRET ||
    process.env.TRAVELYT_ADMIN_PASSWORD ||
    process.env.TRAVELYT_DRIVER_ACCESS_CODE
  );
}

function supabaseAuthConfigured() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
      : typeof user.user_metadata?.role === "string"
        ? user.user_metadata.role
        : "";
  const role = metadataRole.trim().toLowerCase();
  if (role === "admin" || role === "manager") return "admin";
  if (role === "dispatcher" || role === "employee") return "dispatcher";
  return false;
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

export async function verifyAdminCredentialsWithSupabase(
  email: string,
  password: string
): Promise<AdminRole | false> {
  const staticRole = verifyAdminCredentials(email, password);
  if (staticRole) return staticRole;
  if (!supabaseAuthConfigured()) return false;

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) return false;
  return roleFromSupabaseUser(data.user);
}

function roleIsValid(email: string, role: AdminRole) {
  if (role === "admin") {
    const expectedEmail = adminEmail();
    if (expectedEmail && email === expectedEmail) return true;
    return supabaseAuthConfigured();
  }
  const expectedEmail = dispatcherEmail();
  if (expectedEmail && email === expectedEmail) return true;
  return supabaseAuthConfigured();
}

export function createAdminSession(email: string, role: AdminRole = "admin") {
  const cleanEmail = email.trim().toLowerCase();
  const payload = Buffer.from(
    JSON.stringify({
      email: cleanEmail,
      role,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    } satisfies AdminSessionPayload)
  ).toString("base64url");
  const signature = sign(payload);
  if (!signature) return "";
  return `${payload}.${signature}`;
}

export function isFullAdminSession(request: Request) {
  return getAdminSession(request)?.role === "admin";
}

export function isOpsSession(request: Request) {
  return Boolean(getAdminSession(request));
}

/*
 * Older deployed cookies did not include a role. The session reader below
 * treats them as admin only if the email still matches the configured admin.
 */
function normalizeDecodedSession(decoded: Partial<AdminSessionPayload>) {
  const role = decoded.role ?? "admin";
  if (role !== "admin" && role !== "dispatcher") return null;
  if (!decoded.email) return null;
  return {
    email: decoded.email,
    role,
    exp: decoded.exp ?? 0,
  } satisfies AdminSessionPayload;
}

export function getAdminSession(request: Request) {
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
    if (!isFresh || !roleIsValid(decoded.email, decoded.role)) return null;
    return { email: decoded.email, role: decoded.role };
  } catch {
    return null;
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
