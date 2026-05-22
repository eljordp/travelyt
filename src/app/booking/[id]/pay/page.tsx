"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import {
  type Booking,
  formatPrice,
  getBooking,
  updateBooking,
  SERVICE_LABELS,
} from "@/lib/bookings";

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [exp, setExp] = useState("12/29");
  const [cvc, setCvc] = useState("123");
  const [zip, setZip] = useState("94102");

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      getBooking(params.id).then((result) => {
        if (cancelled) return;
        setBooking(result);
        setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [params?.id]);

  function pay() {
    if (!booking) return;
    setProcessing(true);
    setTimeout(async () => {
      await updateBooking(booking.id, {
        status: "paid",
        paidAt: new Date().toISOString(),
      });
      router.push(`/booking/${booking.id}`);
    }, 1400);
  }

  if (loading) {
    return (
      <AppChrome title="Payment">
        <div className="rounded-2xl bg-white p-5 text-center text-navy/70 shadow-sm shadow-navy/5">
          Loading…
        </div>
      </AppChrome>
    );
  }

  if (!booking) {
    return (
      <AppChrome title="Payment">
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

  return (
    <AppChrome title="Payment">
      <div>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-navy mb-1">Confirm &amp; Pay</h1>
          <p className="text-navy/70">Booking {booking.id}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 overflow-hidden mb-5">
          <div className="px-5 py-5 sm:px-8 sm:py-6 border-b border-gray-100">
            <h2 className="font-bold text-navy mb-4">Order summary</h2>
            <div className="space-y-3 text-sm">
              <Row label="Service" value={SERVICE_LABELS[booking.service]} />
              <Row label="Airport" value={booking.airport} />
              <Row label={booking.service === "arrival" ? "Delivery address" : "Pickup address"} value={booking.address} />
              <Row label="Date" value={booking.date} />
              <Row label="Bags" value={`${booking.bags} bag${booking.bags > 1 ? "s" : ""}`} />
              {booking.flight && <Row label="Flight" value={booking.flight} />}
            </div>
            <div className="border-t border-gray-100 mt-5 pt-5 flex justify-between items-baseline">
              <span className="text-navy font-bold">Total</span>
              <span className="text-2xl font-bold text-[#ff6b6b]">
                {formatPrice(booking.priceCents)}
              </span>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-8 sm:py-6 space-y-5">
            <div className="flex items-center gap-2 text-xs text-navy/70 uppercase font-semibold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              Demo checkout — no real charges
            </div>

            <Field label="Card number">
              <input value={card} onChange={(e) => setCard(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all font-mono" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Expiry">
                <input value={exp} onChange={(e) => setExp(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all font-mono" />
              </Field>
              <Field label="CVC">
                <input value={cvc} onChange={(e) => setCvc(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all font-mono" />
              </Field>
              <Field label="Zip">
                <input value={zip} onChange={(e) => setZip(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all font-mono" />
              </Field>
            </div>

            <button onClick={pay} disabled={processing}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff6b6b] to-[#ff6b6b] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-wait">
              {processing ? "Processing…" : `Pay ${formatPrice(booking.priceCents)}`}
            </button>
          </div>
        </div>

        <p className="text-xs text-navy/70 text-center">
          This prototype uses a mock payment screen. No card is charged.
        </p>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}
