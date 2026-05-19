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
  cta: string;
  href: string;
};

const PROMOS: Promo[] = [
  {
    icon: Tag,
    eyebrow: "Launch offer",
    text: "30% off your first booking with code TRAVELYT30.",
    cta: "Claim 30%",
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
    text: "Pilot routes opening for the summer — get on the list early.",
    cta: "Reserve a slot",
    href: "/quote",
  },
];

const ROTATE_MS = 7000;
const STORAGE_KEY = "travelyt_sticky_promo_dismissed";

const HIDDEN_PREFIXES = ["/driver", "/booking", "/quote"];

export default function StickyPromoBar() {
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNative(isNative());
    if (typeof window !== "undefined") {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
    }
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
      className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-3 sm:px-6 sm:pb-5"
      role="region"
      aria-label="Current Travelyt offers"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 rounded-2xl bg-navy/95 px-4 py-3 text-white shadow-2xl shadow-navy/40 backdrop-blur sm:px-5 sm:py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c41e2a]/20 text-[#ff747d]">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff747d]">
            {promo.eyebrow}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">
            {promo.text}
          </p>
        </div>

        <Link
          href={promo.href}
          className="hidden items-center gap-2 whitespace-nowrap rounded-xl bg-[#c41e2a] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#e63946] sm:inline-flex"
        >
          {promo.cta}
          <ArrowRight className="h-4 w-4" />
        </Link>

        <Link
          href={promo.href}
          aria-label={promo.cta}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c41e2a] text-white hover:bg-[#e63946] sm:hidden"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss offers"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto mt-2 flex max-w-5xl justify-center gap-1.5">
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
