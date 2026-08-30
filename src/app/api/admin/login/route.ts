import { NextResponse } from "next/server";
import {
  adminAuthConfigured,
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminAccessToken,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import { recordAuthActivity } from "@/lib/auth-activity";
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
      accessToken?: string;
      email?: string;
      password?: string;
    };
    const accessToken = body.accessToken?.trim() ?? "";
    const email = body.email ?? "";
    const password = body.password ?? "";

    if (accessToken) {
      const verified = await verifyAdminAccessToken(accessToken);
      if (!verified) {
        return bad(
          "Complete two-factor verification with an authorized operations account.",
          401,
        );
      }
      await recordAuthActivity({
        userId: verified.userId,
        email: verified.email,
        eventType: "admin_login",
        authLevel: "aal2",
        role: verified.role,
      });
      const response = NextResponse.json({
        ok: true,
        email: verified.email,
        role: verified.role,
      });
      setAdminSessionCookie(
        response,
        createAdminSession({
          userId: verified.userId,
          email: verified.email,
          role: verified.role,
          authSource: "supabase",
          mfaFactorFingerprint: verified.mfaFactorFingerprint,
        }),
      );
      return response;
    }

    if (
      process.env.NODE_ENV === "production" &&
      process.env.TRAVELYT_ADMIN_BREAK_GLASS_ENABLED !== "true"
    ) {
      return bad(
        "Use the verified Travelyt account sign-in and authenticator.",
        401,
      );
    }

    const role = verifyAdminCredentials(email, password);
    if (!role) {
      return bad(
        "Email/password is incorrect.",
        401
      );
    }

    const response = NextResponse.json({
      ok: true,
      email: email.trim().toLowerCase(),
      role,
    });
    setAdminSessionCookie(
      response,
      createAdminSession({
        email,
        role,
        authSource: "break_glass",
      }),
    );
    return response;
  } catch {
    return bad("Could not sign in.");
  }
}
