"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { roleRequiresMfa, trustedUserRole } from "@/lib/auth-policy";
import { getSupabaseBrowser } from "@/lib/supabase-client";

export default function BackupLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const exchangeVerifiedSession = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const session = supabase
      ? (await supabase.auth.getSession()).data.session
      : null;
    if (!session?.access_token) return false;
    const assurance = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.data?.currentLevel !== "aal2") return false;
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ accessToken: session.access_token }),
    });
    return response.ok;
  }, []);

  useEffect(() => {
    void (async () => {
      if (await exchangeVerifiedSession()) {
        router.replace("/backup/bookings");
        router.refresh();
      }
    })();
  }, [exchangeVerifiedSession, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Account sign-in is not configured.");
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
      if (signInError || !signInData.user) {
        throw new Error(signInError?.message || "Could not sign in.");
      }
      const role = trustedUserRole(signInData.user);
      if (!roleRequiresMfa(role)) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("This account is not authorized for Travelyt operations.");
      }
      const [assurance, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (assurance.error || factors.error) {
        throw new Error("Could not verify account security. Try again.");
      }
      if (!factors.data?.totp?.length) {
        window.location.href = "/security?required=1&next=%2Fbackup%2Fbookings";
        return;
      }
      if (assurance.data?.currentLevel !== "aal2") {
        window.location.href = "/mfa?next=%2Fbackup%2Fbookings";
        return;
      }
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error("Verified session is missing.");
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ accessToken: session.access_token }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not sign in.");
      }
      router.push("/backup/bookings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
          Admin email
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          placeholder="ops@travelyt.us"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
          Password + authenticator
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          placeholder="Emergency access password"
          autoComplete="current-password"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-navy px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Opening backup ops..." : "Open Backup Ops"}
      </button>
    </form>
  );
}
