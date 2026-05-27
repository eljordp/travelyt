import { NextResponse } from "next/server";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Account backend is not configured.", 503);

  const user = await getRequestUser(request);
  if (!user) return bad("Sign in again before deleting your account.", 401);

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Supabase account deletion failed", error);
    return bad("Could not delete account.", 500);
  }

  return NextResponse.json({ ok: true });
}
