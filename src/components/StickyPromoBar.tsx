"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ShieldCheck, Tag, Trophy, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isNative } from "@/lib/native";

type Promo = {
  icon: LucideIcon;
  eyebrow: string;
  text: string;
  code?: string;
  cta: string;
  href: string;
};

const PROMOS: Promo[] = [
  {
    icon: Tag,
    eyebrow: "Launch pricing",
    text: "30% off your first booking",
    code: "TRAVELYT30",
    cta: "Claim discount",
    href: "/quote?promo=TRAVELYT30",
  },
  {
    icon: ShieldCheck,
    eyebrow: "Every bag",
    text: "Sealed, weighed, tracked, and insured — door to gate.",
    cta: "See how it works",
    href: "/trust",
  },
  {
    icon: Trophy,
    eyebrow: "World Cup window",
    text: "Pilot routes opening for the summer — reserve a service slot.",
    cta: "Reserve a slot",
    href: "/quote",
  },
];

const ROTATE_MS = 7000;
const STORAGE_KEY = "travelyt_sticky_promo_dismissed";

const HIDDEN_PREFIXES = [
  "/admin",
  "/booking",
  "/business-cards",
  "/demo",
  "/driver",
  "/flyer",
  "/login",
  "/profile",
  "/quote",
  "/register",
  "/reset-password",
  "/track",
];

export default function StickyPromoBar() {
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setMounted(true);
      setNative(isNative() || params.has("app"));
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % PROMOS.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [dismissed]);

  if (!mounted || dismissed || native) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname?.startsWith(p))) return null;

  const promo = PROMOS[index];
  const Icon = promo.icon;

  function dismiss() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, "1");
    }
    setDismissed(true);
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-2 sm:px-6 sm:pb-5"
      role="region"
      aria-label="Current Travelyt offers"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 rounded-xl bg-navy/95 px-3 py-2.5 text-white shadow-2xl shadow-navy/40 backdrop-blur sm:gap-3 sm:rounded-2xl sm:px-5 sm:py-4">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff6868]/20 text-[#ff6868] sm:flex">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#ff6868] sm:text-[10px]">
            {promo.eyebrow}
          </p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold sm:text-base">{promo.text}</p>
            {promo.code && (
              <span className="rounded-full bg-white/12 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-white">
                Code {promo.code}
              </span>
            )}
          </div>
        </div>

        <Link
          href={promo.href}
          className="hidden items-center gap-2 whitespace-nowrap rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#ff6868] sm:inline-flex"
        >
          {promo.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>

        <Link
          href={promo.href}
          aria-label={promo.cta}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff6868] text-white hover:bg-[#ff6868] sm:hidden"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss offers"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto mt-2 hidden max-w-5xl justify-center gap-1.5 sm:flex">
        {PROMOS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show offer ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1 rounded-full transition-all ${
              i === index ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
