import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = getAdminSession(request);
  return NextResponse.json({
    ok: true,
    authenticated: Boolean(session),
    email: session?.email,
  });
}

