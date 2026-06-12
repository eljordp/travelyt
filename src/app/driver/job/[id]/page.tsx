"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppChrome from "@/components/AppChrome";
import {
  addProof,
  type Booking,
  formatPrice,
  getBooking,
  getBookingStatusLabel,
  getLastApiFailureMessage,
  recordClientOpsException,
  SERVICE_LABELS,
  subscribe,
  updateBooking,
} from "@/lib/bookings";
import { driverNameMatches } from "@/lib/drivers";
import { captureCurrentLocation, captureProofPhoto, isNative } from "@/lib/native";

const DRIVER_KEY = "travelyt:driver";
type ProofLocation = NonNullable<Booking["proofs"][number]["location"]>;

function custodyBlockers(booking: Booking) {
  const blockers: string[] = [];
  if (!booking.customerIdentityVerifiedAt) {
    blockers.push("Customer ID review is not complete.");
  }
  if (!booking.driverIdentityVerifiedAt) {
    blockers.push("Driver ID review is not complete.");
  }
  if (!booking.restrictedItemsAttestedAt) {
    blockers.push("Manual ID/bag review is not complete.");
  }
  return blockers;
}

function latestApiError(fallback: string) {
  return getLastApiFailureMessage() || fallback;
}

function DriverJobChrome({
  children,
  title = "Driver job",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <AppChrome
      title={title}
      action={
        <Link
          href="/driver"
          aria-label="Back to driver jobs"
          className="flex h-10 items-center gap-1.5 rounded-full bg-navy/5 px-3 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          Jobs
        </Link>
      }
    >
      {children}
    </AppChrome>
  );
}

export default function DriverJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [driver, setDriver] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | undefined>(undefined);
  const [mounted, setMounted] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [sealId, setSealId] = useState("");
  const [handoffRecipientName, setHandoffRecipientName] = useState("");
  const [handoffRecipientRole, setHandoffRecipientRole] = useState("");
  const [handoffOrganization, setHandoffOrganization] = useState("");
  const [handoffReference, setHandoffReference] = useState("");
  const [error, setError] = useState("");
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "working" | "captured" | "denied" | "unavailable"
  >("idle");
  const [native, setNative] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setNative(isNative()), 0);
    return () => window.clearTimeout(handle);
  }, []);

  async function captureNative() {
    const dataUrl = await captureProofPhoto();
    if (dataUrl) setPendingPhoto(dataUrl);
  }

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const result = await getBooking(params.id);
      if (!cancelled) setBooking(result);
    };
    const handle = window.setTimeout(() => {
      setMounted(true);
      setDriver(localStorage.getItem(DRIVER_KEY));
      if (params?.id) refresh();
    }, 0);
    if (!params?.id) {
      return () => window.clearTimeout(handle);
    }
    const unsub = subscribe(refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      unsub();
    };
  }, [params?.id]);

  if (!mounted) {
    return (
      <DriverJobChrome title="Driver">
        <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
          <div className="h-4 w-28 rounded-full bg-navy/10" />
          <div className="mt-4 h-32 rounded-xl bg-navy/5" />
        </div>
      </DriverJobChrome>
    );
  }

  if (!driver) {
    return (
      <DriverJobChrome title="Driver">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm shadow-navy/5">
          <h1 className="text-2xl font-bold text-navy mb-3">Sign in first</h1>
          <Link href="/driver" className="px-6 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            Go to courier login
          </Link>
        </div>
      </DriverJobChrome>
    );
  }

  if (!booking) {
    return (
      <DriverJobChrome title="Driver">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm shadow-navy/5">
          <h1 className="text-2xl font-bold text-navy mb-3">Job not found</h1>
          <Link href="/driver" className="px-6 py-3 rounded-xl bg-navy text-white font-semibold text-sm hover:opacity-90 transition-opacity">
            Back to jobs
          </Link>
        </div>
      </DriverJobChrome>
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
    setSealId("");
    setHandoffRecipientName("");
    setHandoffRecipientRole("");
    setHandoffOrganization("");
    setHandoffReference("");
    setError("");
    setLocationStatus("idle");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function captureLocation(): Promise<ProofLocation | undefined> {
    if (!isNative() && !("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      setError("Location is not available on this device.");
      return undefined;
    }

    setLocationStatus("working");
    const location = await captureCurrentLocation();
    if (location) {
      setLocationStatus("captured");
      return location;
    }

    setLocationStatus("denied");
    setError("Allow location access before confirming custody.");
    if (booking) {
      void recordClientOpsException(
        booking.id,
        "GPS_DENIED",
        "Driver denied or could not capture GPS during custody proof.",
        "warning",
        { status: booking.status, service: booking.service }
      );
    }
    return undefined;
  }

  async function acceptJob() {
    if (!booking) return;
    const updated = await updateBooking(booking.id, {
      status: "accepted",
      driverName: booking.driverName || driver || undefined,
      assignedAt: booking.assignedAt ?? new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
    }, `${driver} accepted the job.`);
    if (updated) setBooking(updated);
    else setError(latestApiError("Could not accept this job. Refresh and check driver access or schedule conflicts."));
  }

  async function markEnRoute() {
    if (!booking) return;
    const location = await captureLocation();
    if (!location) return;
    const updated = await updateBooking(booking.id, {
      status: "en_route",
      enRouteAt: new Date().toISOString(),
    }, `${driver} started route to the customer or airport. GPS ${location.latitude}, ${location.longitude}.`, {
      kind: "driver_en_route",
      location,
      note: "Driver started route.",
    });
    if (updated) setBooking(updated);
    else setError(latestApiError("Could not mark driver en route."));
  }

  async function markArrived() {
    if (!booking) return;
    const location = await captureLocation();
    if (!location) return;
    const updated = await updateBooking(booking.id, {
      status: "arrived",
      arrivedAt: new Date().toISOString(),
    }, `${driver} arrived at the custody location. GPS ${location.latitude}, ${location.longitude}.`, {
      kind: "driver_arrived",
      location,
      note: "Driver arrived at the custody location.",
    });
    if (updated) setBooking(updated);
    else setError(latestApiError("Could not mark driver arrived."));
  }

  async function markPickedUp() {
    if (!booking || !pendingPhoto) return;
    const cleanSealId = sealId.trim().toUpperCase();
    if (!cleanSealId) {
      setError("Enter the seal ID before confirming pickup.");
      return;
    }
    const location = await captureLocation();
    if (!location) return;
    const proofSaved = await addProof(booking.id, {
      kind: "seal",
      dataUrl: pendingPhoto,
      timestamp: new Date().toISOString(),
      location,
      sealId: cleanSealId,
      driverName: driver ?? undefined,
      note: photoNote || undefined,
    });
    if (!proofSaved) {
      setError(latestApiError("Seal proof could not be saved."));
      return;
    }
    const updated = await updateBooking(booking.id, {
      status: "picked_up",
      pickedUpAt: new Date().toISOString(),
    }, `${driver} confirmed sealed pickup and started custody.`);
    if (!updated) {
      setError(latestApiError("Pickup could not be confirmed. Travelyt may still need ID verification or restricted-item approval."));
      return;
    }
    setBooking(updated);
    clearPhoto();
  }

  async function markAirlineHandoff() {
    if (!booking || !pendingPhoto) return;
    const recipientName = handoffRecipientName.trim();
    const organization = handoffOrganization.trim();
    const badgeOrReference = handoffReference.trim();
    if (!recipientName || !organization || !badgeOrReference) {
      setError("Enter who accepted the bags, their airline/company, and badge or reference.");
      return;
    }
    const latestSeal = [...booking.proofs].reverse().find((p) => p.sealId)?.sealId;
    const location = await captureLocation();
    if (!location) return;
    const proofSaved = await addProof(booking.id, {
      kind: "airline_handoff",
      dataUrl: pendingPhoto,
      timestamp: new Date().toISOString(),
      location,
      sealId: latestSeal,
      driverName: driver ?? undefined,
      handoff: {
        recipientName,
        recipientRole: handoffRecipientRole.trim() || undefined,
        organization,
        badgeOrReference,
        verificationMethod: "employee_badge",
      },
      note: photoNote || undefined,
    });
    if (!proofSaved) {
      setError(latestApiError("Airline handoff proof could not be saved."));
      return;
    }
    const updated = await updateBooking(booking.id, {
      status: booking.service === "departure" ? "delivered" : "in_transit",
      deliveredAt:
        booking.service === "departure" ? new Date().toISOString() : undefined,
    }, `${driver} confirmed airline handoff.`);
    if (!updated) {
      setError(latestApiError("Airline handoff could not be confirmed. Customer seal approval may still be pending."));
      return;
    }
    setBooking(updated);
    clearPhoto();
    if (updated?.status === "delivered") {
      setTimeout(() => router.push("/driver"), 800);
    }
  }

  async function markAirportRelease() {
    if (!booking || !pendingPhoto) return;
    const recipientName = handoffRecipientName.trim();
    const organization = handoffOrganization.trim();
    const badgeOrReference = handoffReference.trim();
    if (!recipientName || !organization || !badgeOrReference) {
      setError("Enter who released the bags, their airline/company, and badge or reference.");
      return;
    }
    const location = await captureLocation();
    if (!location) return;
    const proofSaved = await addProof(booking.id, {
      kind: "pickup",
      dataUrl: pendingPhoto,
      timestamp: new Date().toISOString(),
      location,
      driverName: driver ?? undefined,
      handoff: {
        recipientName,
        recipientRole: handoffRecipientRole.trim() || undefined,
        organization,
        badgeOrReference,
        verificationMethod: "employee_badge",
      },
      note: photoNote || undefined,
    });
    if (!proofSaved) {
      setError(latestApiError("Airport release proof could not be saved."));
      return;
    }
    const updated = await updateBooking(booking.id, {
      status: "in_transit",
      pickedUpAt: new Date().toISOString(),
    }, `${driver} confirmed airport release and started custody.`);
    if (!updated) {
      setError(latestApiError("Airport release could not be confirmed. Travelyt may still need ID verification."));
      return;
    }
    setBooking(updated);
    clearPhoto();
  }

  async function markDelivered() {
    if (!booking || !pendingPhoto) return;
    const latestSeal = [...booking.proofs].reverse().find((p) => p.sealId)?.sealId;
    const location = await captureLocation();
    if (!location) return;
    const proofSaved = await addProof(booking.id, {
      kind: "delivery",
      dataUrl: pendingPhoto,
      timestamp: new Date().toISOString(),
      location,
      sealId: latestSeal,
      driverName: driver ?? undefined,
      note: photoNote || undefined,
    });
    if (!proofSaved) {
      setError(latestApiError("Delivery proof could not be saved."));
      return;
    }
    const updated = await updateBooking(booking.id, {
      status: "delivery_pending",
      deliveryPendingAt: new Date().toISOString(),
    }, `${driver} submitted final delivery proof and is waiting for customer confirmation.`);
    if (!updated) {
      setError(latestApiError("Delivery could not be confirmed. Make sure photo and GPS proof are captured."));
      return;
    }
    setBooking(updated);
    clearPhoto();
    setTimeout(() => router.push("/driver"), 800);
  }

  const isMine = driverNameMatches(booking.driverName, driver);
  const isPending = booking.status === "pending";
  const customerName = isPending ? "Customer hidden" : booking.name;
  const customerPhone = isPending ? "" : booking.phone;
  const jobAddress = isPending
    ? "Hidden until Travelyt confirms this booking."
    : booking.address;
  const jobNotes = isPending ? undefined : booking.notes;
  const isDepartureService = booking.service !== "arrival";
  const isArrivalService = booking.service !== "departure";
  const latestSealProof = [...booking.proofs]
    .reverse()
    .find((proof) => proof.kind === "seal");
  const blockers = custodyBlockers(booking);
  const custodyBlocked =
    booking.status === "arrived" && isMine && blockers.length > 0;
  const terminalStatus =
    booking.status === "cancelled" ||
    booking.status === "issue" ||
    booking.status === "delivered" ||
    booking.status === "closed";
  const sealApprovalRequired =
    isDepartureService &&
    booking.status === "picked_up" &&
    isMine &&
    !latestSealProof?.approvedAt;
  const needsPickupPhoto =
    booking.status === "arrived" && isMine && isDepartureService;
  const needsAirportRelease =
    booking.status === "arrived" && isMine && booking.service === "arrival";
  const needsAirlineHandoff =
    booking.status === "picked_up" &&
    isMine &&
    isDepartureService &&
    Boolean(latestSealProof?.approvedAt);
  const needsDeliveryPhoto =
    booking.status === "in_transit" && isMine && isArrivalService;
  const showCamera =
    !custodyBlocked &&
    (needsPickupPhoto ||
      needsAirportRelease ||
      needsAirlineHandoff ||
      needsDeliveryPhoto);

  return (
    <DriverJobChrome>
      <div className="mx-auto max-w-2xl">
        <Link
          href="/driver"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy/70 transition-colors hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          Back to jobs
        </Link>

        <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs text-navy/70 uppercase tracking-wider font-semibold mb-1">
                {booking.id}
              </p>
              <h1 className="text-2xl font-bold text-navy">{customerName}</h1>
              {customerPhone ? (
                <a href={`tel:${customerPhone}`} className="text-sm text-[#ff6868] font-semibold hover:underline">
                  {customerPhone}
                </a>
              ) : (
                <p className="text-sm font-semibold text-navy/55">
                  Contact hidden until confirmed
                </p>
              )}
            </div>
            <span className="text-xs font-semibold text-[#ff6868] bg-[#ff6868]/10 px-2.5 py-1 rounded-full">
              {getBookingStatusLabel(booking)}
            </span>
          </div>

          <div className="space-y-3 text-sm border-t border-gray-100 pt-5">
            <Row label="Service" value={SERVICE_LABELS[booking.service]} />
            <Row label={booking.service === "arrival" ? "Delivery" : "Pickup"} value={jobAddress} />
            <Row label="Airport" value={booking.airport} />
            <Row label="Date" value={booking.date} />
            {booking.flightTime && (
              <Row
                label={booking.service === "arrival" ? "Arrival" : "Departure"}
                value={booking.flightTime}
              />
            )}
            {booking.flight && <Row label="Flight" value={booking.flight} />}
            <Row label="Bags" value={`${booking.bags}`} />
            {jobNotes && <Row label="Notes" value={jobNotes} />}
          </div>

          <div className="border-t border-gray-100 mt-5 pt-5 flex justify-between text-sm">
            <span className="text-navy/70">Your payout</span>
            <span className="font-bold text-navy">
              {isPending ? "Pending confirmation" : formatPrice(Math.round(booking.priceCents * 0.65))}
            </span>
          </div>
        </div>

        {/* Action area */}
        {isPending && (
          <div className="bg-white rounded-2xl border border-dashed border-navy/15 p-5 text-sm text-navy/70 text-center">
            Payment or manual confirmation is still pending. This booking is
            visible for planning, but it cannot be accepted until it is confirmed
            by Travelyt.
          </div>
        )}

        {booking.status === "paid" && !booking.driverName && (
          <button
            onClick={acceptJob}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff6868] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Accept this job
          </button>
        )}

        {booking.status === "assigned" && isMine && (
          <button
            onClick={acceptJob}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff6868] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Accept assigned job
          </button>
        )}

        {booking.status === "accepted" && isMine && (
          <button
            onClick={markEnRoute}
            disabled={locationStatus === "working"}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff6868] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            {locationStatus === "working" ? "Capturing route GPS..." : "Start route"}
          </button>
        )}

        {booking.status === "en_route" && isMine && (
          <button
            onClick={markArrived}
            disabled={locationStatus === "working"}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff6868] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            {locationStatus === "working" ? "Capturing arrival GPS..." : "Mark arrived"}
          </button>
        )}

        {!isMine && booking.status === "paid" && booking.driverName && (
          <div className="bg-navy/5 rounded-2xl p-5 text-sm text-navy/70 text-center">
            Assigned to {booking.driverName}.
          </div>
        )}

        {!isMine && !isPending && booking.status !== "paid" && !terminalStatus && (
          <div className="bg-navy/5 rounded-2xl p-5 text-sm text-navy/70 text-center">
            Assigned to {booking.driverName ?? "another courier"}.
          </div>
        )}

        {terminalStatus && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm leading-relaxed text-red-800">
            <div className="font-bold">{getBookingStatusLabel(booking)}</div>
            <p className="mt-1">
              This job is no longer active for courier action. Contact Travelyt
              ops before moving bags or changing custody.
            </p>
          </div>
        )}

        {booking.status === "delivery_pending" && isMine && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-relaxed text-orange-900">
            <div className="font-bold">Waiting for customer confirmation</div>
            <p className="mt-1">
              Delivery proof is on file. The customer must confirm receipt from
              their Travelyt tracking page before this job closes.
            </p>
          </div>
        )}

        {custodyBlocked && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm leading-relaxed text-red-800">
            <div className="font-bold">
              Driver cannot start because manual ID/bag review is not complete.
            </div>
            <p className="mt-1">
              Ask admin to use the custody readiness override before pickup or
              airport release.
            </p>
            <ul className="mt-3 space-y-1 text-xs">
              {blockers.map((blocker) => (
                <li key={blocker}>- {blocker}</li>
              ))}
            </ul>
          </div>
        )}

        {sealApprovalRequired && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm leading-relaxed text-yellow-900">
            <div className="font-bold">Waiting for customer seal approval</div>
            <p className="mt-1">
              The customer must approve the seal proof before you can continue
              to airline handoff. This protects chain of custody before the
              bags leave the pickup location.
            </p>
          </div>
        )}

        {showCamera && (
          <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 md:p-8">
            <h2 className="font-bold text-navy mb-2">
              {needsPickupPhoto
                ? "Seal proof"
                : needsAirportRelease
                  ? "Airport release proof"
                : needsAirlineHandoff
                  ? "Airline handoff proof"
                  : "Delivery proof"}
            </h2>
            <p className="text-sm text-navy/70 mb-5">
              Take a clear photo of {booking.bags} bag{booking.bags > 1 ? "s" : ""}{" "}
              {needsPickupPhoto
                ? "after the tamper-evident seal is attached. Make sure the seal number is visible."
                : needsAirportRelease
                  ? "at the airport release point. Capture the bags and record who released them to Travelyt."
                : needsAirlineHandoff
                  ? "at the airline handoff point. Capture the sealed bags and any permitted handoff context."
                  : "at the delivery point with seals intact."}
            </p>
            <div className="mb-5 rounded-xl border border-navy/10 bg-navy/[0.03] p-4 text-xs leading-relaxed text-navy/70">
              Location is required for custody events. When you confirm,
              Travelyt stores the current GPS coordinates, timestamp, and
              accuracy with the photo proof.
            </div>
            {needsPickupPhoto && (
              <div className="mb-4">
                <label
                  htmlFor="seal-id"
                  className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5"
                >
                  Seal ID
                </label>
                <input
                  id="seal-id"
                  value={sealId}
                  onChange={(event) => {
                    setSealId(event.target.value.toUpperCase());
                    setError("");
                  }}
                  placeholder="Example: TVT-483921"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all uppercase tracking-wide"
                />
                <p className="mt-1 text-xs text-navy/60">
                  Use the printed number on the tamper-evident seal.
                </p>
              </div>
            )}
            {(needsAirlineHandoff || needsAirportRelease) && (
              <div className="mb-4 space-y-4">
                <div className="rounded-xl border border-[#ff6868]/15 bg-[#ff6868]/5 p-4 text-xs leading-relaxed text-navy/70">
                  {needsAirportRelease
                    ? "Confirm the airport or airline employee identity before accepting custody."
                    : "Confirm the receiving employee identity before handoff."}{" "}
                  Record their name, airline/company, and badge or accepted
                  reference. Do not photograph private ID documents unless the
                  airline or airport explicitly permits it.
                </div>
                <div>
                  <label htmlFor="handoff-recipient" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                    Receiving employee name
                  </label>
                  <input
                    id="handoff-recipient"
                    value={handoffRecipientName}
                    onChange={(event) => setHandoffRecipientName(event.target.value)}
                    placeholder="Name on badge"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="handoff-organization" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                      Airline / company
                    </label>
                    <input
                      id="handoff-organization"
                      value={handoffOrganization}
                      onChange={(event) => setHandoffOrganization(event.target.value)}
                      placeholder="United Airlines"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="handoff-reference" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                      Badge / reference
                    </label>
                    <input
                      id="handoff-reference"
                      value={handoffReference}
                      onChange={(event) => setHandoffReference(event.target.value)}
                      placeholder="Badge, desk, or bag acceptance ref"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="handoff-role" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                    Role / counter <span className="font-normal normal-case text-navy/60">(optional)</span>
                  </label>
                  <input
                    id="handoff-role"
                    value={handoffRecipientRole}
                    onChange={(event) => setHandoffRecipientRole(event.target.value)}
                    placeholder="Baggage services supervisor"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all"
                  />
                </div>
              </div>
            )}
            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}

            {!pendingPhoto ? (
              native ? (
                <button
                  type="button"
                  onClick={captureNative}
                  className="block w-full text-center py-12 rounded-xl border-2 border-dashed border-navy/20 hover:border-[#ff6868] hover:bg-[#ff6868]/5 transition-all cursor-pointer"
                >
                  <span className="text-3xl block mb-2">📷</span>
                  <span className="text-sm font-semibold text-navy">Open camera</span>
                  <span className="block text-xs text-navy/70 mt-1">
                    Native camera with auto-orientation
                  </span>
                </button>
              ) : (
                <label className="block">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={onFile}
                    className="hidden"
                  />
                  <span className="block w-full text-center py-12 rounded-xl border-2 border-dashed border-navy/20 hover:border-[#ff6868] hover:bg-[#ff6868]/5 transition-all cursor-pointer">
                    <span className="text-3xl block mb-2">📷</span>
                    <span className="text-sm font-semibold text-navy">Tap to capture</span>
                    <span className="block text-xs text-navy/70 mt-1">
                      Camera on mobile · File picker on desktop
                    </span>
                  </span>
                </label>
              )
            ) : (
              <div>
                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-gray-100 mb-4 bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingPhoto} alt="Capture" className="absolute inset-0 w-full h-full object-cover" />
                </div>
                <textarea
                  rows={2}
                  placeholder="Optional note: bag descriptions, condition, customer present…"
                  value={photoNote}
                  onChange={(e) => setPhotoNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all resize-none mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={clearPhoto}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-navy font-semibold text-sm hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Retake
                  </button>
                  <button
                    onClick={
                      needsPickupPhoto
                        ? markPickedUp
                        : needsAirportRelease
                          ? markAirportRelease
                        : needsAirlineHandoff
                          ? markAirlineHandoff
                          : markDelivered
                    }
                    disabled={locationStatus === "working"}
                    className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-[#ff6868] to-[#ff6868] text-white font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    {locationStatus === "working"
                      ? "Capturing location..."
                      : needsPickupPhoto
                        ? "Confirm seal + pickup"
                        : needsAirportRelease
                          ? "Confirm airport release"
                        : needsAirlineHandoff
                          ? "Confirm airline handoff"
                          : "Confirm delivery"}
                  </button>
                </div>
                {locationStatus === "captured" && (
                  <p className="mt-3 text-xs text-green-700">
                    Location captured with proof.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {(booking.locationEvents?.length ?? 0) > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-lg shadow-navy/5 p-6">
            <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-4">
              Location trail
            </h2>
            <div className="space-y-2">
              {[...(booking.locationEvents ?? [])].reverse().slice(0, 6).map((event) => (
                <a
                  key={event.id}
                  href={`https://maps.google.com/?q=${event.latitude},${event.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-navy/10 bg-navy/[0.03] px-4 py-3 text-xs text-navy/70"
                >
                  <div className="font-bold text-navy">{event.label}</div>
                  <div>
                    {new Date(event.capturedAt).toLocaleString()}
                    {event.actorName ? ` · ${event.actorName}` : ""}
                  </div>
                  <div>
                    GPS {event.latitude}, {event.longitude}
                    {event.accuracyMeters
                      ? ` · within about ${event.accuracyMeters} meters`
                      : ""}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Existing proofs */}
        {booking.proofs.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-lg shadow-navy/5 p-6">
            <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-4">
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
                    <div className="font-semibold text-navy capitalize">
                      {proofTitle(p.kind)}
                    </div>
                    {p.sealId && (
                      <div className="text-navy/70">Seal {p.sealId}</div>
                    )}
                    {p.approvedAt && (
                      <div className="text-green-700">Customer approved</div>
                    )}
                    {p.handoff && (
                      <div className="text-navy/70">
                        {p.handoff.organization} · {p.handoff.recipientName}
                        {p.handoff.badgeOrReference
                          ? ` · ${p.handoff.badgeOrReference}`
                          : ""}
                      </div>
                    )}
                    {p.location && (
                      <div className="text-navy/70">
                        GPS {p.location.latitude}, {p.location.longitude}
                      </div>
                    )}
                    <div className="text-navy/70">{new Date(p.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DriverJobChrome>
  );
}

function proofTitle(kind: Booking["proofs"][number]["kind"]) {
  if (kind === "seal") return "Seal proof";
  if (kind === "pickup") return "Pickup";
  if (kind === "airline_handoff") return "Airline handoff";
  return "Delivery";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy/70 font-medium shrink-0">{label}</span>
      <span className="text-navy font-semibold text-right break-words">{value}</span>
    </div>
  );
}
