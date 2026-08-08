"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { safeAuthNext } from "@/lib/auth-policy";
import { getSupabaseBrowser } from "@/lib/supabase-client";

type PageState = "loading" | "ready" | "signed-out" | "no-factor" | "unconfigured";

export default function MfaPage() {
  const [state, setState] = useState<PageState>("loading");
  const [factorId, setFactorId] = useState("");
  const [destination] = useState(() =>
    typeof window === "undefined"
      ? "/profile"
      : safeAuthNext(
          new URLSearchParams(window.location.search).get("next"),
        ),
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        if (active) setState("unconfigured");
        return;
      }
      const [userResult, factorResult, assuranceResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (!active) return;
      if (userResult.error || !userResult.data.user) {
        setState("signed-out");
        return;
      }
      if (assuranceResult.data?.currentLevel === "aal2") {
        window.location.replace(destination);
        return;
      }
      const factor = factorResult.data?.totp?.[0];
      if (!factor) {
        setState("no-factor");
        return;
      }
      setFactorId(factor.id);
      setState("ready");
    })();

    return () => {
      active = false;
    };
  }, [destination]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !factorId) return;
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setSubmitting(true);
    const { error: verifyError } =
      await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    window.location.replace(destination);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f0ee] px-4 py-12">
      <Link href="/">
        <Image src="/logo.png" alt="Travelyt" width={160} height={54} className="mb-8 h-12 w-auto" priority />
      </Link>
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-navy/5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy/5 text-navy">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-navy">Two-factor verification</h1>

        {state === "loading" && <p className="mt-3 text-sm text-navy/65">Checking your security factors…</p>}
        {state === "unconfigured" && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">Supabase authentication is not configured in this environment.</p>}
        {state === "signed-out" && (
          <div className="mt-3">
            <p className="text-sm text-navy/65">Your password session is missing or expired.</p>
            <Link href={`/login?next=${encodeURIComponent(destination)}`} className="mt-4 inline-flex rounded-xl bg-[#ff6868] px-4 py-3 text-sm font-semibold text-white">Return to sign in</Link>
          </div>
        )}
        {state === "no-factor" && (
          <div className="mt-3">
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No verified authenticator is enrolled on this account.</p>
            <Link href={`/security?required=1&next=${encodeURIComponent(destination)}`} className="mt-4 inline-flex rounded-xl bg-[#ff6868] px-4 py-3 text-sm font-semibold text-white">Set up authenticator</Link>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={verify} className="mt-5 space-y-4">
            <p className="text-sm leading-relaxed text-navy/65">Enter the current code from your authenticator app to finish signing in.</p>
            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <div>
              <label htmlFor="mfa-code" className="block text-xs font-semibold uppercase tracking-wide text-navy/60">6-digit code</label>
              <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none focus:border-[#ff6868]" />
            </div>
            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-[#ff6868] px-4 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-60">{submitting ? "Verifying…" : "Verify and continue"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
