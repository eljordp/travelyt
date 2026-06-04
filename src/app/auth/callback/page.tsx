"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-client";

function safeNext() {
  if (typeof window === "undefined") return "/profile";
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/profile";
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Confirming your account...");

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    async function finishAuth() {
      if (!supabase) {
        setMessage("Customer login is not configured yet.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.getSession();

      if (cancelled) return;

      if (result.error || !result.data.session) {
        setMessage("We could not confirm this login link. Try signing in.");
        return;
      }

      window.location.replace(safeNext());
    }

    void finishAuth();

    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg shadow-navy/5">
        <h1 className="text-2xl font-bold text-navy">Email confirmed</h1>
        <p className="mt-3 text-sm text-navy/70">{message}</p>
        {message.includes("could not") && (
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
