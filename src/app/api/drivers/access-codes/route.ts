import { NextResponse } from "next/server";
import { getAdminSession, isFullAdminSession } from "@/lib/admin-auth";
import {
  createDriverAccessCode,
  listDriverAccessCodes,
  revokeDriverAccessCode,
} from "@/lib/driver-access-server";
import { rateLimit } from "@/lib/rate-limit";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function requireAdmin(request: Request) {
  const session = getAdminSession(request);
  if (!session) return { session: null, response: bad("Admin access is required.", 401) };
  return { session, response: null };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "drivers:access-codes:get", 60);
  if (limited) return limited;

  const { response } = requireAdmin(request);
  if (response) return response;

  const { rows, error } = await listDriverAccessCodes();
  if (error) return bad("Could not load driver access codes.", 500);
  return NextResponse.json({ ok: true, accessCodes: rows });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "drivers:access-codes:post", 12);
  if (limited) return limited;

  const { session, response } = requireAdmin(request);
  if (response) return response;
  if (!isFullAdminSession(request)) {
    return bad("Only admin can create driver access codes.", 403);
  }

  try {
    const body = (await request.json()) as {
      driverName?: string;
      driverEmail?: string;
      driverPhone?: string;
      role?: string;
      expiresAt?: string;
    };
    const driverName = body.driverName?.trim();
    if (!driverName) return bad("Driver name is required.");
    const created = await createDriverAccessCode({
      driverName,
      driverEmail: body.driverEmail,
      driverPhone: body.driverPhone,
      role: body.role || "driver",
      expiresAt: body.expiresAt,
      createdBy: session?.email,
    });
    return NextResponse.json({
      ok: true,
      accessCode: created.access,
      oneTimeCode: created.code,
    });
  } catch (error) {
    console.error("Could not create driver access code", error);
    return bad("Could not create driver access code.", 500);
  }
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "drivers:access-codes:patch", 20);
  if (limited) return limited;

  const { session, response } = requireAdmin(request);
  if (response) return response;
  if (!isFullAdminSession(request)) {
    return bad("Only admin can revoke driver access codes.", 403);
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      action?: "revoke";
    };
    const id = body.id?.trim();
    if (!id) return bad("Missing driver access code ID.");
    if (body.action !== "revoke") return bad("Unsupported driver access action.");

    const accessCode = await revokeDriverAccessCode({
      id,
      revokedBy: session?.email,
    });
    return NextResponse.json({ ok: true, accessCode });
  } catch (error) {
    console.error("Could not update driver access code", error);
    return bad("Could not update driver access code.", 500);
  }
}
