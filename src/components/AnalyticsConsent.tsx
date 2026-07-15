"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type AnalyticsConsent as ConsentChoice,
  GA4_MEASUREMENT_ID,
  isSuppressedAnalyticsPath,
  updateAnalyticsConsent,
} from "@/lib/analytics";

const STORAGE_KEY = "travelyt_analytics_consent";

export default function AnalyticsConsent() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<ConsentChoice | "unknown">("unknown");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "granted" || stored === "denied") {
        setChoice(stored);
        updateAnalyticsConsent(stored);
      }
    } catch {
      // Keep the consent prompt available when storage is blocked.
    } finally {
      setReady(true);
    }
  }, []);

  function saveChoice(nextChoice: ConsentChoice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextChoice);
    } catch {
      // Consent still applies to the current page when storage is unavailable.
    }
    updateAnalyticsConsent(nextChoice);
    setChoice(nextChoice);
  }

  if (
    !GA4_MEASUREMENT_ID ||
    !ready ||
    choice !== "unknown" ||
    isSuppressedAnalyticsPath(pathname)
  ) {
    return null;
  }

  return (
    <aside
      aria-label="Analytics consent"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-white/15 bg-navy p-4 text-white shadow-2xl sm:flex sm:items-center sm:gap-5 sm:p-5"
    >
      <p className="text-sm leading-relaxed text-white/85 sm:flex-1">
        Travelyt uses analytics to understand which pages and booking steps are
        useful. You can accept or decline analytics cookies. Read our{" "}
        <Link className="font-semibold text-white underline" href="/privacy">
          privacy policy
        </Link>
        .
      </p>
      <div className="mt-4 flex gap-3 sm:mt-0 sm:shrink-0">
        <button
          type="button"
          className="rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          onClick={() => saveChoice("denied")}
        >
          Decline
        </button>
        <button
          type="button"
          className="rounded-xl bg-[#ff6868] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#ff7f7f]"
          onClick={() => saveChoice("granted")}
        >
          Accept analytics
        </button>
      </div>
    </aside>
  );
}
