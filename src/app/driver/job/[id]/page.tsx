"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  addProof,
  type Booking,
  formatPrice,
  getBooking,
  SERVICE_LABELS,
  STATUS_LABELS,
  subscribe,
  updateBooking,
} from "@/lib/bookings";

const DRIVER_KEY = "travelyt:driver";

export default function DriverJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [driver, setDriver] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setDriver(localStorage.getItem(DRIVER_KEY));
    if (!params?.id) return;
    const refresh = () => setBooking(getBooking(params.id));
    refresh();
    const unsub = subscribe(refresh);
    return unsub;
  }, [params?.id]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
        <div className="max-w-md mx-auto px-4 pt-28 pb-16 text-center">
          <h1 className="text-2xl font-bold text-navy mb-3">Sign in first</h1>
          <Link href="/driver" className="px-6 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            Go to courier login
          </Link>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
        <div className="max-w-md mx-auto px-4 pt-28 pb-16 text-center">
          <h1 className="text-2xl font-bold text-navy mb-3">Job not found</h1>
          <Link href="/driver" className="px-6 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            Back to jobs
          </Link>
        </div>
      </div>
    );
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") setPendingPhoto(result);
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setPendingPhoto(null);
    setPhotoNote("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function claim() {
    if (!booking) return;
    updateBooking(booking.id, {
      status: "assigned",
      driverName: driver ?? undefined,
      assignedAt: new Date().toISOString(),
    });
  }

  function markPickedUp() {
    if (!booking || !pendingPhoto) return;
    addProof(booking.id, {
      kind: "pickup",
      dataUrl: pendingPhoto,
      timestamp: new Date().toISOString(),
      driverName: driver ?? undefined,
      note: photoNote || undefined,
    });
    updateBooking(booking.id, {
      status: "picked_up",
      pickedUpAt: new Date().toISOString(),
    });
    clearPhoto();
  }

  function markInTransit() {
    if (!booking) return;
    updateBooking(booking.id, { status: "in_transit" });
  }

  function markDelivered() {
    if (!booking || !pendingPhoto) return;
    addProof(booking.id, {
      kind: "delivery",
      dataUrl: pendingPhoto,
      timestamp: new Date().toISOString(),
      driverName: driver ?? undefined,
      note: photoNote || undefined,
    });
    updateBooking(booking.id, {
      status: "delivered",
      deliveredAt: new Date().toISOString(),
    });
    clearPhoto();
    setTimeout(() => router.push("/driver"), 800);
  }

  const isMine = booking.driverName === driver;
  const needsPickupPhoto = booking.status === "assigned" && isMine;
  const needsDeliveryPhoto = booking.status === "in_transit" && isMine;
  const showCamera = needsPickupPhoto || needsDeliveryPhoto;

  return (
    <div className="min-h-screen bg-[#f5f0ee]">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 pt-28 pb-16">
        <Link href="/driver" className="text-sm text-navy/40 hover:text-navy mb-4 inline-block">
          ← Back to jobs
        </Link>

        <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs text-navy/40 uppercase tracking-wider font-semibold mb-1">
                {booking.id}
              </p>
              <h1 className="text-2xl font-bold text-navy">{booking.name}</h1>
              <a href={`tel:${booking.phone}`} className="text-sm text-[#c41e2a] font-semibold hover:underline">
                {booking.phone}
              </a>
            </div>
            <span className="text-xs font-semibold text-[#c41e2a] bg-[#c41e2a]/10 px-2.5 py-1 rounded-full">
              {STATUS_LABELS[booking.status]}
            </span>
          </div>

          <div className="space-y-3 text-sm border-t border-gray-100 pt-5">
            <Row label="Service" value={SERVICE_LABELS[booking.service]} />
            <Row label={booking.service === "arrival" ? "Delivery" : "Pickup"} value={booking.address} />
            <Row label="Airport" value={booking.airport} />
            <Row label="Date" value={booking.date} />
            {booking.flight && <Row label="Flight" value={booking.flight} />}
            <Row label="Bags" value={`${booking.bags}`} />
            {booking.notes && <Row label="Notes" value={booking.notes} />}
          </div>

          <div className="border-t border-gray-100 mt-5 pt-5 flex justify-between text-sm">
            <span className="text-navy/40">Your payout</span>
            <span className="font-bold text-navy">
              {formatPrice(Math.round(booking.priceCents * 0.65))}
            </span>
          </div>
        </div>

        {/* Action area */}
        {booking.status === "paid" && (
          <button
            onClick={claim}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Claim this job
          </button>
        )}

        {!isMine && booking.status !== "paid" && (
          <div className="bg-navy/5 rounded-2xl p-5 text-sm text-navy/60 text-center">
            Assigned to {booking.driverName ?? "another courier"}.
          </div>
        )}

        {isMine && booking.status === "picked_up" && (
          <button
            onClick={markInTransit}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Mark in transit →
          </button>
        )}

        {showCamera && (
          <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8">
            <h2 className="font-bold text-navy mb-2">
              {needsPickupPhoto ? "Pickup proof" : "Delivery proof"}
            </h2>
            <p className="text-sm text-navy/50 mb-5">
              Take a clear photo of {booking.bags} bag{booking.bags > 1 ? "s" : ""}{" "}
              {needsPickupPhoto
                ? "at the pickup location with the customer present if possible."
                : "at the delivery point with seals intact."}
            </p>

            {!pendingPhoto ? (
              <label className="block">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFile}
                  className="hidden"
                />
                <span className="block w-full text-center py-12 rounded-xl border-2 border-dashed border-navy/20 hover:border-[#c41e2a] hover:bg-[#c41e2a]/5 transition-all cursor-pointer">
                  <span className="text-3xl block mb-2">📷</span>
                  <span className="text-sm font-semibold text-navy">Tap to capture</span>
                  <span className="block text-xs text-navy/40 mt-1">
                    Camera on mobile · File picker on desktop
                  </span>
                </span>
              </label>
            ) : (
              <div>
                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-gray-100 mb-4 bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingPhoto} alt="Capture" className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <textarea
                  rows={2}
                  placeholder="Optional note: seal numbers, bag descriptions, condition…"
                  value={photoNote}
                  onChange={(e) => setPhotoNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all resize-none mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={clearPhoto}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-navy font-semibold text-sm hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Retake
                  </button>
                  <button
                    onClick={needsPickupPhoto ? markPickedUp : markDelivered}
                    className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    {needsPickupPhoto ? "Confirm pickup" : "Confirm delivery"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Existing proofs */}
        {booking.proofs.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-lg shadow-navy/5 p-6">
            <h2 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-4">
              Proofs on file
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {booking.proofs.map((p, i) => (
                <div key={i} className="rounded-lg overflow-hidden border border-gray-100">
                  <div className="relative w-full aspect-square bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={p.kind} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                  <div className="px-2 py-1.5 text-xs">
                    <div className="font-semibold text-navy capitalize">{p.kind}</div>
                    <div className="text-navy/40">{new Date(p.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
