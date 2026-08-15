import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  destroyIdentityOriginals,
  identityRetentionIsDue,
  type IdentityRetentionRow,
} from "@/lib/identity-retention";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Retention worker authorization failed." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Identity backend is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("identity_verifications")
    .select("id, raw_document_paths, raw_retention_until, raw_purpose_ended_at, raw_legal_hold_at, raw_deletion_status, metadata")
    .in("raw_deletion_status", ["scheduled", "failed"])
    .is("raw_legal_hold_at", null)
    .order("raw_retention_until", { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load identity-retention queue." }, { status: 500 });
  }

  const now = new Date();
  const due = ((data ?? []) as IdentityRetentionRow[]).filter((row) =>
    identityRetentionIsDue(row, now)
  );
  const results = [];
  for (const row of due) {
    const reason = row.raw_purpose_ended_at && Date.parse(row.raw_purpose_ended_at) <= now.getTime()
      ? "purpose_ended" as const
      : "retention_expired" as const;
    const result = await destroyIdentityOriginals({ supabase, row, reason, now });
    results.push({ id: row.id, ...result });
  }

  const failed = results.filter((result) => !result.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    scanned: data?.length ?? 0,
    due: due.length,
    destroyed: results.filter((result) => result.ok).length,
    failed: failed.length,
  }, { status: failed.length ? 207 : 200 });
}
