"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import DriverChrome from "@/components/DriverChrome";
import { AGENT_EVIDENCE_BUCKET, type AgentEvidenceType } from "@/lib/driver-onboarding-shared";
import {
  DRIVER_TRAINING_MODULES,
  DRIVER_TRAINING_QUESTIONS,
  DRIVER_TRAINING_VERSION,
} from "@/lib/driver-training";
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
  accessMode: "invite" | "driver_session";
  expiresAt: string | null;
  identity: { status: string; verified_at: string | null };
  training: {
    training_version: string;
    score: number;
    passed: boolean;
    review_status: "pending" | "accepted" | "rejected";
    completed_at: string;
  } | null;
  uploads: UploadRecord[];
  progress: {
    documentsComplete: boolean;
    identityComplete: boolean;
    trainingComplete: boolean;
    submitted: boolean;
  };
};

const evidenceItems: Array<{
  type: AgentEvidenceType;
  title: string;
  description: string;
}> = [
  { type: "insurance", title: "Insurance evidence", description: "Current coverage document showing the applicable driver or vehicle." },
  { type: "vehicle_registration", title: "Vehicle registration", description: "Current registration for the vehicle used during service." },
  { type: "vehicle_photo", title: "Vehicle photo", description: "Clear exterior photo showing the service vehicle." },
];

function ProgressPill({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${complete ? "bg-green-100 text-green-800" : "bg-white text-navy/60"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${complete ? "bg-green-700 text-white" : "bg-navy/10 text-navy/55"}`}>
        {complete ? "✓" : "•"}
      </span>
      {label}
    </div>
  );
}

function randomizedQuizOrder() {
  return Object.fromEntries(
    DRIVER_TRAINING_QUESTIONS.map((question) => {
      const ids = question.options.map((option) => option.id);
      for (let index = ids.length - 1; index > 0; index -= 1) {
        const random = new Uint32Array(1);
        globalThis.crypto.getRandomValues(random);
        const swapIndex = random[0] % (index + 1);
        [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
      }
      return [question.id, ids];
    })
  ) as Record<string, string[]>;
}

export default function DriverOnboardingPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [files, setFiles] = useState<Partial<Record<AgentEvidenceType, File>>>({});
  const [working, setWorking] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [trainingSignature, setTrainingSignature] = useState("");
  const [acknowledgments, setAcknowledgments] = useState<Record<string, boolean>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizOrder, setQuizOrder] = useState<Record<string, string[]>>({});

  const requestBody = useCallback((input: Record<string, unknown>) => ({
    ...input,
    ...(token ? { token } : {}),
  }), [token]);

  const loadStatus = useCallback(async (activeToken = "") => {
    const query = activeToken ? `?token=${encodeURIComponent(activeToken)}` : "";
    const response = await fetch(`/api/driver-onboarding${query}`, { credentials: "same-origin" });
    const data = (await response.json()) as OnboardingStatus & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not open onboarding.");
    setStatus(data);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("token")?.trim() || "";
    const identityReturn = params.get("identity") === "return";
    const activeToken = queryToken || (identityReturn ? sessionStorage.getItem(TOKEN_KEY) || "" : "");
    if (queryToken) sessionStorage.setItem(TOKEN_KEY, queryToken);
    if (!queryToken && !identityReturn) sessionStorage.removeItem(TOKEN_KEY);
    setToken(activeToken);
    setQuizOrder(randomizedQuizOrder());
    void loadStatus(activeToken).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not open onboarding.");
    });
  }, [loadStatus]);

  const completedSteps = useMemo(() => {
    if (!status) return 0;
    return [
      status.progress.documentsComplete,
      status.progress.identityComplete,
      status.progress.trainingComplete,
      status.progress.submitted,
    ].filter(Boolean).length;
  }, [status]);

  async function uploadEvidence(type: AgentEvidenceType) {
    const file = files[type];
    if (!file) return;
    setWorking(type);
    setError("");
    setNotice("");
    try {
      const prepareResponse = await fetch("/api/driver-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(requestBody({
          action: "prepare_upload",
          evidenceType: type,
          originalName: file.name,
          contentType: file.type,
          byteSize: file.size,
        })),
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
        credentials: "same-origin",
        body: JSON.stringify(requestBody({
          action: "complete_upload",
          evidenceType: type,
          filePath: prepared.filePath,
          originalName: prepared.originalName,
          contentType: prepared.contentType,
          byteSize: prepared.byteSize,
        })),
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
    setWorking("identity");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/driver-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(requestBody({
          action: "start_identity",
          signatureName,
          consentAccepted,
          consentVersion: IDENTITY_CONSENT_VERSION,
        })),
      });
      const data = (await response.json()) as { error?: string; status?: string; url?: string };
      if (!response.ok) throw new Error(data.error || "Could not start identity verification.");
      if (data.status === "verified") {
        setNotice("Identity verification is already complete.");
        await loadStatus(token);
        return;
      }
      if (!data.url) throw new Error("Secure identity verification did not return a link.");
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      window.location.href = data.url;
    } catch (identityError) {
      setError(identityError instanceof Error ? identityError.message : "Could not start identity verification.");
      setWorking("");
    }
  }

  async function completeTraining() {
    setWorking("training");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/driver-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(requestBody({
          action: "complete_training",
          acknowledgments,
          quizAnswers,
          signatureName: trainingSignature,
          trainingVersion: DRIVER_TRAINING_VERSION,
        })),
      });
      const data = (await response.json()) as { error?: string; message?: string; score?: number };
      if (!response.ok) {
        if (typeof data.score === "number") {
          setQuizAnswers({});
          setQuizOrder(randomizedQuizOrder());
        }
        throw new Error(data.error || "Could not record training completion.");
      }
      setNotice(data.message || "Training completion recorded for review.");
      await loadStatus(token);
    } catch (trainingError) {
      setError(trainingError instanceof Error ? trainingError.message : "Could not record training completion.");
    } finally {
      setWorking("");
    }
  }

  if (!status && !error) {
    return (
      <DriverChrome title="Driver onboarding">
        <div className="rounded-2xl bg-white p-6 shadow-sm shadow-navy/5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#ff6868]">Driver onboarding</p>
          <h1 className="mt-2 text-xl font-bold text-navy">Opening your private readiness path…</h1>
          <p className="mt-2 text-sm text-navy/60">Checking your driver session and current completion status.</p>
        </div>
      </DriverChrome>
    );
  }

  if (error && !status) {
    return (
      <DriverChrome title="Driver onboarding">
        <div className="rounded-2xl bg-white p-6 shadow-sm shadow-navy/5">
          <h1 className="text-xl font-bold text-navy">Driver sign-in required</h1>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <Link href="/driver" className="mt-4 inline-block text-sm font-bold text-[#ff6868] underline">Enter your driver access code</Link>
        </div>
      </DriverChrome>
    );
  }

  return (
    <DriverChrome title="Driver onboarding">
      <div className="space-y-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-wider text-[#ff6868]">Self-serve driver onboarding</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{status?.driver.name || "Loading driver…"}</h1>
          <p className="mt-2 text-sm leading-relaxed text-navy/65">
            Complete the four steps below. Your evidence stays private and nothing here activates you for live custody without operations review.
          </p>
        </header>

        <section className="rounded-2xl bg-navy/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-navy/55">Onboarding progress</p>
            <p className="text-xs font-bold text-navy">{completedSteps}/4</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <ProgressPill complete={status?.progress.documentsComplete ?? false} label="1. Documents" />
            <ProgressPill complete={status?.progress.identityComplete ?? false} label="2. ID + selfie" />
            <ProgressPill complete={status?.progress.trainingComplete ?? false} label="3. Training" />
            <ProgressPill complete={status?.progress.submitted ?? false} label="4. Review queue" />
          </div>
        </section>

        {(error || notice) && (
          <div className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {error || notice}
          </div>
        )}

        <section className="space-y-3 rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
          <div className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-[#ff6868]" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-navy/45">Step 1</p>
              <h2 className="font-bold text-navy">Driver and vehicle documents</h2>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-navy/55">Upload PDF, JPG, PNG, or WebP files up to 10 MB. Rejected evidence must be replaced.</p>
          <div className="grid gap-3">
            {evidenceItems.map((item) => {
              const uploaded = status?.uploads.find((row) => row.evidence_type === item.type);
              return (
                <div key={item.type} className="rounded-xl bg-navy/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-navy">{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-navy/55">{item.description}</p>
                    </div>
                    {uploaded && (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${uploaded.review_status === "rejected" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-800"}`}>
                        {uploaded.review_status}
                      </span>
                    )}
                  </div>
                  {uploaded && <p className="mt-2 text-xs text-navy/60">Latest: {uploaded.original_name}</p>}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) => setFiles((current) => ({ ...current, [item.type]: event.target.files?.[0] }))}
                      className="min-w-0 flex-1 text-sm text-navy/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-navy"
                    />
                    <button
                      type="button"
                      onClick={() => void uploadEvidence(item.type)}
                      disabled={!files[item.type] || Boolean(working)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                    >
                      <FileUp className="h-4 w-4" /> {working === item.type ? "Uploading…" : uploaded ? "Replace" : "Upload"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#ff6868]" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-navy/45">Step 2</p>
              <h2 className="font-bold text-navy">Government ID + selfie</h2>
            </div>
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

        <section className="space-y-4 rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-[#ff6868]" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-navy/45">Step 3 · {DRIVER_TRAINING_VERSION}</p>
              <h2 className="font-bold text-navy">Foundational custody training</h2>
            </div>
          </div>

          {status?.training?.passed ? (
            <div className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
              <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" /> Knowledge check passed: {status.training.score}%</p>
              <p className="mt-1 text-xs">Completed {new Date(status.training.completed_at).toLocaleString()} · {status.training.review_status} review</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-900">
                This module teaches the Travelyt custody process. It does not authorize airline acceptance, certify insurance, replace a background check, or replace an observed physical drill.
              </div>
              <div className="grid gap-3">
                {DRIVER_TRAINING_MODULES.map((module) => (
                  <article key={module.id} className="rounded-xl bg-navy/[0.025] p-4">
                    <h3 className="text-sm font-bold text-navy">{module.title}</h3>
                    <p className="mt-1 text-xs font-semibold text-navy/60">{module.summary}</p>
                    <ul className="mt-3 space-y-2 text-xs leading-relaxed text-navy/70">
                      {module.points.map((point) => <li key={point}>• {point}</li>)}
                    </ul>
                    <label className="mt-4 flex items-start gap-2 rounded-lg bg-white p-3 text-xs font-semibold text-navy/75">
                      <input
                        type="checkbox"
                        checked={acknowledgments[module.id] ?? false}
                        onChange={(event) => setAcknowledgments((current) => ({ ...current, [module.id]: event.target.checked }))}
                        className="mt-0.5"
                      />
                      I reviewed this module and understand the required stop points.
                    </label>
                  </article>
                ))}
              </div>

              <div className="rounded-xl border border-navy/10 p-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-[#ff6868]" />
                  <h3 className="font-bold text-navy">Knowledge check · 100% required</h3>
                </div>
                <div className="mt-4 space-y-5">
                  {DRIVER_TRAINING_QUESTIONS.map((question, index) => (
                    <fieldset key={question.id}>
                      <legend className="text-sm font-bold text-navy">{index + 1}. {question.prompt}</legend>
                      <div className="mt-2 grid gap-2">
                        {[...question.options]
                          .sort((left, right) => {
                            const order = quizOrder[question.id] ?? [];
                            return order.indexOf(left.id) - order.indexOf(right.id);
                          })
                          .map((option) => (
                          <label key={option.id} className="flex items-start gap-2 rounded-lg bg-navy/[0.025] p-3 text-xs text-navy/75">
                            <input
                              type="radio"
                              name={question.id}
                              value={option.id}
                              checked={quizAnswers[question.id] === option.id}
                              onChange={(event) => setQuizAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                              className="mt-0.5"
                            />
                            {option.label}
                          </label>
                          ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-navy/[0.025] p-4">
                <p className="text-sm font-bold text-navy">Electronic acknowledgment</p>
                <p className="mt-1 text-xs leading-relaxed text-navy/60">
                  I completed this training myself, understand that custody records must be truthful, and will stop when required evidence, safety, seal, identity, or handoff conditions fail.
                </p>
                <input
                  value={trainingSignature}
                  onChange={(event) => setTrainingSignature(event.target.value)}
                  placeholder="Legal name as electronic signature"
                  className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
                />
                <button
                  type="button"
                  onClick={() => void completeTraining()}
                  disabled={working === "training"}
                  className="mt-3 w-full rounded-xl bg-navy px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {working === "training" ? "Scoring and recording…" : "Submit training and knowledge check"}
                </button>
              </div>
            </>
          )}

          <Link href="/driver/training" target="_blank" className="inline-block text-xs font-bold text-[#ff6868] underline">
            Open printable field checklist
          </Link>
        </section>

        <section className={`rounded-2xl p-5 ${status?.progress.submitted ? "bg-green-700 text-white" : "bg-navy text-white"}`}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/65">Step 4</p>
          <h2 className="mt-1 text-lg font-bold">{status?.progress.submitted ? "Submitted to operations" : "Operations review remains locked"}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            {status?.progress.submitted
              ? "Documents, identity verification, and foundational training are recorded. Operations must still review the evidence and clear every readiness gate before live custody."
              : "Complete the documents, provider-backed identity check, and training above. Missing or rejected evidence keeps live custody blocked."}
          </p>
          {status?.progress.submitted && (
            <Link href="/driver" className="mt-4 inline-block rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-navy">Continue to driver portal</Link>
          )}
        </section>

        {status?.expiresAt && (
          <p className="text-center text-xs text-navy/45">Private link expires {new Date(status.expiresAt).toLocaleString()}.</p>
        )}
      </div>
    </DriverChrome>
  );
}
