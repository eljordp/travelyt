import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalDriverName } from "@/lib/drivers";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DRIVER_COOKIE = "travelyt_driver_session";
const DRIVER_SESSION_TTL_SECONDS = 60 * 60 * 12;

export type DriverAuthorization = {
  ok: boolean;
  driverName?: string;
  driverEmail?: string;
  driverPhone?: string;
  driverRole?: string;
  driverAccessId?: string;
  perDriverCode: boolean;
  source?: "session" | "database" | "env";
};

export type DriverAccessCodeRow = {
  id: string;
  driver_name: string;
  canonical_driver_name: string;
  driver_email: string | null;
  driver_phone: string | null;
  role: string;
  code_hash: string;
  code_preview: string;
  status: "active" | "revoked" | "expired";
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
};

export type DriverAccessPublic = {
  id: string;
  driverName: string;
  canonicalDriverName: string;
  driverEmail?: string;
  driverPhone?: string;
  role: string;
  codePreview: string;
  status: DriverAccessCodeRow["status"];
  createdBy?: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
};

function sessionSecret() {
  return (
    process.env.TRAVELYT_DRIVER_SESSION_SECRET ||
    process.env.TRAVELYT_ADMIN_SESSION_SECRET ||
    process.env.TRAVELYT_ADMIN_PASSWORD ||
    process.env.TRAVELYT_DRIVER_ACCESS_CODE ||
    ""
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

export function hashDriverCode(code: string) {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function generateDriverAccessCode() {
  return `TVT-${randomBytes(9).toString("base64url").toUpperCase()}`;
}

function codePreview(code: string) {
  const clean = code.trim();
  return clean.length <= 4 ? clean : `...${clean.slice(-4)}`;
}

function toPublic(row: DriverAccessCodeRow): DriverAccessPublic {
  return {
    id: row.id,
    driverName: row.driver_name,
    canonicalDriverName: row.canonical_driver_name,
    driverEmail: row.driver_email ?? undefined,
    driverPhone: row.driver_phone ?? undefined,
    role: row.role,
    codePreview: row.code_preview,
    status: row.status,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    revokedBy: row.revoked_by ?? undefined,
  };
}

function parseEnvDriverCodeMap() {
  const raw = process.env.TRAVELYT_DRIVER_ACCESS_CODES;
  const map = new Map<string, string>();
  if (!raw) return map;

  raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separator = part.includes("=") ? "=" : ":";
      const [name, code] = part.split(separator).map((piece) => piece?.trim());
      if (name && code) map.set(canonicalDriverName(name), code);
    });
  return map;
}

function verifyEnvDriverCredentials(
  driverName: string,
  accessCode: string,
  options: { allowGlobalFallback?: boolean } = {}
): DriverAuthorization {
  const driverCodes = parseEnvDriverCodeMap();
  const canonical = canonicalDriverName(driverName);

  if (driverCodes.size > 0) {
    const expected = driverCodes.get(canonical);
    return {
      ok: Boolean(expected && accessCode && safeEqual(accessCode, expected)),
      driverName: expected ? driverName : undefined,
      perDriverCode: true,
      source: "env",
    };
  }

  if (!options.allowGlobalFallback) {
    return {
      ok: false,
      driverName: undefined,
      perDriverCode: true,
      source: "env",
    };
  }

  const expected = process.env.TRAVELYT_DRIVER_ACCESS_CODE;
  return {
    ok: Boolean(expected && accessCode && safeEqual(accessCode, expected)),
    driverName: driverName || undefined,
    perDriverCode: false,
    source: "env",
  };
}

async function maybeFindDriverCode(
  supabase: SupabaseClient | null,
  accessCode: string
) {
  if (!supabase || !accessCode.trim()) return { row: null, tableMissing: false };

  const { data, error } = await supabase
    .from("driver_access_codes")
    .select("*")
    .eq("code_hash", hashDriverCode(accessCode))
    .maybeSingle<DriverAccessCodeRow>();

  if (error) {
    return {
      row: null,
      tableMissing:
        error.code === "42P01" ||
        /driver_access_codes/i.test(error.message ?? ""),
    };
  }

  return { row: data ?? null, tableMissing: false };
}

export async function verifyDriverCredentials(
  driverName: string,
  accessCode: string
): Promise<DriverAuthorization & { error?: string }> {
  const cleanDriverName = driverName.trim();
  const cleanAccessCode = accessCode.trim();
  if (!cleanDriverName) {
    return { ok: false, perDriverCode: true, error: "Enter your courier name." };
  }
  if (!cleanAccessCode) {
    return { ok: false, perDriverCode: true, error: "Enter your access code." };
  }

  const supabase = getSupabaseAdmin();
  const { row, tableMissing } = await maybeFindDriverCode(
    supabase,
    cleanAccessCode
  );

  if (row) {
    if (row.status !== "active") {
      return {
        ok: false,
        perDriverCode: true,
        error: "This driver access code is not active.",
      };
    }
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      return {
        ok: false,
        perDriverCode: true,
        error: "This driver access code has expired.",
      };
    }
    if (canonicalDriverName(cleanDriverName) !== row.canonical_driver_name) {
      return {
        ok: false,
        perDriverCode: true,
        error: "This access code is assigned to a different courier.",
      };
    }

    if (supabase) {
      await supabase
        .from("driver_access_codes")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", row.id);
    }

    return {
      ok: true,
      driverName: row.driver_name,
      driverEmail: row.driver_email ?? undefined,
      driverPhone: row.driver_phone ?? undefined,
      driverRole: row.role,
      driverAccessId: row.id,
      perDriverCode: true,
      source: "database",
    };
  }

  if (!tableMissing) {
    const envResult = verifyEnvDriverCredentials(
      cleanDriverName,
      cleanAccessCode,
      {
        allowGlobalFallback:
          process.env.TRAVELYT_ALLOW_LEGACY_DRIVER_CODE === "true",
      }
    );
    if (!envResult.ok) {
      return {
        ...envResult,
        error: "Driver name or access code is incorrect.",
      };
    }
    return envResult;
  }

  const fallback = verifyEnvDriverCredentials(cleanDriverName, cleanAccessCode);
  return fallback.ok
    ? fallback
    : { ...fallback, error: "Driver access is not configured." };
}

export function createDriverSession(driver: DriverAuthorization) {
  if (!driver.ok || !driver.driverName) return "";
  const payload = Buffer.from(
    JSON.stringify({
      driverName: driver.driverName,
      driverEmail: driver.driverEmail,
      driverPhone: driver.driverPhone,
      driverRole: driver.driverRole,
      driverAccessId: driver.driverAccessId,
      exp: Math.floor(Date.now() / 1000) + DRIVER_SESSION_TTL_SECONDS,
    })
  ).toString("base64url");
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : "";
}

export function setDriverSessionCookie(response: NextResponse, value: string) {
  response.cookies.set(DRIVER_COOKIE, value, {
    httpOnly: true,
    maxAge: DRIVER_SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearDriverSessionCookie(response: NextResponse) {
  response.cookies.set(DRIVER_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function getDriverSession(request: Request): DriverAuthorization {
  const value = readCookie(request, DRIVER_COOKIE);
  if (!value) return { ok: false, perDriverCode: true };

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return { ok: false, perDriverCode: true };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as {
      driverName?: string;
      driverEmail?: string;
      driverPhone?: string;
      driverRole?: string;
      driverAccessId?: string;
      exp?: number;
    };
    if (!decoded.driverName || !decoded.exp) {
      return { ok: false, perDriverCode: true };
    }
    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return { ok: false, perDriverCode: true };
    }
    return {
      ok: true,
      driverName: decoded.driverName,
      driverEmail: decoded.driverEmail,
      driverPhone: decoded.driverPhone,
      driverRole: decoded.driverRole,
      driverAccessId: decoded.driverAccessId,
      perDriverCode: true,
      source: "session",
    };
  } catch {
    return { ok: false, perDriverCode: true };
  }
}

export async function authorizeDriverRequest(
  request: Request
): Promise<DriverAuthorization> {
  const session = getDriverSession(request);
  if (session.ok) return session;

  const driverCode = request.headers.get("x-travelyt-driver-code")?.trim() ?? "";
  const driverName = request.headers.get("x-travelyt-driver-name")?.trim() ?? "";
  const verified = await verifyDriverCredentials(driverName, driverCode);
  return {
    ok: verified.ok,
    driverName: verified.driverName,
    driverEmail: verified.driverEmail,
    driverPhone: verified.driverPhone,
    driverRole: verified.driverRole,
    driverAccessId: verified.driverAccessId,
    perDriverCode: verified.perDriverCode,
    source: verified.source,
  };
}

export async function listDriverAccessCodes() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [] as DriverAccessPublic[], error: null };

  const { data, error } = await supabase
    .from("driver_access_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { rows: [] as DriverAccessPublic[], error };
  return {
    rows: ((data ?? []) as DriverAccessCodeRow[]).map(toPublic),
    error: null,
  };
}

export async function createDriverAccessCode(input: {
  driverName: string;
  driverEmail?: string;
  driverPhone?: string;
  role?: string;
  expiresAt?: string;
  createdBy?: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Driver access backend is not configured.");

  const code = generateDriverAccessCode();
  const driverName = input.driverName.trim().replace(/\s+/g, " ");
  const role = input.role?.trim() || "driver";
  const { data, error } = await supabase
    .from("driver_access_codes")
    .insert({
      driver_name: driverName,
      canonical_driver_name: canonicalDriverName(driverName),
      driver_email: input.driverEmail?.trim().toLowerCase() || null,
      driver_phone: input.driverPhone?.trim() || null,
      role,
      code_hash: hashDriverCode(code),
      code_preview: codePreview(code),
      expires_at: input.expiresAt || null,
      created_by: input.createdBy || null,
      status: "active",
    })
    .select("*")
    .single<DriverAccessCodeRow>();

  if (error) throw error;
  return { code, access: toPublic(data) };
}

export async function revokeDriverAccessCode(input: {
  id: string;
  revokedBy?: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Driver access backend is not configured.");

  const { data, error } = await supabase
    .from("driver_access_codes")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: input.revokedBy || null,
    })
    .eq("id", input.id)
    .select("*")
    .single<DriverAccessCodeRow>();

  if (error) throw error;
  return toPublic(data);
}
