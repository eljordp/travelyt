"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LocationProofCard from "@/components/LocationProofCard";
import {
  approveProof,
  type Booking,
  type BookingStatus,
  formatPrice,
  getBooking,
  SERVICE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  statusIndex,
  subscribe,
} from "@/lib/bookings";
import { INCLUDED_DISTANCE_MILES } from "@/lib/pricing";
import { latestLocationEvent } from "@/lib/ops-rules";

const VISIBLE_STATUSES: BookingStatus[] = STATUS_ORDER;
const BOOKING_REFRESH_MS = 30_000;

export default function TrackPage() {
  return (
    <Suspense fallback={<TrackShell>Loading tracking...</TrackShell>}>
      <TrackPageInner />
    </Suspense>
  );
}

function TrackPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [approvingProof, setApprovingProof] = useState<number | null>(null);

  const id = params?.id;
  const accessToken = searchParams.get("token") || searchParams.get("accessToken");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function refresh(force = false) {
      if (!force && document.visibilityState === "hidden") return;
      const result = await getBooking(id, accessToken);
      if (!cancelled) setBooking(result);
    }

    void refresh(true).finally(() => {
      if (!cancelled) setLoading(false);
    });

    const interval = setInterval(() => {
      void refresh();
    }, BOOKING_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const unsub = subscribe(refresh);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsub();
    };
  }, [id, accessToken]);

  async function approveCustodyProof(proofIndex: number) {
    if (!booking) return;
    setApprovingProof(proofIndex);
    const updated = await approveProof(booking.id, proofIndex, booking.email);
    if (updated) setBooking(updated);
    setApprovingProof(null);
  }

  if (loading) {
    return <TrackShell>Loading tracking...</TrackShell>;
  }

  if (!booking) {
    return (
      <TrackShell>
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center shadow-sm shadow-navy/5">
          <AlertTriangle className="mx-auto h-10 w-10 text-[#c41e2a]" strokeWidth={1.8} />
          <h1 className="mt-4 text-2xl font-bold text-navy">
            Tracking link not found
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-navy/65">
            Use the exact tracking link from your Travelyt confirmation. If you
            need help, support can resend the secure link.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/support"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
            >
              Contact support <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/quote"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy/5 px-5 py-3 text-sm font-bold text-navy hover:bg-navy/10"
            >
              Start a request
            </Link>
          </div>
        </div>
      </TrackShell>
    );
  }

  const current = statusIndex(booking.status);
  const latestSeal = [...booking.proofs].reverse().find((proof) => proof.sealId)?.sealId;
  const paid = Boolean(booking.paidAt || booking.status !== "pending");
  const lastLocation = latestLocationEvent(booking);

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-navy">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-28">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              Tracking {booking.id}
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-navy sm:text-5xl">
              {STATUS_LABELS[booking.status]}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-navy/65">
              Follow your bags from request confirmation through pickup,
              tamper-evident seal, transport, and final handoff.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <StatusPill
                icon={ShieldCheck}
                label={latestSeal ? `Seal ${latestSeal}` : "Seal pending"}
              />
              <StatusPill
                icon={Clock3}
                label={paid ? "Confirmed" : "Awaiting confirmation"}
              />
              <StatusPill
                icon={Camera}
                label={`${booking.proofs.length} proof${booking.proofs.length === 1 ? "" : "s"}`}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60">
                Trip details
              </h2>
              <div className="mt-5 space-y-3 text-sm">
                <Row label="Service" value={SERVICE_LABELS[booking.service]} />
                <Row label="Airport" value={booking.airport} />
                <Row
                  label={booking.service === "arrival" ? "Delivery" : "Pickup"}
                  value={booking.address}
                />
                <Row label="Date" value={booking.date} />
                {booking.flight && <Row label="Flight" value={booking.flight} />}
                <Row
                  label="Bags"
                  value={`${booking.bags} bag${booking.bags === 1 ? "" : "s"}`}
                />
                {booking.driverName && <Row label="Courier" value={booking.driverName} />}
              </div>
              <div className="mt-5 border-t border-gray-100 pt-5">
                <Row label="Estimate" value={formatPrice(booking.priceCents)} />
                <p className="mt-3 text-xs leading-relaxed text-navy/55">
                  Includes service within {INCLUDED_DISTANCE_MILES} miles of the
                  airport. Final confirmation happens before payment is collected.
                </p>
              </div>
            </div>
            {lastLocation && (
              <LocationProofCard
                label={lastLocation.label}
                latitude={lastLocation.latitude}
                longitude={lastLocation.longitude}
                accuracyMeters={lastLocation.accuracyMeters}
                capturedAt={lastLocation.capturedAt}
                actorName={lastLocation.actorName}
              />
            )}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60">
              Live status
            </h2>
            <div className="mt-5 space-y-4">
              {VISIBLE_STATUSES.map((status) => {
                const index = statusIndex(status);
                const isDone = index <= current;
                const isCurrent = index === current;

                return (
                  <div key={status} className="flex gap-4">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isCurrent
                          ? "bg-[#c41e2a] text-white ring-4 ring-[#c41e2a]/15"
                          : isDone
                            ? "bg-navy text-white"
                            : "bg-gray-100 text-navy/30"
                      }`}
                    >
                      {isDone && !isCurrent ? (
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className={`text-sm font-bold ${isDone ? "text-navy" : "text-navy/35"}`}>
                        {STATUS_LABELS[status]}
                      </p>
                      {isCurrent && (
                        <p className="mt-1 text-xs leading-relaxed text-navy/55">
                          This is the latest confirmed checkpoint from Travelyt.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-navy/60">
                  Chain of custody
                </h2>
                <p className="mt-2 text-sm text-navy/60">
                  Seal numbers, pickup photos, delivery photos, and customer
                  approvals live here.
                </p>
              </div>
              <Link
                href="/support"
                className="inline-flex items-center gap-2 text-sm font-bold text-[#c41e2a] hover:text-navy"
              >
                Need help? <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {booking.proofs.length ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {booking.proofs.map((proof, index) => {
                  const needsApproval = proof.kind === "seal" && !proof.approvedAt;
                  return (
                    <div
                      key={`${proof.kind}-${proof.timestamp}-${index}`}
                      className="overflow-hidden rounded-xl border border-gray-100"
                    >
                      <div className="relative aspect-[4/3] w-full bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={proof.dataUrl}
                          alt={`${proof.kind} proof`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-navy">{proofTitle(proof.kind)}</p>
                        {proof.sealId && (
                          <p className="mt-1 inline-flex rounded-full bg-navy/5 px-2.5 py-1 text-xs font-bold text-navy">
                            Seal {proof.sealId}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-navy/55">
                          {new Date(proof.timestamp).toLocaleString()}
                          {proof.driverName ? ` - ${proof.driverName}` : ""}
                        </p>
                        {proof.note && (
                          <p className="mt-2 text-xs leading-relaxed text-navy/65">
                            {proof.note}
                          </p>
                        )}
                        {proof.location && (
                          <LocationProofCard
                            label={`${proofTitle(proof.kind)} location`}
                            latitude={proof.location.latitude}
                            longitude={proof.location.longitude}
                            accuracyMeters={proof.location.accuracyMeters}
                            capturedAt={proof.timestamp}
                            actorName={proof.driverName}
                            className="mt-3"
                            compact
                          />
                        )}
                        {proof.approvedAt ? (
                          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
                            Customer approved {new Date(proof.approvedAt).toLocaleString()}
                          </p>
                        ) : needsApproval ? (
                          <button
                            type="button"
                            onClick={() => approveCustodyProof(index)}
                            disabled={approvingProof === index}
                            className="mt-3 w-full rounded-lg bg-[#c41e2a] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#a91823] disabled:cursor-wait disabled:opacity-60"
                          >
                            {approvingProof === index ? "Approving..." : "Approve seal proof"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-navy/15 p-6 text-sm leading-relaxed text-navy/60">
                Proof photos appear after the courier applies the seal and
                confirms pickup.
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function TrackShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-navy">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-28">{children}</main>
      <Footer />
    </div>
  );
}

function StatusPill({
  icon: Icon,
  label,
}: {
  icon: typeof ShieldCheck;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 font-semibold text-navy shadow-sm shadow-navy/5">
      <Icon className="h-4 w-4 text-[#c41e2a]" strokeWidth={2} />
      {label}
    </span>
  );
}

function proofTitle(kind: Booking["proofs"][number]["kind"]) {
  if (kind === "seal") return "Seal applied";
  if (kind === "pickup") return "Pickup proof";
  return "Delivery proof";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 font-medium text-navy/60">{label}</span>
      <span className="text-right font-bold text-navy">{value}</span>
    </div>
  );
}
