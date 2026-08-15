"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import AppChrome from "@/components/AppChrome";
import {
  IDENTITY_CONSENT_DISCLOSURE,
  IDENTITY_CONSENT_VERSION,
} from "@/lib/identity-consent";

type InviteState = {
  name: string;
  status: "invited" | "submitted";
  emailCodeRequired: boolean;
};

export default function TravelerVerificationPage() {
  return (
    <Suspense fallback={<TravelerVerificationLoading />}>
      <TravelerVerificationContent />
    </Suspense>
  );
}

function TravelerVerificationLoading() {
  return (
    <AppChrome title="Traveler verification">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center text-sm text-navy/65 shadow-sm shadow-navy/5">
        Checking your secure link...
      </div>
    </AppChrome>
  );
}

function TravelerVerificationContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [traveler, setTraveler] = useState<InviteState | null>(null);
  const [documentType, setDocumentType] = useState("passport");
  const [consent, setConsent] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(
          `/api/identity/traveler-verification?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );
        const data = (await response.json()) as {
          ok?: boolean;
          error?: string;
          traveler?: InviteState;
        };
        if (!response.ok || !data.traveler) {
          throw new Error(data.error || "Verification link is unavailable.");
        }
        if (active) setTraveler(data.traveler);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Verification link is unavailable.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    if (token) void load();
    else {
      setError("Verification link is invalid.");
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [token]);

  async function requestCode() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/identity/traveler-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "request_code" }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not send the email code.");
      setCodeSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send the email code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    if (!consent || signatureName.trim().length < 2 || emailCode.length !== 6 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/identity/traveler-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "consent",
          consent: true,
          consentVersion: IDENTITY_CONSENT_VERSION,
          signatureName,
          documentType,
          emailCode,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not submit verification.");
      setTraveler((current) => current ? { ...current, status: "submitted", emailCodeRequired: false } : current);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit verification.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppChrome title="Traveler verification">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 sm:p-8">
          {loading ? (
            <p className="text-center text-sm text-navy/65">Checking your secure link...</p>
          ) : traveler?.status === "submitted" ? (
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h1 className="mt-4 text-2xl font-bold text-navy">Your step is complete</h1>
              <p className="mt-2 text-sm leading-relaxed text-navy/65">
                Your consent is attached to the group booking. Travelyt must still complete the approved document and liveness review before custody can begin.
              </p>
            </div>
          ) : traveler ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-white">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <h1 className="mt-5 text-2xl font-bold text-navy">Hi {traveler.name}, verify your traveler record</h1>
              <p className="mt-2 text-sm leading-relaxed text-navy/65">
                Because you will be 18 or older on the travel date, only you can consent to your identity review. The booking owner cannot complete this step for you.
              </p>

              <div className="mt-6 rounded-xl border border-navy/10 bg-[#f7f8fb] p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-navy">
                  <Mail className="h-4 w-4" /> Email confirmation
                </div>
                <p className="mt-1 text-xs leading-relaxed text-navy/65">
                  Send a six-digit code to the private email address used for your traveler record.
                </p>
                <button type="button" onClick={() => void requestCode()} disabled={submitting} className="mt-3 rounded-lg bg-navy px-4 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-50">
                  {submitting ? "Sending..." : codeSent ? "Send a new code" : "Send my code"}
                </button>
              </div>

              <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-navy/60">
                Six-digit code
                <input value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-lg font-bold tracking-[0.35em] text-navy outline-none focus:border-[#ff6868]" />
              </label>

              <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-navy/60">
                Document for review
                <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-navy outline-none focus:border-[#ff6868]">
                  <option value="passport">Passport</option>
                  <option value="driver_license">Driver license</option>
                  <option value="other">Other government ID</option>
                </select>
              </label>

              <label className="mt-4 flex items-start gap-3 rounded-xl border border-navy/10 bg-[#f7f8fb] p-4 text-sm leading-relaxed text-navy/70">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff6868] focus:ring-[#ff6868]" />
                <span>{IDENTITY_CONSENT_DISCLOSURE} No raw identity document is stored in the booking manifest.</span>
              </label>

              <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-navy/60">
                Legal name - electronic signature
                <input value={signatureName} onChange={(event) => setSignatureName(event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-navy outline-none focus:border-[#ff6868]" />
              </label>

              <button type="button" onClick={() => void submit()} disabled={!consent || signatureName.trim().length < 2 || emailCode.length !== 6 || submitting} className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff7a85] py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? "Submitting securely..." : "Submit my verification request"}
              </button>
            </>
          ) : null}
          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </AppChrome>
  );
}
