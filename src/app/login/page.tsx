"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-client";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.email.trim()) e.email = "Email is required";
    if (!form.password) e.password = "Password is required";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setErrors({ form: "Supabase auth is not configured yet." });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    setSubmitting(false);

    if (error) {
      setErrors({ form: error.message });
      return;
    }

    window.location.href = "/profile";
  }

  const field = (id: string) => ({
    value: form[id as keyof typeof form],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [id]: e.target.value })),
  });

  return (
    <div className="min-h-screen bg-[#f5f0ee] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/">
        <Image src="/logo.png" alt="Travelyt" width={160} height={54} className="h-12 w-auto mb-8" priority />
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg shadow-navy/5 p-8">
        <h1 className="text-2xl font-bold text-navy mb-1">Welcome back</h1>
        <p className="text-sm text-navy/70 mb-8">Sign in to manage your baggage pickups.</p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {errors.form && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors.form}
            </p>
          )}
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">Email</label>
            <input id="login-email" type="email" placeholder="you@example.com" {...field("email")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.email ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all`} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider">Password</label>
              <Link href="/#early-access" className="text-xs text-[#ff6b6b] hover:underline">Need access?</Link>
            </div>
            <input id="login-password" type="password" placeholder="Your password" {...field("password")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.password ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all`} />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          <button type="submit" disabled={submitting}
            className="w-full bg-gradient-to-r from-[#ff6b6b] to-[#ff6b6b] text-white py-3.5 rounded-xl font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-wait">
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-navy/70 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-[#ff6b6b] font-semibold hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
}
