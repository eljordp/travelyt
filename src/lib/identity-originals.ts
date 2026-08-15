import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_RETENTION_YEARS } from "@/lib/identity-consent";

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
  stored: number;
  paths: StoredOriginal[];
  storedAt: string;
  retentionUntil: string;
};

async function downloadStripeFile(fileId: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://files.stripe.com/v1/files/${fileId}/contents`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) {
    throw new Error(`Stripe file ${fileId} download failed (${response.status}).`);
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
  const reportRef = input.session.last_verification_report;
  const reportId = typeof reportRef === "string" ? reportRef : reportRef?.id;
  const now = new Date();
  const retentionUntil = new Date(now);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + IDENTITY_RETENTION_YEARS);
  const outcome: ArchiveOutcome = {
    stored: 0,
    paths: [],
    storedAt: now.toISOString(),
    retentionUntil: retentionUntil.toISOString(),
  };
  if (!reportId) return outcome;

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
    const { bytes, contentType } = await downloadStripeFile(candidate.fileId);
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
  return outcome;
}
