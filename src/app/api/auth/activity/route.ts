import { NextResponse } from "next/server";
import { trustedUserRole } from "@/lib/auth-policy";
import { recordAuthActivity } from "@/lib/auth-activity";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth:activity", 20);
  if (limited) return limited;

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Verified account session required." }, { status: 401 });
  }

  const role = trustedUserRole(user);
  if (role !== "customer") {
    return NextResponse.json(
      { ok: false, error: "Operations logins are recorded after MFA." },
      { status: 403 },
    );
  }

  const result = await recordAuthActivity({
    userId: user.id,
    email: user.email ?? null,
    eventType: "customer_login",
    authLevel: "aal1",
    role,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "Authentication activity is temporarily unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
