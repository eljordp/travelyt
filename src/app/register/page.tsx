"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-client";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    agreed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Full name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 8) e.password = "At least 8 characters";
    if (form.password !== form.confirm) e.confirm = "Passwords don't match";
    if (!form.agreed) e.agreed = "You must agree to continue";
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
    setNotice("");
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: {
          full_name: form.name.trim(),
        },
      },
    });
    setSubmitting(false);

    if (error) {
      setErrors({ form: error.message });
      return;
    }

    if (data.session) {
      window.location.href = "/profile";
      return;
    }

    setNotice("Check your email to confirm your Travelyt account.");
  }

  const field = (id: string) => ({
    value: form[id as keyof typeof form] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [id]: e.target.value })),
  });

  return (
    <div className="min-h-screen bg-[#f5f0ee] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/">
        <Image src="/logo.png" alt="Travelyt" width={160} height={54} className="h-12 w-auto mb-8" priority />
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg shadow-navy/5 p-8">
        <h1 className="text-2xl font-bold text-navy mb-1">Create your account</h1>
        <p className="text-sm text-navy/70 mb-8">Start traveling without the baggage stress.</p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {errors.form && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {errors.form}
            </p>
          )}
          {notice && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {notice}
            </p>
          )}
          {/* Full Name */}
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">Full Name</label>
            <input id="reg-name" type="text" placeholder="Jordan Williams" {...field("name")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.name ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">Email</label>
            <input id="reg-email" type="email" placeholder="you@example.com" {...field("email")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.email ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">Password</label>
            <input id="reg-password" type="password" placeholder="At least 8 characters" {...field("password")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.password ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          {/* Confirm */}
          <div>
            <label htmlFor="reg-confirm" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">Confirm Password</label>
            <input id="reg-confirm" type="password" placeholder="Repeat password" {...field("confirm")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.confirm ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.confirm && <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>}
          </div>

          {/* Terms */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={form.agreed}
                onChange={(e) => setForm((f) => ({ ...f, agreed: e.target.checked }))}
                className="mt-0.5 accent-[#c41e2a]" />
              <span className="text-sm text-navy/70">
                I agree to the{" "}
                <Link href="/terms" className="text-[#c41e2a] hover:underline">Terms of Service</Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-[#c41e2a] hover:underline">Privacy Policy</Link>
              </span>
            </label>
            {errors.agreed && <p className="text-xs text-red-500 mt-1">{errors.agreed}</p>}
          </div>

          <button type="submit" disabled={submitting}
            className="w-full bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white py-3.5 rounded-xl font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-wait">
            {submitting ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-navy/70 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#c41e2a] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
