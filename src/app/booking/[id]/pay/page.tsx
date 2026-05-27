"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import {
  type Booking,
  formatPrice,
  getBooking,
  SERVICE_LABELS,
} from "@/lib/bookings";
import { INCLUDED_DISTANCE_MILES } from "@/lib/pricing";

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <AppChrome title="Request">
        <div className="rounded-2xl bg-white p-5 text-center text-navy/70 shadow-sm shadow-navy/5">
          Loading…
        </div>
      </AppChrome>
    );
  }

  if (!booking) {
    return (
      <AppChrome title="Request">
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
    <AppChrome title="Request">
      <div>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-navy mb-1">Request received</h1>
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
              <span className="text-navy font-bold">Base estimate</span>
              <span className="text-2xl font-bold text-[#c41e2a]">
                {formatPrice(booking.priceCents)}
              </span>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-8 sm:py-6 space-y-5">
            <div className="rounded-xl border border-[#c41e2a]/20 bg-[#c41e2a]/5 px-4 py-4">
              <p className="text-sm font-semibold text-navy">
                No payment is collected in this launch version.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-navy/70">
                Travelyt will confirm availability and send payment instructions
                before any bags are collected. Online checkout is coming in a
                future update.
              </p>
            </div>

            <Link
              href={`/booking/${booking.id}`}
              className="block w-full rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#c41e2a] py-4 text-center text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              View request status
            </Link>
          </div>
        </div>

        <p className="text-xs text-navy/70 text-center">
          Estimate includes eligible Travelyt service fees within {INCLUDED_DISTANCE_MILES}
          miles of the airport. Addresses farther than {INCLUDED_DISTANCE_MILES}
          miles may include a per-mile surcharge before payment is collected.
          Airline baggage fees are paid separately to the airline.
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
