import { NextResponse } from "next/server";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import {
  destroyIdentityOriginals,
  type IdentityRetentionRow,
} from "@/lib/identity-retention";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Account backend is not configured.", 503);

  const user = await getRequestUser(request);
  if (!user) return bad("Sign in again before deleting your account.", 401);

  const { data: identityRows, error: identityError } = await supabase
    .from("identity_verifications")
    .select("id, raw_document_paths, raw_retention_until, raw_purpose_ended_at, raw_legal_hold_at, raw_deletion_status, metadata")
    .eq("user_id", user.id);
  if (identityError) {
    console.error("Could not load identity originals before account deletion", identityError);
    return bad("Could not verify identity-record deletion readiness.", 500);
  }
  const rows = (identityRows ?? []) as IdentityRetentionRow[];
  if (rows.some((row) => row.raw_legal_hold_at)) {
    return bad("Account deletion requires privacy review because an identity record is under legal hold.", 409);
  }
  for (const row of rows) {
    const hasOriginals = Array.isArray(row.raw_document_paths) && row.raw_document_paths.length > 0;
    if (!hasOriginals || row.raw_deletion_status === "destroyed") continue;
    const destruction = await destroyIdentityOriginals({
      supabase,
      row,
      reason: "account_deleted",
    });
    if (!destruction.ok) {
      console.error("Identity original destruction failed before account deletion", destruction.error);
      return bad("Could not delete the account because stored identity images were not destroyed.", 502);
    }
  }

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Supabase account deletion failed", error);
    return bad("Could not delete account.", 500);
  }

  return NextResponse.json({ ok: true });
}
