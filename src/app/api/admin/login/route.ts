import { NextResponse } from "next/server";
import {
  adminAuthConfigured,
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "admin:login", 8);
  if (limited) return limited;

  if (!adminAuthConfigured()) {
    return bad("Admin login is not configured.", 503);
  }

  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email ?? "";
    const password = body.password ?? "";

    if (!verifyAdminCredentials(email, password)) {
      return bad("Email or password is incorrect.", 401);
    }

    const response = NextResponse.json({
      ok: true,
      email: email.trim().toLowerCase(),
    });
    setAdminSessionCookie(response, createAdminSession(email));
    return response;
  } catch {
    return bad("Could not sign in.");
  }
}

