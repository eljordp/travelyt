import { createHash, randomUUID } from "crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_RETENTION_YEARS } from "@/lib/identity-consent";
import { getStripeIdentityRestrictedKeyForLivemode } from "@/lib/stripe-server";

export const IDENTITY_ORIGINALS_BUCKET = "identity-originals";

// Retention: 3 years from storage or until the verification purpose ends,
// whichever comes first. Mirrors the disclosure shown at capture time.
export type StoredOriginal = {
  kind: "document" | "selfie" | "selfie_document";
  path: string;
  fileId: string;
  contentType: string;
  bytes: number;
};

export type ArchiveOutcome = {
  claimToken: string;
  stored: number;
  paths: StoredOriginal[];
  storedAt: string;
  retentionUntil: string;
};

export async function discardIdentityOriginalArchive(input: {
  supabase: SupabaseClient;
  verificationId: string;
  claimToken: string;
  paths: StoredOriginal[];
  reason: string;
}) {
  const objectPaths = [...new Set(input.paths.map((item) => item.path))];
  const { data: cleanupDisposition, error: cleanupClaimError } = await input.supabase.rpc(
    "claim_incomplete_identity_archive_cleanup",
    {
      p_identity_id: input.verificationId,
      p_archive_claim_token: input.claimToken,
      p_paths: input.paths,
      p_reason: input.reason,
    },
  );
  if (cleanupClaimError || !cleanupDisposition) {
    return {
      ok: false as const,
      error:
        cleanupClaimError?.message ||
        "Identity archive cleanup could not obtain a protected destruction decision.",
    };
  }
  if (cleanupDisposition === "held") {
    return { ok: true as const, held: true as const };
  }
  if (cleanupDisposition !== "delete") {
    return { ok: false as const, error: "Identity archive cleanup returned an invalid decision." };
  }
  const cleanupError = objectPaths.length
    ? (await input.supabase.storage
        .from(IDENTITY_ORIGINALS_BUCKET)
        .remove(objectPaths)).error
    : null;
  const attemptedAt = new Date().toISOString();
  const { data: finalized, error: finalizeError } = await input.supabase.rpc(
    "finalize_identity_original_destruction",
    {
      p_identity_id: input.verificationId,
      p_claim_token: input.claimToken,
      p_succeeded: !cleanupError,
      p_receipt: cleanupError
        ? {}
        : {
            destroyed_at: attemptedAt,
            reason: "incomplete_identity_archive",
            bucket: IDENTITY_ORIGINALS_BUCKET,
            object_count: objectPaths.length,
            object_path_hashes: objectPaths.map((path) =>
              // Receipts retain proof without retaining sensitive object names.
              createHash("sha256").update(path).digest("hex")
            ),
          },
      p_error: cleanupError?.message ?? null,
      p_metadata: {
        raw_document_stored_by_travelyt: false,
        raw_destroyed_at: cleanupError ? null : attemptedAt,
        raw_destruction_reason: "incomplete_identity_archive",
      },
    },
  );
  if (finalizeError || finalized !== true) {
    return {
      ok: false as const,
      error:
        finalizeError?.message ||
        "Identity archive cleanup could not finalize its protected destruction receipt.",
    };
  }
  if (cleanupError) {
    return { ok: false as const, error: cleanupError.message };
  }
  return { ok: true as const };
}

export function identityArchiveComplete(outcome: ArchiveOutcome | null | undefined) {
  if (!outcome) return false;
  const hasDocument = outcome.paths.some((item) => item.kind === "document");
  const hasSelfie = outcome.paths.some((item) => item.kind === "selfie");
  return hasDocument && hasSelfie;
}

async function downloadStripeFile(fileId: string, livemode: boolean) {
  const restrictedKey = getStripeIdentityRestrictedKeyForLivemode(livemode);
  if (!restrictedKey) {
    throw new Error("Stripe Identity image access is not configured.");
  }

  // Stripe requires a restricted key for sensitive Identity images. Create a
  // short-lived FileLink and consume it server-side immediately; standard
  // secret keys receive 403 for these file contents.
  const linkResponse = await fetch("https://api.stripe.com/v1/file_links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restrictedKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      file: fileId,
      expires_at: String(Math.floor(Date.now() / 1000) + 30),
    }),
  });
  if (!linkResponse.ok) {
    throw new Error(`Stripe FileLink creation failed (${linkResponse.status}).`);
  }
  const link = (await linkResponse.json()) as { url?: string };
  if (!link.url) {
    throw new Error("Stripe FileLink did not include a download URL.");
  }

  const response = await fetch(link.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Stripe Identity image download failed (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

function fileIdOf(value: string | Stripe.File | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

// Copies the original capture images (ID document sides + selfie) from Stripe
// into Travelyt's private identity-originals bucket, unmodified.
export async function archiveIdentityOriginals(input: {
  stripe: Stripe;
  supabase: SupabaseClient;
  verificationId: string;
  session: Stripe.Identity.VerificationSession;
}): Promise<ArchiveOutcome> {
  const claimToken = randomUUID();
  const { data: claimed, error: claimError } = await input.supabase.rpc(
    "claim_identity_original_archive",
    { p_identity_id: input.verificationId, p_claim_token: claimToken },
  );
  if (claimError || claimed !== true) {
    throw new Error(
      claimError?.message ||
      "Identity original archive could not start because deletion or another archive is in progress.",
    );
  }
  const reportRef = input.session.last_verification_report;
  const reportId = typeof reportRef === "string" ? reportRef : reportRef?.id;
  const now = new Date();
  const retentionUntil = new Date(now);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + IDENTITY_RETENTION_YEARS);
  const outcome: ArchiveOutcome = {
    claimToken,
    stored: 0,
    paths: [],
    storedAt: now.toISOString(),
    retentionUntil: retentionUntil.toISOString(),
  };
  try {
    if (!reportId) {
      const discarded = await discardIdentityOriginalArchive({
        supabase: input.supabase,
        verificationId: input.verificationId,
        claimToken,
        paths: outcome.paths,
        reason: "Stripe Identity did not return a verification report.",
      });
      if (!discarded.ok) throw new Error(discarded.error);
      return outcome;
    }

    const report =
      typeof reportRef === "object" && reportRef !== null && "id" in reportRef
        ? reportRef
        : await input.stripe.identity.verificationReports.retrieve(reportId);

    const candidates: Array<{ kind: StoredOriginal["kind"]; fileId: string | null }> = [
      ...(report.document?.files ?? []).map((file) => ({
        kind: "document" as const,
        fileId: fileIdOf(file),
      })),
      { kind: "selfie_document", fileId: fileIdOf(report.selfie?.document) },
      { kind: "selfie", fileId: fileIdOf(report.selfie?.selfie) },
    ];

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate.fileId || seen.has(candidate.fileId)) continue;
      seen.add(candidate.fileId);
      const { bytes, contentType } = await downloadStripeFile(
        candidate.fileId,
        input.session.livemode,
      );
      const extension = contentType.includes("png") ? "png" : "jpg";
      const path = `${input.verificationId}/${candidate.kind}-${candidate.fileId}.${extension}`;
      const { error } = await input.supabase.storage
        .from(IDENTITY_ORIGINALS_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Identity original upload failed for ${path}: ${error.message}`);
      outcome.paths.push({
        kind: candidate.kind,
        path,
        fileId: candidate.fileId,
        contentType,
        bytes: bytes.length,
      });
    }
    outcome.stored = outcome.paths.length;
    if (!identityArchiveComplete(outcome)) {
      const discarded = await discardIdentityOriginalArchive({
        supabase: input.supabase,
        verificationId: input.verificationId,
        claimToken,
        paths: outcome.paths,
        reason: "Stripe Identity did not return both a document image and a selfie.",
      });
      if (!discarded.ok) throw new Error(discarded.error);
      outcome.paths = [];
      outcome.stored = 0;
    }
    return outcome;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Identity archive failed.";
    const discarded = await discardIdentityOriginalArchive({
      supabase: input.supabase,
      verificationId: input.verificationId,
      claimToken,
      paths: outcome.paths,
      reason,
    });
    if (!discarded.ok) {
      throw new Error(`${reason} Cleanup also failed: ${discarded.error}`);
    }
    throw error;
  }
}
