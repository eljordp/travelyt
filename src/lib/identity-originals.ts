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

export function identityArchiveComplete(outcome: ArchiveOutcome | null | undefined) {
  if (!outcome) return false;
  const hasDocument = outcome.paths.some((item) => item.kind === "document");
  const hasSelfie = outcome.paths.some((item) => item.kind === "selfie");
  return hasDocument && hasSelfie;
}

async function downloadStripeFile(fileId: string) {
  const restrictedKey = process.env.STRIPE_IDENTITY_RESTRICTED_KEY;
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
