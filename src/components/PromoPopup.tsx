"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Tag } from "lucide-react";

const STORAGE_KEY = "travelyt_promo_seen";
const DEADLINE_MS = 2 * 60 * 60 * 1000;
const POPUP_DELAY_MS = 4000;
const PROMO_CODE = "TRAVELYT30";

function format(ms: number) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function PromoPopup() {
  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState(DEADLINE_MS);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;

    const t = setTimeout(() => setVisible(true), POPUP_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const start = Date.now();
    const id = setInterval(() => {
      const left = DEADLINE_MS - (Date.now() - start);
      setRemaining(left > 0 ? left : 0);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-navy/40 px-4 pb-6 sm:items-center sm:pb-0">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl shadow-navy/30">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close promo"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-navy/60 transition-colors hover:bg-white hover:text-navy"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-gradient-to-br from-[#c41e2a] to-[#e63946] px-6 py-7 text-white">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Tag className="h-3.5 w-3.5" /> Launch offer
          </div>
          <h2 className="text-2xl font-bold leading-tight sm:text-3xl">
            30% off your first booking
          </h2>
          <p className="mt-2 text-sm text-white/85">
            Book within the next 2 hours and we&apos;ll knock 30% off your
            door-to-gate baggage service.
          </p>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-navy/60">
            Offer ends in
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-navy">
            {format(remaining)}
          </p>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-dashed border-navy/20 bg-[#f6f7fb] px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-navy/55">
                Use code
              </p>
              <p className="text-lg font-bold tracking-wide text-navy">
                {PROMO_CODE}
              </p>
            </div>
            <Link
              href={`/quote?promo=${PROMO_CODE}`}
              onClick={dismiss}
              className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy/90"
            >
              Claim 30%
            </Link>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full text-center text-xs font-medium text-navy/50 hover:text-navy"
          >
            No thanks, maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
