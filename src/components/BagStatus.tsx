"use client";

import {
  CheckCircle2,
  Home,
  Lock,
  PlaneTakeoff,
  ShieldCheck,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StatusKey =
  | "picked_up"
  | "sealed"
  | "tsa_cleared"
  | "checked_in"
  | "on_flight"
  | "delivered";

type Step = {
  key: StatusKey;
  label: string;
  desc: string;
  icon: LucideIcon;
};

const STEPS: Step[] = [
  {
    key: "picked_up",
    label: "Picked up at door",
    desc: "Courier collected your bag and confirmed ID.",
    icon: Home,
  },
  {
    key: "sealed",
    label: "Sealed + weighed",
    desc: "Tamper-evident seal applied. Weight on file.",
    icon: Lock,
  },
  {
    key: "tsa_cleared",
    label: "Cleared TSA screening",
    desc: "Bag screened at the airport security checkpoint.",
    icon: ShieldCheck,
  },
  {
    key: "checked_in",
    label: "Checked in to your flight",
    desc: "Accepted by the airline as your checked baggage.",
    icon: CheckCircle2,
  },
  {
    key: "on_flight",
    label: "On your flight",
    desc: "In the hold. We'll meet it on the other side.",
    icon: PlaneTakeoff,
  },
  {
    key: "delivered",
    label: "Delivered",
    desc: "Dropped at your address. Signed and photographed.",
    icon: Truck,
  },
];

export default function BagStatus({
  current,
  bookingId,
  route,
  compact = false,
}: {
  current: StatusKey;
  bookingId?: string;
  route?: string;
  compact?: boolean;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-navy/55">
            Bag status
          </p>
          {bookingId ? (
            <p className="mt-1 text-base font-bold text-navy">
              {bookingId}
              {route ? <span className="text-navy/55"> · {route}</span> : null}
            </p>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c41e2a]/10 px-3 py-1 text-xs font-semibold text-[#c41e2a]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c41e2a]" />
          Live
        </span>
      </div>

      <ol className="relative">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentIndex;
          const active = i === currentIndex;
          const upcoming = i > currentIndex;
          const isLast = i === STEPS.length - 1;

          return (
            <li key={step.key} className="relative pb-5 last:pb-0">
              {!isLast ? (
                <span
                  aria-hidden
                  className={`absolute left-[18px] top-9 h-[calc(100%-1.5rem)] w-px ${
                    done ? "bg-[#c41e2a]" : "bg-navy/10"
                  }`}
                />
              ) : null}

              <div className="flex items-start gap-4">
                <span
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
                    done
                      ? "bg-[#c41e2a] text-white"
                      : active
                      ? "bg-navy text-white"
                      : "bg-[#f6f7fb] text-navy/40"
                  }`}
                >
                  <Icon
                    className="h-4 w-4"
                    strokeWidth={active || done ? 2.2 : 1.8}
                  />
                </span>

                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={`text-sm font-bold ${
                        upcoming ? "text-navy/40" : "text-navy"
                      }`}
                    >
                      {step.label}
                    </p>
                    {active ? (
                      <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Now
                      </span>
                    ) : null}
                  </div>
                  {!compact ? (
                    <p
                      className={`mt-0.5 text-xs ${
                        upcoming ? "text-navy/35" : "text-navy/60"
                      }`}
                    >
                      {step.desc}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
