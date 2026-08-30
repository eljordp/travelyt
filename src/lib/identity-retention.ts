import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_ORIGINALS_BUCKET, type StoredOriginal } from "@/lib/identity-originals";
import { getStripeForLivemode } from "@/lib/stripe-server";

export type IdentityRetentionRow = {
  id: string;
  raw_document_paths: unknown;
  raw_retention_until: string | null;
  raw_purpose_ended_at: string | null;
  raw_legal_hold_at: string | null;
  raw_deletion_status: "not_applicable" | "scheduled" | "failed" | "destroyed";
  provider_session_id: string | null;
  provider_session_livemode: boolean | null;
  provider_redaction_status:
    | "not_requested"
    | "requesting"
    | "processing"
    | "outcome_unknown"
    | "redacted"
    | "failed";
  provider_redaction_claim_token: string | null;
  provider_redaction_claimed_at: string | null;
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

function retainedStripeLivemode(
  row: Pick<IdentityRetentionRow, "metadata" | "provider_session_livemode">,
) {
  if (typeof row.provider_session_livemode === "boolean") {
    return row.provider_session_livemode;
  }
  const value = row.metadata?.stripe_livemode;
  return typeof value === "boolean" ? value : null;
}

export async function requestIdentityProviderRedaction(input: {
  supabase: SupabaseClient;
  row: Pick<
    IdentityRetentionRow,
    "id" | "provider_session_id" | "provider_session_livemode" |
      "provider_redaction_status" | "metadata"
  >;
  deletionClaimToken?: string;
  reason?: "retention_expired" | "purpose_ended" | "account_deleted";
}) {
  if (
    !input.row.provider_session_id ||
    input.row.provider_redaction_status === "redacted"
  ) {
    return { ok: true as const, status: input.row.provider_redaction_status };
  }
  const livemode = retainedStripeLivemode(input.row);
  if (livemode === null) {
    return { ok: false as const, error: "Identity provider mode is missing; manual privacy review is required." };
  }
  const stripe = getStripeForLivemode(livemode);
  if (!stripe) {
    return { ok: false as const, error: `Stripe Identity ${livemode ? "live" : "test"} redaction is not configured.` };
  }
  const claimToken = randomUUID();
  const { data: claimedData, error: claimError } = await input.supabase.rpc(
    "claim_identity_provider_redaction",
    {
      p_identity_id: input.row.id,
      p_claim_token: claimToken,
      p_raw_deletion_claim_token: input.deletionClaimToken ?? null,
      p_reason: input.reason ?? "purpose_ended",
    },
  );
  const claimed = claimedData as IdentityRetentionRow | null;
  if (claimError || !claimed) {
    return {
      ok: false as const,
      error: claimError?.message || "Identity provider redaction could not be safely claimed.",
    };
  }
  if (!claimed.provider_session_id || claimed.provider_redaction_status === "redacted") {
    return { ok: true as const, status: "redacted" as const };
  }
  const providerSessionId = claimed.provider_session_id;
  const recordOutcome = async (
    outcome: "processing" | "redacted" | "outcome_unknown" | "failed",
    error: string | null,
  ) => input.supabase.rpc("record_identity_provider_redaction_result", {
    p_identity_id: input.row.id,
    p_claim_token: claimToken,
    p_provider_session_id: providerSessionId,
    p_outcome: outcome,
    p_error: error,
    p_event_id: null,
  });
  try {
    const providerSession = await stripe.identity.verificationSessions.redact(
      providerSessionId,
      {},
      { idempotencyKey: `travelyt-identity-redact:${input.row.id}:${providerSessionId}` },
    );
    const providerStatus: "redacted" | "processing" =
      providerSession.redaction?.status === "redacted"
      ? "redacted"
      : "processing";
    const { data: recorded, error: recordError } = await recordOutcome(
      providerStatus,
      null,
    );
    if (recordError || recorded !== true) {
      throw new Error(
        recordError?.message || "Provider redaction receipt could not be recorded.",
      );
    }
    return { ok: true as const, status: providerStatus };
  } catch (error) {
    const providerError = error instanceof Error ? error.message : "Provider redaction failed.";
    await recordOutcome("outcome_unknown", providerError.slice(0, 1000));
    return { ok: false as const, error: providerError };
  }
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
  const claimToken = randomUUID();

  // The database claim serializes archive, legal-hold, and deletion work and
  // returns the post-lock path set. Never delete from the caller's stale queue
  // snapshot.
  const { data: claimedData, error: claimError } = await input.supabase.rpc(
    "claim_identity_original_destruction",
    {
      p_identity_id: input.row.id,
      p_claim_token: claimToken,
      p_purpose_ended_at: input.row.raw_purpose_ended_at || destroyedAt,
      p_reason: input.reason,
    },
  );
  const claimed = claimedData as IdentityRetentionRow | null;
  if (claimError || !claimed) {
    return {
      ok: false as const,
      error: claimError?.message || "Identity evidence could not be safely claimed for destruction.",
    };
  }
  const providerRedaction = await requestIdentityProviderRedaction({
    supabase: input.supabase,
    row: claimed,
    deletionClaimToken: claimToken,
    reason: input.reason,
  });
  if (!providerRedaction.ok) {
    await input.supabase.rpc("finalize_identity_original_destruction", {
      p_identity_id: input.row.id,
      p_claim_token: claimToken,
      p_succeeded: false,
      p_receipt: {},
      p_error: providerRedaction.error,
      p_metadata: {},
    });
    return providerRedaction;
  }
  // Always delete the paths returned by the claim, never paths from the
  // caller's earlier queue snapshot. A reconciliation may have archived a new
  // object between that snapshot and this claim.
  const originals = storedOriginals(claimed.raw_document_paths);
  const paths = new Set(originals.map((item) => item.path));

  // Sweep the deterministic verification prefix as a defense against any
  // partial archive created before durable archive claims existed.
  const { data: prefixObjects, error: prefixError } = await input.supabase.storage
    .from(IDENTITY_ORIGINALS_BUCKET)
    .list(input.row.id, { limit: 1000 });
  if (prefixError) {
    await input.supabase.rpc("finalize_identity_original_destruction", {
      p_identity_id: input.row.id,
      p_claim_token: claimToken,
      p_succeeded: false,
      p_receipt: {},
      p_error: prefixError.message,
      p_metadata: {},
    });
    return { ok: false as const, error: prefixError.message };
  }
  for (const object of prefixObjects ?? []) {
    if (object.name && object.name !== ".emptyFolderPlaceholder") {
      paths.add(`${input.row.id}/${object.name}`);
    }
  }
  const deletionPaths = [...paths];

  if (deletionPaths.length) {
    const { error: storageError } = await input.supabase.storage
      .from(IDENTITY_ORIGINALS_BUCKET)
      .remove(deletionPaths);
    if (storageError) {
      const { data: failureReceipt, error: failureReceiptError } = await input.supabase.rpc(
        "finalize_identity_original_destruction",
        {
          p_identity_id: input.row.id,
          p_claim_token: claimToken,
          p_succeeded: false,
          p_receipt: {},
          p_error: storageError.message,
          p_metadata: {},
        },
      );
      if (failureReceiptError || failureReceipt !== true) {
        return {
          ok: false as const,
          error:
            failureReceiptError?.message ||
            "Identity evidence changed while deletion failed; the recorded evidence must be reconciled before retrying.",
        };
      }
      return { ok: false as const, error: storageError.message };
    }
  }

  const receipt = {
    destroyed_at: destroyedAt,
    reason: input.reason,
    bucket: IDENTITY_ORIGINALS_BUCKET,
    object_count: deletionPaths.length,
    object_path_hashes: deletionPaths.map((path) =>
      createHash("sha256").update(path).digest("hex")
    ),
  };
  const { data: updated, error: updateError } = await input.supabase.rpc(
    "finalize_identity_original_destruction",
    {
      p_identity_id: input.row.id,
      p_claim_token: claimToken,
      p_succeeded: true,
      p_receipt: receipt,
      p_error: null,
      p_metadata: {
        raw_document_stored_by_travelyt: false,
        raw_destruction_started_at: destroyedAt,
        raw_destroyed_at: destroyedAt,
        raw_destruction_reason: input.reason,
      },
    },
  );
  if (updateError || updated !== true) {
    return {
      ok: false as const,
      error: updateError
        ? `Files were removed but the destruction receipt could not be saved: ${updateError.message}`
        : "Identity evidence changed during destruction; the current deletion record must be reconciled before retrying.",
    };
  }
  return { ok: true as const, destroyed: deletionPaths.length, receipt };
}
