import { NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await getVerifiedAdminSession(request);
  return NextResponse.json({
    ok: true,
    authenticated: Boolean(session),
    email: session?.email,
    role: session?.role,
  });
}
