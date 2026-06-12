"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import LocationProofCard from "@/components/LocationProofCard";
import { enableBookingPush, isNative } from "@/lib/native";
import {
  approveProof,
  confirmDelivery,
  type Booking,
  type BookingStatus,
  formatPrice,
  getBooking,
  getBookingStatusLabel,
  getLastApiFailureMessage,
  subscribe,
  SERVICE_LABELS,
  STATUS_ORDER,
  statusIndex,
} from "@/lib/bookings";
import { INCLUDED_DISTANCE_MILES } from "@/lib/pricing";
import { latestLocationEvent } from "@/lib/ops-rules";

const VISIBLE_STATUSES: BookingStatus[] = STATUS_ORDER;

export default function BookingPage() {
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [native, setNative] = useState(false);
  const [pushState, setPushState] = useState<
    "idle" | "working" | "enabled" | "denied"
  >("idle");
  const [approvingProof, setApprovingProof] = useState<number | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");

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

  const terminalStatus =
    booking.status === "cancelled" || booking.status === "issue";
  const current = terminalStatus ? -1 : statusIndex(booking.status);
  const lastLocation = latestLocationEvent(booking);
  const enableLiveUpdates = async () => {
    setPushState("working");
    const ok = await enableBookingPush(booking.id);
    setPushState(ok ? "enabled" : "denied");
  };
  const approveCustodyProof = async (proofIndex: number) => {
    setApprovingProof(proofIndex);
    const updated = await approveProof(booking.id, proofIndex, booking.email);
    if (updated) setBooking(updated);
    setApprovingProof(null);
  };
  const confirmCustomerDelivery = async () => {
    setConfirmationError("");
    if (!signatureName.trim()) {
      setConfirmationError("Enter the receiving customer name.");
      return;
    }
    if (!confirmationCode.trim()) {
      setConfirmationError("Enter the confirmation code.");
      return;
    }

    setConfirmingDelivery(true);
    const updated = await confirmDelivery(
      booking.id,
      signatureName,
      confirmationCode.trim()
    );
    if (updated) {
      setBooking(updated);
      setSignatureName("");
      setConfirmationCode("");
    } else {
      setConfirmationError(
        getLastApiFailureMessage() || "Could not confirm delivery. Check the code and try again."
      );
    }
    setConfirmingDelivery(false);
  };

  return (
    <AppChrome title="Tracking">
      <div>
        <div className="mb-5">
          <p className="text-xs text-navy/70 uppercase tracking-wider font-semibold mb-2">
            Booking {booking.id}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-navy mb-2">
            {getBookingStatusLabel(booking)}
          </h1>
          <p className="text-navy/70">
            {SERVICE_LABELS[booking.service]} · {booking.bags} bag
            {booking.bags > 1 ? "s" : ""} · {booking.date}
          </p>
        </div>

        {terminalStatus && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm leading-relaxed text-red-800">
            <div className="font-bold">{getBookingStatusLabel(booking)}</div>
            <p className="mt-1">
              Travelyt operations needs to review this booking before it can
              continue. Contact support if you need help.
            </p>
          </div>
        )}

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
                        ? "bg-[#ff6868] text-white ring-4 ring-[#ff6868]/20 animate-pulse"
                        : isDone
                          ? "bg-navy text-white"
                          : "bg-gray-100 text-navy/30"
                    }`}
                  >
                    {isDone && !isCurrent ? "✓" : ""}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${isDone ? "text-navy" : "text-navy/30"}`}>
                      {getBookingStatusLabel({ service: booking.service, status: s })}
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
              {booking.proofs.map((p, i) => {
                const needsApproval = p.kind === "seal" && !p.approvedAt;
                return (
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
                      {proofTitle(p.kind)}
                    </div>
                    {p.sealId && (
                      <div className="mt-1 inline-flex rounded-full bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy">
                        Seal {p.sealId}
                      </div>
                    )}
                    <div className="text-xs text-navy/70 mt-0.5">
                      {new Date(p.timestamp).toLocaleString()}
                      {p.driverName ? ` · ${p.driverName}` : ""}
                    </div>
                    {p.note && (
                      <div className="text-xs text-navy/70 mt-2">{p.note}</div>
                    )}
                    {p.handoff && (
                      <div className="mt-2 rounded-lg bg-navy/5 px-3 py-2 text-xs text-navy/70">
                        <div className="font-semibold text-navy">
                          Accepted by {p.handoff.recipientName}
                        </div>
                        <div>
                          {p.handoff.organization}
                          {p.handoff.recipientRole
                            ? ` · ${p.handoff.recipientRole}`
                            : ""}
                        </div>
                        {p.handoff.badgeOrReference && (
                          <div>Reference: {p.handoff.badgeOrReference}</div>
                        )}
                      </div>
                    )}
                    {p.location && (
                      <LocationProofCard
                        label={`${proofTitle(p.kind)} location`}
                        latitude={p.location.latitude}
                        longitude={p.location.longitude}
                        accuracyMeters={p.location.accuracyMeters}
                        capturedAt={p.timestamp}
                        actorName={p.driverName}
                        className="mt-3"
                        compact
                      />
                    )}
                    {p.approvedAt ? (
                      <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                        Approved by customer · {new Date(p.approvedAt).toLocaleString()}
                      </div>
                    ) : needsApproval ? (
                      <button
                        type="button"
                        onClick={() => approveCustodyProof(i)}
                        disabled={approvingProof === i}
                        className="mt-3 w-full rounded-lg bg-[#ff6868] px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                      >
                        {approvingProof === i ? "Approving..." : "Approve seal proof"}
                      </button>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {lastLocation && (
          <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-5 md:p-6 mb-5">
            <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-3">
              Last custody location
            </h2>
            <LocationProofCard
              label={lastLocation.label}
              latitude={lastLocation.latitude}
              longitude={lastLocation.longitude}
              accuracyMeters={lastLocation.accuracyMeters}
              capturedAt={lastLocation.capturedAt}
              actorName={lastLocation.actorName}
            />
          </div>
        )}

        {booking.status === "delivery_pending" && (
          <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-5 md:p-8 mb-5">
            <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-4">
              Confirm delivery
            </h2>
            <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-900">
              Driver delivery proof is on file. Confirm only after the bag is
              physically received and matches the proof.
            </div>
            {booking.deliveryConfirmationCode && (
              <div className="mt-4 rounded-xl border border-navy/10 bg-navy/5 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-navy/60">
                  Customer confirmation code
                </div>
                <div className="mt-1 font-mono text-2xl font-bold tracking-wider text-navy">
                  {booking.deliveryConfirmationCode}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-navy">
                Receiving name
                <input
                  value={signatureName}
                  onChange={(event) => setSignatureName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-navy outline-none focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/15"
                  placeholder="Full name"
                />
              </label>
              <label className="text-sm font-semibold text-navy">
                Confirmation code
                <input
                  value={confirmationCode}
                  onChange={(event) =>
                    setConfirmationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium tracking-widest text-navy outline-none focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/15"
                  placeholder="6-digit code"
                />
              </label>
            </div>
            {confirmationError && (
              <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {confirmationError}
              </div>
            )}
            <button
              type="button"
              onClick={confirmCustomerDelivery}
              disabled={confirmingDelivery}
              className="mt-4 w-full rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {confirmingDelivery ? "Confirming..." : "Confirm and close booking"}
            </button>
          </div>
        )}

        {booking.status === "closed" && (
          <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-800">
            <div className="font-bold">Delivery confirmed and closed</div>
            <p className="mt-1">
              {booking.customerSignatureName
                ? `${booking.customerSignatureName} confirmed delivery.`
                : "The customer confirmed delivery."}
            </p>
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
            {booking.flightTime && (
              <Row
                label={booking.service === "arrival" ? "Arrival Time" : "Departure Time"}
                value={booking.flightTime}
              />
            )}
            {booking.flight && <Row label="Flight" value={booking.flight} />}
            <Row label="Bags" value={`${booking.bags}`} />
            <Row
              label="Coverage"
              value={
                booking.declaredValueCents
                  ? `Declared value ${formatPrice(booking.declaredValueCents)}`
                  : "Standard coverage"
              }
            />
            {booking.driverName && <Row label="Driver" value={booking.driverName} />}
          </div>
          <div className="border-t border-gray-100 mt-5 pt-5 flex justify-between">
            <span className="text-navy/70 font-medium">Base estimate</span>
            <span className="font-bold text-navy">{formatPrice(booking.priceCents)}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-navy/60">
            Includes service within {INCLUDED_DISTANCE_MILES} miles of the
            airport. Routes beyond {INCLUDED_DISTANCE_MILES} miles may include a
            per-mile surcharge before payment is collected.
          </p>
        </div>

        <div className="bg-navy/5 rounded-2xl p-5 text-sm text-navy/70">
          <div className="font-semibold text-navy mb-1">What happens next</div>
          {booking.status === "pending" ? (
            <>
              Complete secure checkout so Travelyt can confirm the request and
              prepare driver assignment.
              <Link
                href={`/booking/${booking.id}/pay`}
                className="mt-4 block rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff7a85] px-5 py-3 text-center text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                Pay securely with Stripe
              </Link>
            </>
          ) : terminalStatus ? (
            "Travelyt support will review the issue or cancellation before this booking can continue."
          ) : booking.status === "delivery_pending" ? (
            "Review the proof, enter the customer confirmation code, and close the booking once the bag is physically received."
          ) : booking.status === "closed" ? (
            "This booking is closed with customer confirmation recorded."
          ) : (
            "Travelyt coordination, the assigned driver, and customer proof checks will keep this booking moving."
          )}
        </div>
      </div>
    </AppChrome>
  );
}

function proofTitle(kind: Booking["proofs"][number]["kind"]) {
  if (kind === "seal") return "Seal applied";
  if (kind === "pickup") return "Picked up";
  if (kind === "airline_handoff") return "Airline handoff";
  return "Delivered";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy/70 font-medium shrink-0">{label}</span>
      <span className="text-navy font-semibold text-right break-words">{value}</span>
    </div>
  );
}
