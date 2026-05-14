"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
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

  useEffect(() => {
    if (!params?.id) return;
    const refresh = () => setBooking(getBooking(params.id));
    refresh();
    setLoading(false);
    const unsub = subscribe(refresh);
    const interval = setInterval(refresh, 1500);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [params?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-28 pb-16 text-center text-navy/50">
          Loading…
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-28 pb-16 text-center">
          <h1 className="text-2xl font-bold text-navy mb-3">Booking not found</h1>
          <p className="text-navy/50 mb-8">We couldn&apos;t find that booking on this device.</p>
          <Link href="/quote" className="px-6 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            Start a new quote
          </Link>
        </div>
      </div>
    );
  }

  const current = statusIndex(booking.status);

  return (
    <div className="min-h-screen bg-[#f5f0ee]">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 pt-28 pb-16">
        <div className="mb-10">
          <p className="text-xs text-navy/40 uppercase tracking-wider font-semibold mb-2">
            Booking {booking.id}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-navy mb-2">
            {STATUS_LABELS[booking.status]}
          </h1>
          <p className="text-navy/50">
            {SERVICE_LABELS[booking.service]} · {booking.bags} bag
            {booking.bags > 1 ? "s" : ""} · {booking.date}
          </p>
        </div>

        {/* Status timeline */}
        <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8 mb-6">
          <h2 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-5">
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
                        ? "bg-[#c41e2a] text-white ring-4 ring-[#c41e2a]/20 animate-pulse"
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

        {/* Photo proofs */}
        {booking.proofs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8 mb-6">
            <h2 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-5">
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
                    <div className="text-xs text-navy/40 mt-0.5">
                      {new Date(p.timestamp).toLocaleString()}
                      {p.driverName ? ` · ${p.driverName}` : ""}
                    </div>
                    {p.note && (
                      <div className="text-xs text-navy/60 mt-2">{p.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trip details */}
        <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8 mb-6">
          <h2 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-5">
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
            <span className="text-navy/40 font-medium">Total paid</span>
            <span className="font-bold text-navy">{formatPrice(booking.priceCents)}</span>
          </div>
        </div>

        {/* Demo helper */}
        <div className="bg-navy/5 rounded-2xl p-5 text-sm text-navy/60">
          <div className="font-semibold text-navy mb-1">Demo tip</div>
          Open <Link href="/driver" className="underline font-semibold">/driver</Link> in another tab to play the courier flow. Photos uploaded there will appear here in real time.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy/40 font-medium shrink-0">{label}</span>
      <span className="text-navy font-semibold text-right break-words">{value}</span>
    </div>
  );
}

