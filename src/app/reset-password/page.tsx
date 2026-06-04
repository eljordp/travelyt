"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { validatePassword } from "@/lib/auth-policy";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import { SITE_URL } from "@/lib/site";

type Mode = "checking" | "request" | "update" | "done" | "unconfigured";

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<Mode>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    async function load() {
      if (!supabase) {
        setMode("unconfigured");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setMode(data.session ? "update" : "request");
    }

    void load();

    const { data: listener } =
      supabase?.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY" || session) {
          setMode("update");
        }
      }) ?? { data: { subscription: null } };

    return () => {
      cancelled = true;
      listener.subscription?.unsubscribe();
    };
  }, []);

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    const cleanEmail = email.trim().toLowerCase();

    if (!supabase) {
      setMode("unconfigured");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setError("Enter the email on your Travelyt account.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      cleanEmail,
      {
        redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(
          "/reset-password"
        )}`,
      }
    );

    setSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setNotice("Check your email for the secure password reset link.");
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    const passwordError = validatePassword(password);

    if (!supabase) {
      setMode("unconfigured");
      return;
    }
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    setPassword("");
    setConfirm("");
    setMode("done");
    setNotice("Password updated. Sign in again with your new password.");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f0ee] px-4 py-12">
      <Link href="/">
        <Image
          src="/logo.png"
          alt="Travelyt"
          width={160}
          height={54}
          className="mb-8 h-12 w-auto"
          priority
        />
      </Link>

      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-navy/5">
        <h1 className="text-2xl font-bold text-navy">Reset password</h1>
        <p className="mt-1 text-sm text-navy/70">
          {mode === "update"
            ? "Choose a new password for your Travelyt account."
            : "We will send a secure reset link to your email."}
        </p>

        {mode === "checking" && (
          <div className="mt-8 rounded-xl bg-navy/[0.03] px-4 py-3 text-sm text-navy/70">
            Checking secure session...
          </div>
        )}

        {mode === "unconfigured" && (
          <div className="mt-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            Supabase auth is not configured yet.
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </p>
        )}

        {mode === "request" && (
          <form onSubmit={requestReset} className="mt-8 space-y-5" noValidate>
            <div>
              <label
                htmlFor="reset-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy/70"
              >
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[#ff6868] px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        {mode === "update" && (
          <form onSubmit={updatePassword} className="mt-8 space-y-5" noValidate>
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy/70"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="10+ characters with a number"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
              />
            </div>
            <div>
              <label
                htmlFor="confirm-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy/70"
              >
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Repeat password"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[#ff6868] px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Update password"}
            </button>
          </form>
        )}

        {mode === "done" && (
          <Link
            href="/login"
            className="mt-8 block w-full rounded-xl bg-navy px-8 py-3.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Back to sign in
          </Link>
        )}

        <p className="mt-6 text-center text-sm text-navy/70">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-[#ff6868] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
