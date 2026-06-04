"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Clock3, Gift, X } from "lucide-react";

const DISMISS_KEY = "travelyt_marketing_popup_dismissed";
const DEADLINE_KEY = "travelyt_marketing_popup_deadline";
const OFFER_SECONDS = 60 * 60;
const POPUP_DELAY_MS = 1200;

function getOfferDeadline() {
  const stored = window.sessionStorage.getItem(DEADLINE_KEY);
  const parsed = stored ? Number(stored) : 0;
  if (Number.isFinite(parsed) && parsed > Date.now()) return parsed;

  const deadline = Date.now() + OFFER_SECONDS * 1000;
  window.sessionStorage.setItem(DEADLINE_KEY, String(deadline));
  return deadline;
}

function formatRemaining(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(secs).padStart(2, "0")}`;
}

export default function MarketingPopup() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState(OFFER_SECONDS);

  useEffect(() => {
    if (pathname !== "/") return;

    let intervalId: number | undefined;
    const openId = window.setTimeout(() => {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;

      const deadline = getOfferDeadline();
      const updateRemaining = () => {
        setRemaining(Math.ceil((deadline - Date.now()) / 1000));
      };

      updateRemaining();
      setVisible(true);
      intervalId = window.setInterval(updateRemaining, 1000);
    }, POPUP_DELAY_MS);

    return () => {
      window.clearTimeout(openId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [pathname]);

  if (pathname !== "/" || !visible) return null;

  function dismiss() {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-navy/30 px-4 pb-5 backdrop-blur-sm sm:items-center sm:pb-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="travelyt-popup-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white text-navy shadow-2xl shadow-navy/35">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close offer"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-navy/55 shadow-sm transition-colors hover:bg-white hover:text-navy"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-navy px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ff6868]/20 text-[#ff6868]">
              <Gift className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
                Limited launch offer
              </p>
              <h2
                id="travelyt-popup-title"
                className="mt-1 text-2xl font-bold leading-tight"
              >
                Get 30% off your first booking
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-relaxed text-navy/70">
            Book within the next hour and use code{" "}
            <span className="font-bold text-navy">TRAVELYT30</span> to save on
            door-to-gate luggage pickup.
          </p>

          <div className="flex items-center justify-between rounded-xl border border-[#ff6868]/15 bg-[#ff6868]/5 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-navy">
              <Clock3 className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
              Offer ends in
            </span>
            <span className="font-mono text-lg font-bold tabular-nums text-[#ff6868]">
              {formatRemaining(remaining)}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Link
              href="/quote?promo=TRAVELYT30"
              onClick={dismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#ff6868]"
            >
              Claim 30% off <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl px-5 py-3 text-sm font-bold text-navy/55 transition-colors hover:bg-navy/5 hover:text-navy"
            >
              Not now
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-navy/50">
            Example launch offer. Promo applies to eligible Travelyt service
            fees only and may not apply to airline baggage fees, oversized-item
            fees, declared-value upgrades, taxes, or third-party charges.
          </p>
        </div>
      </div>
    </div>
  );
}
