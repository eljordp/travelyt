"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    agreed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    // TODO: wire to Supabase auth
    window.location.href = "/profile";
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
        <p className="text-sm text-navy/50 mb-8">Start traveling without the baggage stress.</p>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Full Name */}
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Full Name</label>
            <input id="reg-name" type="text" placeholder="Jordan Williams" {...field("name")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.name ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Email</label>
            <input id="reg-email" type="email" placeholder="you@example.com" {...field("email")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.email ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Password</label>
            <input id="reg-password" type="password" placeholder="At least 8 characters" {...field("password")}
              className={`w-full px-4 py-3 rounded-xl border ${errors.password ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          {/* Confirm */}
          <div>
            <label htmlFor="reg-confirm" className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Confirm Password</label>
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
              <span className="text-sm text-navy/60">
                I agree to the{" "}
                <a href="#" className="text-[#c41e2a] hover:underline">Terms of Service</a>{" "}
                and{" "}
                <a href="#" className="text-[#c41e2a] hover:underline">Privacy Policy</a>
              </span>
            </label>
            {errors.agreed && <p className="text-xs text-red-500 mt-1">{errors.agreed}</p>}
          </div>

          <button type="submit"
            className="w-full bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white py-3.5 rounded-xl font-semibold hover:opacity-90 transition-opacity cursor-pointer">
            Create Account
          </button>
        </form>

        <p className="text-center text-sm text-navy/50 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#c41e2a] font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
