"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import DriverChrome from "@/components/DriverChrome";
import { AGENT_EVIDENCE_BUCKET, type AgentEvidenceType } from "@/lib/driver-onboarding-shared";
import {
  IDENTITY_CONSENT_DISCLOSURE,
  IDENTITY_CONSENT_VERSION,
} from "@/lib/identity-consent";
import { getSupabaseBrowser } from "@/lib/supabase-client";

const TOKEN_KEY = "travelyt:driver-onboarding-token";

type UploadRecord = {
  id: string;
  evidence_type: AgentEvidenceType;
  original_name: string;
  review_status: "pending" | "accepted" | "rejected";
  uploaded_at: string;
};

type OnboardingStatus = {
  driver: { name: string };
  expiresAt: string;
  identity: { status: string; verified_at: string | null };
  uploads: UploadRecord[];
};

const evidenceItems: Array<{
  type: AgentEvidenceType;
  title: string;
  description: string;
}> = [
  { type: "training", title: "Training evidence", description: "Completed Travelyt training record or signed checklist." },
  { type: "insurance", title: "Insurance evidence", description: "Current coverage document showing the applicable driver or vehicle." },
  { type: "vehicle_registration", title: "Vehicle registration", description: "Current registration for the vehicle used during service." },
  { type: "vehicle_photo", title: "Vehicle photo", description: "Clear exterior photo showing the service vehicle." },
];

export default function DriverOnboardingPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [files, setFiles] = useState<Partial<Record<AgentEvidenceType, File>>>({});
  const [working, setWorking] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);

  const loadStatus = useCallback(async (activeToken: string) => {
    if (!activeToken) return;
    const response = await fetch(`/api/driver-onboarding?token=${encodeURIComponent(activeToken)}`);
    const data = (await response.json()) as OnboardingStatus & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not open onboarding.");
    setStatus(data);
  }, []);

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get("token")?.trim() || "";
    const activeToken = queryToken || sessionStorage.getItem(TOKEN_KEY) || "";
    if (queryToken) sessionStorage.setItem(TOKEN_KEY, queryToken);
    setToken(activeToken);
    void loadStatus(activeToken).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not open onboarding.");
    });
  }, [loadStatus]);

  async function uploadEvidence(type: AgentEvidenceType) {
    const file = files[type];
    if (!file || !token) return;
    setWorking(type);
    setError("");
    setNotice("");
    try {
      const prepareResponse = await fetch("/api/driver-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_upload",
          token,
          evidenceType: type,
          originalName: file.name,
          contentType: file.type,
          byteSize: file.size,
        }),
      });
      const prepared = (await prepareResponse.json()) as {
        error?: string;
        filePath?: string;
        signedToken?: string;
        originalName?: string;
        contentType?: string;
        byteSize?: number;
      };
      if (!prepareResponse.ok || !prepared.filePath || !prepared.signedToken) {
        throw new Error(prepared.error || "Could not prepare upload.");
      }
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Private storage is not configured.");
      const { error: uploadError } = await supabase.storage
        .from(AGENT_EVIDENCE_BUCKET)
        .uploadToSignedUrl(prepared.filePath, prepared.signedToken, file, {
          contentType: file.type,
        });
      if (uploadError) throw uploadError;
      const completeResponse = await fetch("/api/driver-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete_upload",
          token,
          evidenceType: type,
          filePath: prepared.filePath,
          originalName: prepared.originalName,
          contentType: prepared.contentType,
          byteSize: prepared.byteSize,
        }),
      });
      const completed = (await completeResponse.json()) as { error?: string };
      if (!completeResponse.ok) throw new Error(completed.error || "Could not record upload.");
      setFiles((current) => ({ ...current, [type]: undefined }));
      setNotice("Evidence uploaded privately and marked pending review.");
      await loadStatus(token);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload evidence.");
    } finally {
      setWorking("");
    }
  }

  async function startIdentity() {
    if (!token) return;
    setWorking("identity");
    setError("");
    try {
      const response = await fetch("/api/driver-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_identity",
          token,
          signatureName,
          consentAccepted,
          consentVersion: IDENTITY_CONSENT_VERSION,
        }),
      });
      const data = (await response.json()) as { error?: string; status?: string; url?: string };
      if (!response.ok) throw new Error(data.error || "Could not start identity verification.");
      if (data.status === "verified") {
        setNotice("Identity verification is already complete.");
        await loadStatus(token);
        return;
      }
      if (!data.url) throw new Error("Secure identity verification did not return a link.");
      sessionStorage.setItem(TOKEN_KEY, token);
      window.location.href = data.url;
    } catch (identityError) {
      setError(identityError instanceof Error ? identityError.message : "Could not start identity verification.");
      setWorking("");
    }
  }

  if (error && !status) {
    return (
      <DriverChrome title="Driver onboarding">
        <div className="rounded-2xl bg-white p-6 shadow-sm shadow-navy/5">
          <h1 className="text-xl font-bold text-navy">Onboarding link unavailable</h1>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Link href="/driver" className="mt-4 inline-block text-sm font-bold text-[#ff6868] underline">Return to driver login</Link>
        </div>
      </DriverChrome>
    );
  }

  return (
    <DriverChrome title="Driver onboarding">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#ff6868]">Private onboarding</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{status?.driver.name || "Loading driver…"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-navy/65">
            Submit each item below. Uploads remain private and pending until Travelyt operations reviews them.
          </p>
        </div>

        {(error || notice) && (
          <div className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {error || notice}
          </div>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#ff6868]" />
            <h2 className="font-bold text-navy">Government ID + selfie</h2>
          </div>
          {status?.identity.status === "verified" ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Identity verified
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="rounded-xl bg-navy/[0.03] p-3 text-xs leading-relaxed text-navy/65">
                {IDENTITY_CONSENT_DISCLOSURE}
              </p>
              <label className="flex items-start gap-2 text-sm text-navy/75">
                <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} className="mt-1" />
                <span>I have read and agree to this identity and biometric disclosure.</span>
              </label>
              <input
                value={signatureName}
                onChange={(event) => setSignatureName(event.target.value)}
                placeholder="Legal name as electronic signature"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
              />
              <button type="button" onClick={() => void startIdentity()} disabled={working === "identity"} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {working === "identity" ? "Opening secure verification…" : "Start secure verification"}
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-3">
          {evidenceItems.map((item) => {
            const uploaded = status?.uploads.find((row) => row.evidence_type === item.type);
            return (
              <div key={item.type} className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-navy">{item.title}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-navy/55">{item.description}</p>
                  </div>
                  {uploaded && (
                    <span className="rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-bold text-yellow-800">{uploaded.review_status}</span>
                  )}
                </div>
                {uploaded && <p className="mt-3 text-xs text-navy/60">Latest: {uploaded.original_name}</p>}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(event) => setFiles((current) => ({ ...current, [item.type]: event.target.files?.[0] }))}
                    className="min-w-0 flex-1 text-sm text-navy/70 file:mr-3 file:rounded-lg file:border-0 file:bg-navy/5 file:px-3 file:py-2 file:text-xs file:font-bold file:text-navy"
                  />
                  <button
                    type="button"
                    onClick={() => void uploadEvidence(item.type)}
                    disabled={!files[item.type] || Boolean(working)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <FileUp className="h-4 w-4" /> {working === item.type ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {status?.expiresAt && (
          <p className="text-center text-xs text-navy/45">Private link expires {new Date(status.expiresAt).toLocaleString()}.</p>
        )}
      </div>
    </DriverChrome>
  );
}
