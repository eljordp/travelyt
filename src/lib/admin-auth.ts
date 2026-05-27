import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const ADMIN_COOKIE = "travelyt_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = {
  email: string;
  exp: number;
};

function adminEmail() {
  return process.env.TRAVELYT_ADMIN_EMAIL?.trim().toLowerCase();
}

function adminPassword() {
  return process.env.TRAVELYT_ADMIN_PASSWORD;
}

function sessionSecret() {
  return (
    process.env.TRAVELYT_ADMIN_SESSION_SECRET ||
    process.env.TRAVELYT_ADMIN_PASSWORD ||
    process.env.TRAVELYT_DRIVER_ACCESS_CODE
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
  return Boolean(adminEmail() && adminPassword() && sessionSecret());
}

export function verifyAdminCredentials(email: string, password: string) {
  const expectedEmail = adminEmail();
  const expectedPassword = adminPassword();
  if (!expectedEmail || !expectedPassword) return false;

  return (
    safeEqual(email.trim().toLowerCase(), expectedEmail) &&
    safeEqual(password, expectedPassword)
  );
}

export function createAdminSession(email: string) {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.trim().toLowerCase(),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    } satisfies AdminSessionPayload)
  ).toString("base64url");
  const signature = sign(payload);
  if (!signature) return "";
  return `${payload}.${signature}`;
}

export function getAdminSession(request: Request) {
  const value = readCookie(request, ADMIN_COOKIE);
  const expectedEmail = adminEmail();
  if (!value || !expectedEmail) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSessionPayload;
    const isFresh = decoded.exp > Math.floor(Date.now() / 1000);
    if (!isFresh || decoded.email !== expectedEmail) return null;
    return { email: decoded.email };
  } catch {
    return null;
  }
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

