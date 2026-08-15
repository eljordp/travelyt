import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_ORIGINALS_BUCKET, type StoredOriginal } from "@/lib/identity-originals";

export type IdentityRetentionRow = {
  id: string;
  raw_document_paths: unknown;
  raw_retention_until: string | null;
  raw_purpose_ended_at: string | null;
  raw_legal_hold_at: string | null;
  raw_deletion_status: "not_applicable" | "scheduled" | "failed" | "destroyed";
  metadata: Record<string, unknown> | null;
};

function storedOriginals(value: unknown): StoredOriginal[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredOriginal => Boolean(
    item && typeof item === "object" &&
      typeof (item as StoredOriginal).path === "string" &&
      (item as StoredOriginal).path.trim(),
  ));
}
export function identityRetentionIsDue(row: IdentityRetentionRow, now = new Date()) {
  if (row.raw_legal_hold_at || row.raw_deletion_status === "destroyed") return false;
  const nowMs = now.getTime();
  const retentionDue = Boolean(
    row.raw_retention_until && Date.parse(row.raw_retention_until) <= nowMs,
  );
  const purposeEnded = Boolean(
    row.raw_purpose_ended_at && Date.parse(row.raw_purpose_ended_at) <= nowMs,
  );
  return retentionDue || purposeEnded;
}

export async function destroyIdentityOriginals(input: {
  supabase: SupabaseClient;
  row: IdentityRetentionRow;
  reason: "retention_expired" | "purpose_ended" | "account_deleted";
  now?: Date;
}) {
  if (input.row.raw_legal_hold_at) {
    return { ok: false as const, error: "Identity originals are under a documented legal hold." };
  }
  const now = input.now ?? new Date();
  const destroyedAt = now.toISOString();
  const originals = storedOriginals(input.row.raw_document_paths);
  const paths = [...new Set(originals.map((item) => item.path))];

  if (paths.length) {
    const { error: storageError } = await input.supabase.storage
      .from(IDENTITY_ORIGINALS_BUCKET)
      .remove(paths);
    if (storageError) {
      await input.supabase.from("identity_verifications").update({
        raw_deletion_status: "failed",
        raw_deletion_attempted_at: destroyedAt,
        raw_deletion_error: storageError.message.slice(0, 1000),
      }).eq("id", input.row.id);
      return { ok: false as const, error: storageError.message };
    }
  }

  const receipt = {
    destroyed_at: destroyedAt,
    reason: input.reason,
    bucket: IDENTITY_ORIGINALS_BUCKET,
    object_count: paths.length,
    object_path_hashes: paths.map((path) =>
      createHash("sha256").update(path).digest("hex")
    ),
  };
  const { error: updateError } = await input.supabase
    .from("identity_verifications")
    .update({
      raw_document_paths: [],
      raw_deletion_status: "destroyed",
      raw_deletion_attempted_at: destroyedAt,
      raw_destroyed_at: destroyedAt,
      raw_destruction_receipt: receipt,
      raw_deletion_error: null,
      raw_export_status: "none",
      metadata: {
        ...(input.row.metadata ?? {}),
        raw_document_stored_by_travelyt: false,
        raw_destroyed_at: destroyedAt,
        raw_destruction_reason: input.reason,
      },
    })
    .eq("id", input.row.id);
  if (updateError) {
    return {
      ok: false as const,
      error: `Files were removed but the destruction receipt could not be saved: ${updateError.message}`,
    };
  }
  return { ok: true as const, destroyed: paths.length, receipt };
}
