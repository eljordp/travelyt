"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import {
  type Booking,
  formatPrice,
  getBookingAccessToken,
  getBooking,
  getBookingTrackingHref,
  SERVICE_LABELS,
} from "@/lib/bookings";
import { INCLUDED_DISTANCE_MILES } from "@/lib/pricing";

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutState] = useState(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("checkout");
  });
  const [checkoutSessionId] = useState(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("session_id");
  });

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    let attempts = checkoutState === "success" ? 0 : 4;

    async function load() {
      attempts += 1;
      const result = await getBooking(params.id);
      if (cancelled) return;
      let nextBooking = result;

      if (
        checkoutState === "success" &&
        checkoutSessionId &&
        result?.status === "pending"
      ) {
        try {
          const response = await fetch("/api/stripe/confirm-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId: params.id,
              sessionId: checkoutSessionId,
              accessToken: getBookingAccessToken(params.id),
            }),
          });
          const data = (await response.json()) as {
            ok?: boolean;
            booking?: Booking;
          };
          if (response.ok && data.booking) nextBooking = data.booking;
        } catch {}
      }

      setBooking(nextBooking);
      setLoading(false);

      if (
        checkoutState === "success" &&
        nextBooking?.status === "pending" &&
        attempts < 6
      ) {
        window.setTimeout(() => {
          void load();
        }, 2000);
      }
    }

    const handle = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [params?.id, checkoutState, checkoutSessionId]);

  async function startCheckout() {
    if (!booking || checkoutLoading) return;
    setCheckoutError("");
    setCheckoutLoading(true);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          accessToken: getBookingAccessToken(booking.id),
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Could not start secure checkout."
      );
      setCheckoutLoading(false);
    }
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

  const isPending = booking.status === "pending";

  return (
    <AppChrome title="Payment">
      <div>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-navy mb-1">
            {isPending ? "Secure checkout" : "Payment confirmed"}
          </h1>
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
              <span className="text-navy font-bold">Total estimate</span>
              <span className="text-2xl font-bold text-[#ff6868]">
                {formatPrice(booking.priceCents)}
              </span>
            </div>
          </div>

          <div className="px-5 py-5 sm:px-8 sm:py-6 space-y-5">
            {isPending ? (
              <>
                {checkoutState === "cancelled" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <p className="text-sm font-semibold text-amber-900">
                      Checkout was cancelled.
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800/80">
                      Your request is still saved. You can restart secure checkout
                      whenever you are ready.
                    </p>
                  </div>
                )}
                {checkoutState === "success" && (
                  <div className="rounded-xl border border-[#ff6868]/20 bg-[#ff6868]/5 px-4 py-4">
                    <p className="text-sm font-semibold text-navy">
                      Payment received by Stripe. Confirming with Travelyt...
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-navy/70">
                      This usually clears in a few seconds. If this page still
                      shows pending, refresh after a moment.
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-[#ff6868]/20 bg-[#ff6868]/5 px-4 py-4">
                  <p className="text-sm font-semibold text-navy">
                    Pay securely with Stripe.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-navy/70">
                    When you tap pay, you&apos;ll be redirected to Stripe or Link,
                    Travelyt&apos;s secure payment processor, to enter payment
                    details. Travelyt confirms operational availability before
                    custody begins. Airline baggage fees, if any, are paid
                    separately to the airline.
                  </p>
                </div>

                {checkoutError && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                    {checkoutError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={checkoutLoading}
                  className="block w-full rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff7a85] py-4 text-center text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                >
                  {checkoutLoading
                    ? "Opening secure checkout..."
                    : `Pay ${formatPrice(booking.priceCents)} securely`}
                </button>
              </>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4">
                <p className="text-sm font-semibold text-green-800">
                  Payment confirmed.
                </p>
                <p className="mt-1 text-sm leading-relaxed text-green-800/75">
                  Travelyt coordination can now assign a driver and start custody
                  checks.
                </p>
              </div>
            )}

            <Link
              href={getBookingTrackingHref(booking)}
              className="block w-full rounded-xl bg-navy py-4 text-center text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              View request status
            </Link>
          </div>
        </div>

        <p className="text-xs text-navy/70 text-center">
          Estimate includes eligible Travelyt service fees within {INCLUDED_DISTANCE_MILES}
          miles of the airport. Addresses farther than {INCLUDED_DISTANCE_MILES}
          miles may include a per-mile surcharge or follow-up adjustment.
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
