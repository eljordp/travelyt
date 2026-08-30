import { NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  revokeAdminSessionsForRequest,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  const revoked = await revokeAdminSessionsForRequest(request);
  const response = NextResponse.json({ ok: true, revoked });
  clearAdminSessionCookie(response);
  return response;
}
