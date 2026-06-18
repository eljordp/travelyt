"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Circle,
  Clock3,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import DriverChrome from "@/components/DriverChrome";
import LocationProofCard from "@/components/LocationProofCard";
import {
  addProof,
  type Booking,
  formatPrice,
  getBooking,
  getBookingStatusLabel,
  getDriverAccessCode,
  getLastApiFailureMessage,
  getStoredDriverName,
  recordClientOpsException,
  SERVICE_LABELS,
  subscribe,
  updateBooking,
} from "@/lib/bookings";
import type { CustodyEventType } from "@/lib/custody";
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
    <DriverChrome
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
    </DriverChrome>
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
    setError("Allow location access before continuing. Travelyt needs a GPS checkpoint for this step.");
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

  // Append a custody event to every bag's tamper-evident ledger. Non-blocking:
  // ledger logging must never break the booking proof flow.
  async function logCustody(
    eventType: CustodyEventType,
    location?: ProofLocation
  ) {
    if (!booking) return;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const code = getDriverAccessCode();
      if (code) headers["x-travelyt-driver-code"] = code;
      const name = getStoredDriverName();
      if (name) headers["x-travelyt-driver-name"] = name;
      await fetch("/api/custody", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: JSON.stringify({
          action: "scan_booking",
          bookingId: booking.id,
          eventType,
          actorRole: "driver",
          lat: location?.latitude ?? null,
          lng: location?.longitude ?? null,
        }),
      });
    } catch {
      // Intentionally swallowed — see note above.
    }
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
    void logCustody("picked_up", location);
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
    void logCustody("security_handoff", location);
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
    void logCustody("picked_up", location);
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
    void logCustody("delivered", location);
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
  const proofActionTitle = needsPickupPhoto
    ? "Seal proof"
    : needsAirportRelease
      ? "Airport release proof"
      : needsAirlineHandoff
        ? "Airline handoff proof"
        : "Delivery proof";
  const proofActionBody = needsPickupPhoto
    ? "Attach the seal, enter the printed seal code, then capture a clear bag photo with GPS."
    : needsAirportRelease
      ? "Capture the bags at the airport release point and record who released them to Travelyt."
      : needsAirlineHandoff
        ? "Capture the sealed bags at the airline handoff point and record who accepted them."
        : "Capture the final delivery photo with the seals intact.";
  const currentStep = (() => {
    if (isPending) {
      return {
        key: "wait",
        eyebrow: "Waiting",
        title: "Travelyt must confirm this booking",
        body: "Customer details stay hidden until payment or manual approval is complete.",
        tone: "neutral" as const,
      };
    }
    if (!isMine && !terminalStatus) {
      return {
        key: "other_driver",
        eyebrow: "Assigned elsewhere",
        title: `Assigned to ${booking.driverName ?? "another courier"}`,
        body: "This job is visible for context, but it is not assigned to your driver profile.",
        tone: "neutral" as const,
      };
    }
    if (terminalStatus) {
      return {
        key: "done",
        eyebrow: "Closed",
        title: getBookingStatusLabel(booking),
        body: "This job is no longer active for courier action. Contact Travelyt ops before moving bags.",
        tone: booking.status === "issue" || booking.status === "cancelled" ? ("blocked" as const) : ("done" as const),
      };
    }
    if (custodyBlocked) {
      return {
        key: "custody",
        eyebrow: "Ops review needed",
        title: "Manual ID/bag review is not complete",
        body: "Ask admin to clear custody readiness before pickup or airport release.",
        tone: "blocked" as const,
      };
    }
    if (booking.status === "assigned") {
      return {
        key: "accept",
        eyebrow: "Current step",
        title: "Accept the assigned job",
        body: "Lock this job to your courier profile before heading out.",
        tone: "active" as const,
      };
    }
    if (booking.status === "accepted") {
      return {
        key: "route",
        eyebrow: "Current step",
        title: "Start route",
        body: "Capture GPS when you begin moving toward the custody location.",
        tone: "active" as const,
      };
    }
    if (booking.status === "en_route") {
      return {
        key: "arrive",
        eyebrow: "Current step",
        title: "Mark arrived",
        body: "Capture arrival GPS at the pickup, airport, or delivery location.",
        tone: "active" as const,
      };
    }
    if (showCamera) {
      return {
        key: needsAirlineHandoff
          ? "handoff"
          : needsDeliveryPhoto
            ? "delivery"
            : "custody",
        eyebrow: "Current step",
        title: proofActionTitle,
        body: proofActionBody,
        tone: "active" as const,
      };
    }
    if (sealApprovalRequired) {
      return {
        key: "seal_approval",
        eyebrow: "Waiting",
        title: "Customer seal approval",
        body: "The seal photo is on file. Customer approval is required before airline handoff.",
        tone: "waiting" as const,
      };
    }
    if (booking.status === "delivery_pending") {
      return {
        key: "customer_confirm",
        eyebrow: "Waiting",
        title: "Customer confirmation",
        body: "Delivery proof is on file. The customer must confirm receipt from their tracking page.",
        tone: "waiting" as const,
      };
    }
    return {
      key: "wait",
      eyebrow: "Waiting",
      title: "No driver action right now",
      body: "Keep this job visible and wait for Travelyt ops to release the next step.",
      tone: "neutral" as const,
    };
  })();
  const workflowSteps = getWorkflowSteps({
    booking,
    currentKey: currentStep.key,
    currentTone: currentStep.tone,
    isDepartureService,
    isArrivalService,
    latestSealProof,
  });

  return (
    <DriverJobChrome>
      <div className="mx-auto max-w-2xl space-y-5">
        <section className={currentStepClassName(currentStep.tone)}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff6868]">
                {currentStep.eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-bold leading-tight text-navy">
                {currentStep.title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-navy/70">
                {currentStep.body}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-navy/5 px-3 py-1 text-xs font-bold text-navy/65">
              {getBookingStatusLabel(booking)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 rounded-xl bg-white/70 p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-bold text-navy">{customerName}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-navy/55">
                {booking.id} · {SERVICE_LABELS[booking.service]} · {booking.bags} bag
                {booking.bags > 1 ? "s" : ""}
              </p>
            </div>
            {customerPhone ? (
              <a
                href={`tel:${customerPhone}`}
                className="inline-flex items-center justify-center rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                Call customer
              </a>
            ) : (
              <span className="rounded-xl bg-navy/5 px-4 py-2.5 text-center text-xs font-bold text-navy/55">
                Contact hidden
              </span>
            )}
          </div>

          {error && !showCamera && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          )}

          {isPending && (
            <StatusNotice>
              Payment or manual confirmation is still pending. This booking
              cannot be accepted until Travelyt confirms it.
            </StatusNotice>
          )}

          {booking.status === "assigned" && isMine && (
            <PrimaryActionButton onClick={acceptJob} icon={CheckCircle2}>
              Accept job
            </PrimaryActionButton>
          )}

          {booking.status === "accepted" && isMine && (
            <PrimaryActionButton
              onClick={markEnRoute}
              disabled={locationStatus === "working"}
              icon={MapPin}
            >
              {locationStatus === "working" ? "Capturing route GPS..." : "Start route"}
            </PrimaryActionButton>
          )}

          {booking.status === "en_route" && isMine && (
            <PrimaryActionButton
              onClick={markArrived}
              disabled={locationStatus === "working"}
              icon={MapPin}
            >
              {locationStatus === "working" ? "Capturing arrival GPS..." : "Mark arrived"}
            </PrimaryActionButton>
          )}

          {!isMine && !terminalStatus && (
            <StatusNotice>
              Assigned to {booking.driverName ?? "another courier"}.
            </StatusNotice>
          )}

          {terminalStatus && (
            <StatusNotice tone={currentStep.tone === "blocked" ? "danger" : "done"}>
              {currentStep.body}
            </StatusNotice>
          )}

          {booking.status === "delivery_pending" && isMine && (
            <StatusNotice tone="waiting">
              Delivery proof is on file. The customer must confirm receipt from
              their Travelyt tracking page before this job closes.
            </StatusNotice>
          )}

          {custodyBlocked && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm leading-relaxed text-red-800">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
                Ops review needed
              </div>
              <ul className="mt-3 space-y-1 text-xs">
                {blockers.map((blocker) => (
                  <li key={blocker}>- {blocker}</li>
                ))}
              </ul>
            </div>
          )}

          {sealApprovalRequired && (
            <StatusNotice tone="waiting">
              The customer must approve the seal proof before airline handoff.
            </StatusNotice>
          )}
        </section>

        {showCamera && (
          <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 md:p-6">
            <h2 className="flex items-center gap-2 font-bold text-navy">
              <Camera className="h-5 w-5 text-[#ff6868]" strokeWidth={2.2} />
              {proofActionTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-navy/70">
              {proofActionBody}
            </p>
            <div className="my-5 flex gap-3 rounded-xl border border-navy/10 bg-navy/[0.03] p-4 text-xs leading-relaxed text-navy/70">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy/45" strokeWidth={2.2} />
              <span>
                GPS is captured when you confirm. Travelyt stores location,
                timestamp, and accuracy with this proof.
              </span>
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
                  className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-navy/20 py-12 text-center transition-all hover:border-[#ff6868] hover:bg-[#ff6868]/5"
                >
                  <Camera className="mb-3 h-8 w-8 text-[#ff6868]" strokeWidth={1.8} />
                  <span className="text-sm font-bold text-navy">Open camera</span>
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
                  <span className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-navy/20 py-12 text-center transition-all hover:border-[#ff6868] hover:bg-[#ff6868]/5">
                    <Camera className="mb-3 h-8 w-8 text-[#ff6868]" strokeWidth={1.8} />
                    <span className="text-sm font-bold text-navy">Tap to capture</span>
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
                    className="flex-[2] rounded-xl bg-[#ff6868] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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

        <WorkflowProgress steps={workflowSteps} />

        <section className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 md:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-navy/45">
                Job details
              </p>
              <h2 className="mt-1 text-xl font-bold text-navy">{customerName}</h2>
              {customerPhone ? (
                <a
                  href={`tel:${customerPhone}`}
                  className="text-sm font-bold text-[#ff6868] hover:underline"
                >
                  {customerPhone}
                </a>
              ) : (
                <p className="text-sm font-semibold text-navy/55">
                  Contact hidden until confirmed
                </p>
              )}
            </div>
            <span className="rounded-full bg-[#ff6868]/10 px-2.5 py-1 text-xs font-bold text-[#ff6868]">
              {booking.id}
            </span>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-5 text-sm">
            <Row label="Service" value={SERVICE_LABELS[booking.service]} />
            <Row
              label={booking.service === "arrival" ? "Delivery" : "Pickup"}
              value={jobAddress}
            />
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

          <div className="mt-5 flex justify-between border-t border-gray-100 pt-5 text-sm">
            <span className="text-navy/70">Your payout</span>
            <span className="font-bold text-navy">
              {isPending
                ? "Pending confirmation"
                : formatPrice(Math.round(booking.priceCents * 0.65))}
            </span>
          </div>
        </section>

        {(booking.locationEvents?.length ?? 0) > 0 && (
          <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 md:p-6">
            <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-4">
              Location trail
            </h2>
            <div className="space-y-3">
              {[...(booking.locationEvents ?? [])].reverse().slice(0, 6).map((event) => (
                <LocationProofCard
                  key={event.id}
                  label={event.label}
                  latitude={event.latitude}
                  longitude={event.longitude}
                  accuracyMeters={event.accuracyMeters}
                  capturedAt={event.capturedAt}
                  actorName={event.actorName}
                />
              ))}
            </div>
          </div>
        )}

        {/* Existing proofs */}
        {booking.proofs.length > 0 && (
          <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 md:p-6">
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

type StepTone = "active" | "blocked" | "done" | "neutral" | "waiting";
type WorkflowStepState = "blocked" | "current" | "done" | "pending";
type WorkflowStep = {
  id: string;
  label: string;
  state: WorkflowStepState;
};

function currentStepClassName(tone: StepTone) {
  if (tone === "blocked") {
    return "rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm shadow-red-100/60 md:p-6";
  }
  if (tone === "waiting") {
    return "rounded-2xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm shadow-yellow-100/60 md:p-6";
  }
  if (tone === "done") {
    return "rounded-2xl border border-green-100 bg-green-50 p-5 shadow-sm shadow-green-100/60 md:p-6";
  }
  return "rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 md:p-6";
}

function getWorkflowSteps({
  booking,
  currentKey,
  currentTone,
  isDepartureService,
  isArrivalService,
  latestSealProof,
}: {
  booking: Booking;
  currentKey: string;
  currentTone: StepTone;
  isDepartureService: boolean;
  isArrivalService: boolean;
  latestSealProof?: Booking["proofs"][number];
}): WorkflowStep[] {
  const steps: Array<Omit<WorkflowStep, "state">> = [
    { id: "accept", label: "Accept" },
    { id: "route", label: "Route" },
    { id: "arrive", label: "Arrive" },
    {
      id: "custody",
      label: booking.service === "arrival" ? "Airport release" : "Seal pickup",
    },
  ];

  if (isDepartureService) {
    steps.push(
      { id: "seal_approval", label: "Seal approval" },
      { id: "handoff", label: "Airline handoff" }
    );
  }
  if (isArrivalService) {
    steps.push(
      { id: "delivery", label: "Delivery proof" },
      { id: "customer_confirm", label: "Customer confirms" }
    );
  }

  return steps.map((step) => {
    if (step.id === currentKey) {
      const state: WorkflowStepState =
        currentTone === "blocked" ? "blocked" : "current";
      return {
        ...step,
        state,
      };
    }
    const state: WorkflowStepState = workflowStepDone(
      step.id,
      booking,
      latestSealProof
    )
      ? "done"
      : "pending";
    return {
      ...step,
      state,
    };
  });
}

function workflowStepDone(
  stepId: string,
  booking: Booking,
  latestSealProof?: Booking["proofs"][number]
) {
  const status = booking.status;
  const acceptedOrLater = [
    "accepted",
    "en_route",
    "arrived",
    "picked_up",
    "in_transit",
    "delivery_pending",
    "delivered",
    "closed",
  ].includes(status);
  const routedOrLater = [
    "en_route",
    "arrived",
    "picked_up",
    "in_transit",
    "delivery_pending",
    "delivered",
    "closed",
  ].includes(status);
  const arrivedOrLater = [
    "arrived",
    "picked_up",
    "in_transit",
    "delivery_pending",
    "delivered",
    "closed",
  ].includes(status);
  const custodyOrLater = [
    "picked_up",
    "in_transit",
    "delivery_pending",
    "delivered",
    "closed",
  ].includes(status);

  if (stepId === "accept") return acceptedOrLater;
  if (stepId === "route") return routedOrLater;
  if (stepId === "arrive") return arrivedOrLater;
  if (stepId === "custody") return custodyOrLater;
  if (stepId === "seal_approval") {
    return (
      Boolean(latestSealProof?.approvedAt) ||
      ["in_transit", "delivery_pending", "delivered", "closed"].includes(status)
    );
  }
  if (stepId === "handoff") {
    return ["in_transit", "delivery_pending", "delivered", "closed"].includes(status);
  }
  if (stepId === "delivery") {
    return ["delivery_pending", "closed"].includes(status);
  }
  if (stepId === "customer_confirm") return status === "closed";
  return false;
}

function WorkflowProgress({ steps }: { steps: WorkflowStep[] }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-navy/55" strokeWidth={2.1} />
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-navy/60">
          Workflow
        </h2>
      </div>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-3">
            <StepIcon state={step.state} />
            <span
              className={`min-w-0 flex-1 text-sm font-semibold ${
                step.state === "pending" ? "text-navy/45" : "text-navy"
              }`}
            >
              {step.label}
            </span>
            {step.state === "current" && (
              <span className="rounded-full bg-[#ff6868]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#ff6868]">
                Now
              </span>
            )}
            {step.state === "blocked" && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-red-700">
                Hold
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ state }: { state: WorkflowStepState }) {
  if (state === "done") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
        <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="h-4 w-4" strokeWidth={2.4} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ff6868]/10 text-[#ff6868]">
        <Clock3 className="h-4 w-4" strokeWidth={2.4} />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/5 text-navy/35">
      <Circle className="h-4 w-4" strokeWidth={2.1} />
    </span>
  );
}

function PrimaryActionButton({
  children,
  disabled,
  icon: Icon,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-5 py-4 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      <Icon className="h-5 w-5" strokeWidth={2.2} />
      {children}
    </button>
  );
}

function StatusNotice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "danger" | "done" | "neutral" | "waiting";
}) {
  const className =
    tone === "danger"
      ? "border-red-100 bg-red-50 text-red-800"
      : tone === "done"
        ? "border-green-100 bg-green-50 text-green-800"
        : tone === "waiting"
          ? "border-yellow-200 bg-yellow-50 text-yellow-900"
          : "border-navy/10 bg-navy/[0.03] text-navy/70";
  return (
    <div className={`mt-4 rounded-xl border p-4 text-sm leading-relaxed ${className}`}>
      {children}
    </div>
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
