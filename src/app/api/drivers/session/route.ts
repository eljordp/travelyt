import { NextResponse } from "next/server";
import {
  clearDriverSessionCookie,
  createDriverSession,
  getDriverSession,
  setDriverSessionCookie,
  verifyDriverCredentials,
} from "@/lib/driver-access-server";
import { rateLimit } from "@/lib/rate-limit";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function driverProfile(driver: ReturnType<typeof getDriverSession>) {
  return {
    name: driver.driverName,
    email: driver.driverEmail,
    phone: driver.driverPhone,
    role: driver.driverRole || "driver",
    accessId: driver.driverAccessId,
  };
}

export async function GET(request: Request) {
  const session = getDriverSession(request);
  return NextResponse.json({
    ok: true,
    authenticated: session.ok,
    driver: session.ok ? driverProfile(session) : null,
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "drivers:session", 12);
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      driverName?: string;
      accessCode?: string;
    };
    const verified = await verifyDriverCredentials(
      body.driverName ?? "",
      body.accessCode ?? ""
    );

    if (!verified.ok) {
      return bad(verified.error || "Driver name or access code is incorrect.", 401);
    }

    const session = createDriverSession(verified);
    if (!session) return bad("Driver session is not configured.", 503);

    const response = NextResponse.json({
      ok: true,
      driver: driverProfile(verified),
    });
    setDriverSessionCookie(response, session);
    return response;
  } catch {
    return bad("Could not open driver session.");
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearDriverSessionCookie(response);
  return response;
}
