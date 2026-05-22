"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import { enableBookingPush, isNative } from "@/lib/native";
import {
  type Booking,
  type BookingStatus,
  formatPrice,
  getBooking,
  subscribe,
  SERVICE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  statusIndex,
} from "@/lib/bookings";

const VISIBLE_STATUSES: BookingStatus[] = STATUS_ORDER.filter(
  (s) => s !== "pending"
);

export default function BookingPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [native, setNative] = useState(false);
  const [pushState, setPushState] = useState<
    "idle" | "working" | "enabled" | "denied"
  >("idle");

  useEffect(() => {
    const handle = window.setTimeout(() => setNative(isNative()), 0);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    const refresh = async () => {
      const result = await getBooking(params.id);
      if (!cancelled) setBooking(result);
    };
    let interval: ReturnType<typeof setInterval> | undefined;
    const handle = window.setTimeout(() => {
      refresh().finally(() => {
        if (!cancelled) setLoading(false);
      });
      interval = setInterval(refresh, 1500);
    }, 0);
    const unsub = subscribe(refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      unsub();
      if (interval) clearInterval(interval);
    };
  }, [params?.id]);

  if (loading) {
    return (
      <AppChrome title="Tracking">
        <div className="rounded-2xl bg-white p-5 text-center text-navy/70 shadow-sm shadow-navy/5">
          Loading…
        </div>
      </AppChrome>
    );
  }

  if (!booking) {
    return (
      <AppChrome title="Tracking">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm shadow-navy/5">
          <h1 className="text-2xl font-bold text-navy mb-3">Booking not found</h1>
          <p className="text-navy/70 mb-8">We couldn&apos;t find a booking you can access.</p>
          <Link href="/quote" className="px-6 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            Start a new quote
          </Link>
        </div>
      </AppChrome>
    );
  }

  const current = statusIndex(booking.status);
  const enableLiveUpdates = async () => {
    setPushState("working");
    const ok = await enableBookingPush(booking.id);
    setPushState(ok ? "enabled" : "denied");
  };

  return (
    <AppChrome title="Tracking">
      <div>
        <div className="mb-5">
          <p className="text-xs text-navy/70 uppercase tracking-wider font-semibold mb-2">
            Booking {booking.id}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-navy mb-2">
            {STATUS_LABELS[booking.status]}
          </h1>
          <p className="text-navy/70">
            {SERVICE_LABELS[booking.service]} · {booking.bags} bag
            {booking.bags > 1 ? "s" : ""} · {booking.date}
          </p>
        </div>

        {/* Status timeline */}
        <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-5 md:p-8 mb-5">
          <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-5">
            Live status
          </h2>
          <div className="space-y-4">
            {VISIBLE_STATUSES.map((s) => {
              const idx = statusIndex(s);
              const isDone = idx <= current;
              const isCurrent = idx === current;
              return (
                <div key={s} className="flex items-center gap-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0 ${
                      isCurrent
                        ? "bg-[#ff6b6b] text-white ring-4 ring-[#ff6b6b]/20 animate-pulse"
                        : isDone
                          ? "bg-navy text-white"
                          : "bg-gray-100 text-navy/30"
                    }`}
                  >
                    {isDone && !isCurrent ? "✓" : ""}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${isDone ? "text-navy" : "text-navy/30"}`}>
                      {STATUS_LABELS[s]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {native && (
          <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-5 md:p-6 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1">
                Live app updates
              </h2>
              <p className="text-sm text-navy/70">
                Send status alerts on this device for this booking.
              </p>
            </div>
            <button
              type="button"
              onClick={enableLiveUpdates}
              disabled={pushState === "working" || pushState === "enabled"}
              className="px-5 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {pushState === "working"
                ? "Enabling..."
                : pushState === "enabled"
                  ? "Updates on"
                  : pushState === "denied"
                    ? "Try again"
                    : "Notify me"}
            </button>
          </div>
        )}

        {/* Photo proofs */}
        {booking.proofs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-5 md:p-8 mb-5">
            <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-5">
              Chain of custody
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {booking.proofs.map((p, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-gray-100">
                  <div className="relative w-full aspect-[4/3] bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.dataUrl}
                      alt={`${p.kind} proof`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <div className="px-4 py-3">
                    <div className="font-semibold text-sm text-navy capitalize">
                      {p.kind === "pickup" ? "Picked up" : "Delivered"}
                    </div>
                    <div className="text-xs text-navy/70 mt-0.5">
                      {new Date(p.timestamp).toLocaleString()}
                      {p.driverName ? ` · ${p.driverName}` : ""}
                    </div>
                    {p.note && (
                      <div className="text-xs text-navy/70 mt-2">{p.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trip details */}
        <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-5 md:p-8 mb-5">
          <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-5">
            Trip details
          </h2>
          <div className="space-y-3 text-sm">
            <Row label="Service" value={SERVICE_LABELS[booking.service]} />
            <Row label="Airport" value={booking.airport} />
            <Row label={booking.service === "arrival" ? "Delivery" : "Pickup"} value={booking.address} />
            <Row label="Date" value={booking.date} />
            {booking.flight && <Row label="Flight" value={booking.flight} />}
            <Row label="Bags" value={`${booking.bags}`} />
            {booking.driverName && <Row label="Driver" value={booking.driverName} />}
          </div>
          <div className="border-t border-gray-100 mt-5 pt-5 flex justify-between">
            <span className="text-navy/70 font-medium">Total paid</span>
            <span className="font-bold text-navy">{formatPrice(booking.priceCents)}</span>
          </div>
        </div>

        {/* Demo helper */}
        <div className="bg-navy/5 rounded-2xl p-5 text-sm text-navy/70">
          <div className="font-semibold text-navy mb-1">Demo tip</div>
          Open <Link href="/driver" className="underline font-semibold">/driver</Link> in another tab to play the courier flow. Photos uploaded there will appear here in real time.
        </div>
      </div>
    </AppChrome>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy/70 font-medium shrink-0">{label}</span>
      <span className="text-navy font-semibold text-right break-words">{value}</span>
    </div>
  );
}
