import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { randomBytes, randomInt } from "node:crypto";
import {
  BOOKING_LIST_SELECT_COLUMNS,
  BOOKING_SELECT_COLUMNS,
  bookingPatchToRowPatch,
  bookingToInsert,
  rowToBooking,
  type BookingRow,
} from "@/lib/booking-mappers";
import { queueBookingNotification } from "@/lib/push-notifications-server";
import { rateLimit } from "@/lib/rate-limit";
import { durableRateLimit } from "@/lib/durable-rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import {
  accountHolderNameMatchesVerifiedIdentity,
  STRIPE_IDENTITY_PROVIDER,
} from "@/lib/stripe-identity";
import { calcPriceBreakdown } from "@/lib/pricing";
import {
  getVerifiedAdminSession,
  type VerifiedAdminSession,
} from "@/lib/admin-auth";
import {
  authorizeDriverRequest,
  type DriverAuthorization,
} from "@/lib/driver-access-server";
import {
  validateFlightCutoff,
  validateTravelDateTime,
} from "@/lib/booking-time";
import {
  getPromoDiscountCents,
  normalizePromoCode,
} from "@/lib/promos";
import { SITE_URL } from "@/lib/site";
import type { Booking, ServiceType } from "@/lib/bookings";
import { carrierHandoffAuthorized } from "@/lib/handoff-policy";
import { recordCustodyCheckpoint } from "@/lib/custody";
import { resolveServerRouteDistance } from "@/lib/server-route-distance";
import { buildServerPricingQuote } from "@/lib/server-pricing-quote";
import {
  normalizeBookingPassengers,
  passengerManifestCustodyBlockers,
} from "@/lib/passengers";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s().-]{6,}$/;
const bookingStatuses: Booking["status"][] = [
  "pending",
  "paid",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
  "delivered",
  "closed",
  "cancelled",
  "issue",
];
const driverStatuses: Booking["status"][] = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
  "delivered",
];
const adminOnlyStatuses: Booking["status"][] = [
  "pending",
  "paid",
  "cancelled",
  "issue",
];
const atomicCustodyStatuses = new Set<Booking["status"]>([
  "picked_up",
  "in_transit",
  "delivery_pending",
  "delivered",
]);
const genericPatchFields = new Set<keyof Booking>([
  "status",
  "customerSignatureName",
  "issueType",
  "issueNotes",
  "issueResolution",
  "archivedAt",
]);
const ISSUE_TYPE_LABELS = {
  airport_hold: "Airport hold",
  customer_no_show: "Customer no-show",
  missing_id: "Missing ID",
  wrong_bag: "Wrong bag",
  driver_delay: "Driver delay",
  vehicle_issue: "Vehicle issue",
  seal_compromised: "Seal compromised",
  prohibited_item: "Prohibited item",
  compliance_hold: "Compliance hold",
  capacity_hold: "Capacity hold",
  lost_or_damaged_bag: "Lost or damaged bag",
  customer_unreachable: "Customer unreachable",
  airline_delay: "Airline delay",
  other: "Other",
} as const;
type ProofLocation = NonNullable<Booking["proofs"][number]["location"]>;
type LocationEventInput = {
  kind: NonNullable<Booking["locationEvents"]>[number]["kind"];
  location: ProofLocation;
  note?: string;
};
const standaloneLocationEventKinds: LocationEventInput["kind"][] = [
  "driver_en_route",
  "driver_arrived",
];

const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const proofBucket = "booking-proofs";
const maxProofBytes = 10 * 1024 * 1024;

const serviceLabels: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function reservedAgentAssignmentStatus(status?: Booking["status"]) {
  if (status === "assigned") {
    return "Use the verified primary-and-backup assignment workflow to assign this booking.";
  }
  if (status === "accepted") {
    return "The assigned primary agent must complete the acceptance checklist.";
  }
  return undefined;
}

function newAccessToken() {
  return randomBytes(32).toString("base64url");
}

function newBookingId() {
  return `TVT-${randomBytes(10).toString("base64url").toUpperCase()}`;
}

function newDeliveryConfirmationCode() {
  return String(randomInt(100000, 1000000));
}

function legacyAdminCodeAuthorized(request: Request) {
  // The header is retained only for local rehearsal compatibility. Production
  // operations must use a current AAL2 Supabase session or the audited,
  // short-lived break-glass login path.
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.TRAVELYT_ALLOW_ADMIN_CODE_HEADER !== "true") return false;
  const expected = process.env.TRAVELYT_ADMIN_ACCESS_CODE;
  return Boolean(expected && request.headers.get("x-travelyt-admin-code") === expected);
}

function tokenMatches(row: BookingRow, token?: string | null) {
  return Boolean(token && row.customer_access_token && token === row.customer_access_token);
}

function userOwns(row: BookingRow, userId?: string | null) {
  return Boolean(userId && row.customer_user_id && row.customer_user_id === userId);
}

function canReadBooking(
  row: BookingRow,
  userId?: string | null,
  token?: string | null,
  driverAuthorized = false,
  operationsAuthorized = false,
) {
  return (
    operationsAuthorized ||
    driverAuthorized ||
    userOwns(row, userId) ||
    tokenMatches(row, token)
  );
}

function isPastTravelDate(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsed = Date.parse(`${value}T00:00:00`);
  return !Number.isNaN(parsed) && parsed < today.getTime();
}

type DriverBookingAssignment = {
  booking_id: string;
  status: "assigned" | "accepted";
  primary_driver_access_id: string;
  accepted_by_driver_access_id: string | null;
};

function validDriverAssignment(
  assignment: DriverBookingAssignment | null | undefined,
  driverAccessId: string,
  requireAccepted = false,
) {
  if (!assignment || assignment.primary_driver_access_id !== driverAccessId) return false;
  if (requireAccepted) {
    return assignment.status === "accepted" &&
      assignment.accepted_by_driver_access_id === driverAccessId;
  }
  return assignment.status === "assigned" || (
    assignment.status === "accepted" &&
    assignment.accepted_by_driver_access_id === driverAccessId
  );
}

function driverCanSeeInList(row: BookingRow, assignedBookingIds: Set<string>) {
  if (!assignedBookingIds.has(row.id)) return false;
  if (row.archived_at) return false;
  if (row.status === "pending") return false;
  if (row.status === "cancelled" || row.status === "issue") return false;
  if (row.status === "paid" && isPastTravelDate(row.travel_date)) return false;
  return true;
}

function redactForDriver(row: BookingRow) {
  const booking = rowToBooking(row);
  // Drivers receive only the operational job record; passenger manifests and
  // airline references stay in the customer/operations boundary.
  delete booking.passengers;
  delete booking.externalReference;
  delete booking.customerAccessToken;
  delete booking.deliveryConfirmationCode;
  delete booking.customerUserId;
  if (row.status !== "pending") return booking;
  return {
    ...booking,
    name: "Customer hidden",
    email: "",
    phone: "",
    address: "Hidden until Travelyt confirms this booking.",
    notes: undefined,
    priceCents: 0,
    customerAccessToken: undefined,
    customerUserId: undefined,
    proofs: [],
  };
}

function proofWithResponseDataUrl(
  proof: Booking["proofs"][number],
  dataUrl: string
): Booking["proofs"][number] {
  return {
    ...proof,
    dataUrl,
  };
}

async function signedProofUrls(booking: Booking) {
  const supabase = getSupabaseAdmin();

  const proofs = await Promise.all(
    booking.proofs.map(async (proof) => {
      if (!proof.storagePath || !supabase) {
        return proof.dataUrl?.startsWith("data:")
          ? proofWithResponseDataUrl(proof, "")
          : proof;
      }

      // 24h expiry: proof files are immutable, and a stable URL lets the
      // browser/CDN cache actually work across a day of ops instead of
      // re-downloading every photo on each refresh (egress hygiene).
      const { data, error } = await supabase.storage
        .from(proofBucket)
        .createSignedUrl(proof.storagePath, 60 * 60 * 24);

      if (error || !data?.signedUrl) {
        console.error("Supabase proof signed URL failed", error);
        return proofWithResponseDataUrl(proof, "");
      }

      return proofWithResponseDataUrl(proof, data.signedUrl);
    })
  );

  return { ...booking, proofs };
}

async function responseBooking(
  row: BookingRow,
  includeAccessToken: boolean,
  redactedForDriver = false
) {
  const booking = redactedForDriver ? redactForDriver(row) : rowToBooking(row);
  if (!includeAccessToken) {
    delete booking.customerAccessToken;
    delete booking.deliveryConfirmationCode;
  }
  return signedProofUrls(booking);
}

function parseProofDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;

  const contentType = match[1].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return null;
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxProofBytes) return null;

  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";

  return { buffer, contentType, extension };
}

async function storeProofImage(
  bookingId: string,
  proof: Booking["proofs"][number]
) {
  if (!proof.dataUrl.startsWith("data:")) {
    throw new Error("Proof image must be a newly captured image upload.");
  }

  const parsed = parseProofDataUrl(proof.dataUrl);
  if (!parsed) {
    throw new Error("Proof image is invalid or exceeds the 10 MB limit.");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Proof storage is not configured.");

  const fileName = `${Date.now()}-${proof.kind}-${crypto.randomUUID()}.${parsed.extension}`;
  const storagePath = `${bookingId}/${fileName}`;
  const { error } = await supabase.storage
    .from(proofBucket)
    .upload(storagePath, parsed.buffer, {
      contentType: parsed.contentType,
      // Proof files have content-unique names and never change — let the
      // storage CDN cache them for a year instead of re-fetching hourly.
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    console.error("Supabase proof upload failed", error);
    throw new Error("Proof image could not be stored. Nothing was recorded.");
  }

  const { data: signed, error: signedUrlError } = await supabase.storage
    .from(proofBucket)
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (signedUrlError || !signed?.signedUrl) {
    console.error("Supabase proof signed URL creation failed", signedUrlError);
    throw new Error(
      "Proof image could not be secured. Nothing was recorded.",
    );
  }

  return {
    ...proof,
    dataUrl: signed.signedUrl,
    storagePath,
    contentType: parsed.contentType,
  };
}

async function recordOpsException(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  bookingId: string,
  code: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning",
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from("ops_exceptions").insert({
      booking_id: bookingId,
      code,
      message,
      severity,
      metadata,
    });
  } catch (error) {
    console.error("Could not record ops exception", error);
  }
}

function latestProof(row: BookingRow, kind: Booking["proofs"][number]["kind"]) {
  return [...(row.proofs ?? [])].reverse().find((proof) => proof.kind === kind);
}

function hasApprovedSeal(row: BookingRow) {
  const required = Math.max(1, Number(row.bags ?? 1));
  const sealProofs = (row.proofs ?? []).filter((proof) => proof.kind === "seal");
  if (sealProofs.length < required) return false;
  return sealProofs.slice(-required).every((proof) => Boolean(proof.approvedAt));
}

function latestRequiredSealProofs(row: BookingRow) {
  const required = Math.max(1, Number(row.bags ?? 1));
  const sealProofs = (row.proofs ?? []).filter((proof) => proof.kind === "seal");
  return sealProofs.length < required ? [] : sealProofs.slice(-required);
}

function hasAllRequiredSealProofs(row: BookingRow) {
  const required = Math.max(1, Number(row.bags ?? 1));
  const latest = latestRequiredSealProofs(row);
  if (latest.length !== required) return false;
  const valid = latest.every(
    (proof) =>
      proof.kind === "seal" &&
      Boolean(proof.dataUrl) &&
      Boolean(proof.location) &&
      Boolean(proof.sealId?.trim()) &&
      proof.sealStatus === "intact" &&
      ["zipper", "latch_label", "handle"].includes(proof.sealMethod ?? "")
  );
  const bagIndexes = latest.map((proof) => Number(proof.bagIndex));
  const sealIds = latest.map((proof) => proof.sealId?.trim().toUpperCase());
  return (
    valid &&
    bagIndexes.every((index) => Number.isInteger(index) && index >= 1 && index <= required) &&
    new Set(bagIndexes).size === required &&
    new Set(sealIds).size === required
  );
}

function hasAllArrivalReleaseProofs(row: BookingRow) {
  if (!hasAllRequiredSealProofs(row)) return false;
  return latestRequiredSealProofs(row).every(
    (proof) =>
      Boolean(proof.handoff?.recipientName?.trim()) &&
      Boolean(proof.handoff?.organization?.trim()) &&
      Boolean(proof.handoff?.badgeOrReference?.trim())
  );
}

function hasRequiredProof(row: BookingRow, kind: Booking["proofs"][number]["kind"]) {
  const proof = latestProof(row, kind);
  if (!proof?.dataUrl || !proof.location) return false;
  if (kind === "seal") return Boolean(proof.sealId);
  if (kind === "airline_handoff" || kind === "customer_handoff" || kind === "pickup") {
    return Boolean(
      proof.handoff?.recipientName &&
        proof.handoff.organization &&
        proof.handoff.badgeOrReference
    );
  }
  return true;
}

function custodyIdentityReady(row: BookingRow) {
  return Boolean(
    row.customer_identity_verified_at &&
      row.driver_identity_verified_at &&
      row.restricted_items_attested_at &&
      passengerManifestCustodyBlockers(
        row.passenger_manifest,
        Boolean(row.customer_identity_verified_at)
      ).length === 0
  );
}

function auditActor(
  adminSession: VerifiedAdminSession | null,
  adminOverrideAuthorized: boolean,
  request: Request,
  user: Awaited<ReturnType<typeof getRequestUser>>,
  driverAuth: DriverAuthorization
): Pick<
  NonNullable<Booking["statusHistory"]>[number],
  "actorRole" | "actorName"
> {
  if (adminSession?.email) {
    return { actorRole: adminSession.role, actorName: adminSession.email };
  }
  if (adminOverrideAuthorized) {
    return { actorRole: "admin", actorName: "Admin override" };
  }
  if (driverAuth.ok) {
    return {
      actorRole: "driver",
      actorName: driverAuth.driverName || request.headers.get("x-travelyt-driver-name") || "Driver",
    };
  }
  if (user?.email) {
    return { actorRole: "customer", actorName: user.email };
  }
  return { actorRole: "system", actorName: "System" };
}

function auditEntry(
  input: Pick<NonNullable<Booking["statusHistory"]>[number], "action" | "fromStatus" | "toStatus" | "actorRole" | "actorName" | "reason">
): NonNullable<Booking["statusHistory"]>[number] {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  };
}

function validateGpsLocation(location?: ProofLocation) {
  if (!location) return "GPS location is required for custody updates.";
  if (
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    return "GPS latitude is invalid.";
  }
  if (
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    return "GPS longitude is invalid.";
  }
  if (
    location.accuracyMeters !== undefined &&
    (!Number.isFinite(location.accuracyMeters) ||
      location.accuracyMeters < 0 ||
      location.accuracyMeters > 50000)
  ) {
    return "GPS accuracy is invalid.";
  }
  if (!location.capturedAt || Number.isNaN(Date.parse(location.capturedAt))) {
    return "GPS timestamp is invalid.";
  }
  return undefined;
}

function validateProofShape(proof: Booking["proofs"][number]) {
  if (!proof.dataUrl) return "Photo proof is required.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(proof.custodyCheckpointKey ?? "")) {
    return "A durable custody checkpoint key is required for proof evidence.";
  }
  const locationError = validateGpsLocation(proof.location);
  if (locationError) return locationError;
  if (proof.kind === "seal" && !proof.sealId?.trim()) {
    return "Seal ID is required.";
  }
  if (proof.kind === "seal") {
    if (!Number.isInteger(proof.bagIndex) || Number(proof.bagIndex) < 1) {
      return "Bag number is required for every seal proof.";
    }
    if (!["zipper", "latch_label", "handle"].includes(proof.sealMethod ?? "")) {
      return "Seal method is required.";
    }
    if (proof.sealStatus !== "intact") {
      return "Pickup seal status must be intact. Open an exception for a damaged or replaced seal.";
    }
  }
  if (
    ["airline_handoff", "customer_handoff", "delivery"].includes(proof.kind) &&
    proof.sealStatus &&
    proof.sealStatus !== "intact"
  ) {
    return "A compromised or replaced seal must enter the exception workflow before transfer.";
  }
  if (proof.kind === "airline_handoff" || proof.kind === "customer_handoff" || proof.kind === "pickup") {
    if (
      !proof.handoff?.recipientName?.trim() ||
      !proof.handoff.organization?.trim() ||
      !proof.handoff.badgeOrReference?.trim()
    ) {
      return "Receiving party name, organization, and badge/reference are required.";
    }
  }
  return undefined;
}

function validateLocationEventInput(input?: LocationEventInput) {
  if (!input) return undefined;
  if (!standaloneLocationEventKinds.includes(input.kind)) {
    return "GPS checkpoints can only be submitted for route start or arrival. Proof GPS is recorded through proof upload.";
  }
  return validateGpsLocation(input.location);
}

const LOCATION_EVENT_LABELS: Record<
  NonNullable<Booking["locationEvents"]>[number]["kind"],
  string
> = {
  driver_en_route: "Driver started route",
  driver_arrived: "Driver arrived",
  seal_proof: "Seal proof captured",
  airport_release: "Airport release captured",
  customer_handoff: "Passenger terminal handoff captured",
  airline_handoff: "Airline handoff captured",
  delivery_proof: "Delivery proof captured",
};

function createServerLocationEvent(
  kind: NonNullable<Booking["locationEvents"]>[number]["kind"],
  location: ProofLocation,
  actorName?: string,
  note?: string
): NonNullable<Booking["locationEvents"]>[number] {
  return {
    id: crypto.randomUUID(),
    kind,
    label: LOCATION_EVENT_LABELS[kind],
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    capturedAt: location.capturedAt,
    actorName,
    note,
  };
}

function locationKindForProof(
  kind: Booking["proofs"][number]["kind"]
): NonNullable<Booking["locationEvents"]>[number]["kind"] {
  if (kind === "seal") return "seal_proof";
  if (kind === "pickup") return "airport_release";
  if (kind === "customer_handoff") return "customer_handoff";
  if (kind === "airline_handoff") return "airline_handoff";
  return "delivery_proof";
}

function validateBooking(
  body: Partial<Booking> & {
    source?: string;
    flightTime?: string;
    expressPickup?: boolean;
    coverageAccepted?: boolean;
  },
  verifiedDistanceMiles: number
) {
  const service = body.service?.trim() as ServiceType | undefined;
  const airport = body.airport?.trim();
  const address = body.address?.trim();
  const date = body.date?.trim() || "";
  const flight = body.flight?.trim() || undefined;
  const flightTime = body.flightTime?.trim() || undefined;
  const bags = typeof body.bags === "number" ? body.bags : 0;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || "";
  const customerNotes = body.notes?.trim() || undefined;
  const declaredValueCents =
    typeof body.declaredValueCents === "number" &&
    Number.isFinite(body.declaredValueCents)
      ? Math.max(0, Math.round(body.declaredValueCents))
      : undefined;
  const distanceMiles = verifiedDistanceMiles;

  if (service !== "departure" && service !== "arrival") {
    return "Book departure and arrival as separate custody legs.";
  }
  if (!airport) return "Airport is required.";
  if (!address) return "Address is required.";
  const dateError = validateTravelDateTime(date, body.flightTime);
  if (dateError) return dateError;
  if (!flight) return "Flight number is required.";
  if (!flightTime) return "Select a flight time.";
  const cutoffError = validateFlightCutoff(
    date,
    flightTime,
    service,
    distanceMiles,
    airport
  );
  if (cutoffError) return cutoffError;
  if (!bags || bags < 1) return "Need at least one bag.";
  if (!name) return "Name is required.";
  if (!email || !emailPattern.test(email)) return "Enter a valid email address.";
  if (phone && !phonePattern.test(phone)) return "Enter a valid phone number.";
  if (!body.restrictedItemsAttestedAt) {
    return "Confirm that your bags do not contain restricted or undeclared high-value items.";
  }
  if (declaredValueCents && body.coverageAccepted !== true) {
    return "Confirm the declared-value coverage notice.";
  }

  const expressPickup = service !== "arrival" && body.expressPickup === true;
  const priceBreakdown = calcPriceBreakdown(
    bags,
    service,
    expressPickup,
    distanceMiles
  );
  const promoCode = normalizePromoCode(body.promoCode);
  const discountCents = getPromoDiscountCents(
    priceBreakdown.promoEligibleCents,
    promoCode
  );
  const notes = [
    expressPickup ? "Express pickup requested." : "",
    `Server-verified driving route: ${distanceMiles.toFixed(1)} miles from ${airport}.`,
    priceBreakdown.distanceSurchargeCents > 0
      ? `Distance surcharge: ${formatPrice(priceBreakdown.distanceSurchargeCents)} for ${priceBreakdown.extraDistanceMiles} miles beyond ${priceBreakdown.includedDistanceMiles} at ${formatPrice(priceBreakdown.distanceRateCents)}/mi.`
      : "",
    customerNotes,
  ]
    .filter(Boolean)
    .join(" ");

  const booking: Booking = {
    id: newBookingId(),
    service,
    airport,
    address,
    date,
    flightTime,
    flight,
    bags,
    passengers: Array.isArray(body.passengers) ? body.passengers : undefined,
    name,
    email,
    phone,
    notes: notes || undefined,
    distanceMiles,
    declaredValueCents,
    coverageElection: declaredValueCents ? "declared_value" : "standard",
    coverageAcceptedAt: undefined,
    restrictedItemsAttestedAt: body.restrictedItemsAttestedAt,
    customerIdentityVerifiedAt: body.customerIdentityVerifiedAt,
    driverIdentityVerifiedAt: body.driverIdentityVerifiedAt,
    status: "pending",
    priceCents: Math.max(0, priceBreakdown.totalBeforePromoCents - discountCents),
    promoCode,
    discountCents: discountCents || undefined,
    createdAt: new Date().toISOString(),
    paidAt: body.paidAt,
    assignedAt: body.assignedAt,
    acceptedAt: body.acceptedAt,
    enRouteAt: body.enRouteAt,
    arrivedAt: body.arrivedAt,
    driverName: body.driverName,
    pickedUpAt: body.pickedUpAt,
    deliveryPendingAt: body.deliveryPendingAt,
    deliveredAt: body.deliveredAt,
    closedAt: body.closedAt,
    deliveryConfirmationCode: newDeliveryConfirmationCode(),
    customerConfirmedAt: body.customerConfirmedAt,
    customerSignatureName: body.customerSignatureName,
    issueType: body.issueType,
    issueNotes: body.issueNotes,
    issueOpenedAt: body.issueOpenedAt,
    issueResolvedAt: body.issueResolvedAt,
    issueResolution: body.issueResolution,
    locationEvents: Array.isArray(body.locationEvents) ? body.locationEvents : [],
    proofs: Array.isArray(body.proofs) ? body.proofs : [],
    statusHistory: Array.isArray(body.statusHistory) ? body.statusHistory : [],
  };

  return booking;
}

async function sendBookingEmail(booking: Booking, source: string) {
  if (!leadNotifyEmail) return;

  const trackingUrl = `${SITE_URL}/track/${encodeURIComponent(booking.id)}${
    booking.customerAccessToken
      ? `?token=${encodeURIComponent(booking.customerAccessToken)}`
      : ""
  }`;

  const lines = [
    "New Travelyt booking",
    "",
    `ID:       ${booking.id}`,
    `Service:  ${serviceLabels[booking.service]}`,
    `Airport:  ${booking.airport}`,
    `Address:  ${booking.address}`,
    `Date:     ${booking.date}`,
    `Time:     ${booking.flightTime || "(none)"}`,
    `Flight:   ${booking.flight || "(none)"}`,
    `Bags:     ${booking.bags}`,
    `Declared value request: ${booking.declaredValueCents ? formatPrice(booking.declaredValueCents) : "None"}`,
    `Price:    ${formatPrice(booking.priceCents)}`,
    "",
    `Name:     ${booking.name}`,
    `Email:    ${booking.email}`,
    `Phone:    ${booking.phone || "(none)"}`,
    `Notes:    ${booking.notes || "(none)"}`,
    `Track:    ${trackingUrl}`,
    "",
    `Source:   ${source}`,
    `Created:  ${booking.createdAt}`,
  ].join("\n");

  const result = await sendTransactionalEmail({
    to: leadNotifyEmail,
    subject: `New Travelyt booking: ${booking.id} (${booking.name})`,
    replyTo: booking.email,
    text: lines,
    idempotencyKey: `booking-created:${booking.id}`,
  });

  if (result.status === "failed") {
    console.error("Booking notification delivery failed", result);
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "bookings:get", 120);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const accessToken =
    searchParams.get("accessToken") ||
    searchParams.get("token") ||
    request.headers.get("x-travelyt-booking-token");
  const includeArchived = searchParams.get("includeArchived") === "1";
  const user = await getRequestUser(request);
  const driverAuth = await authorizeDriverRequest(request);
  const adminSession = await getVerifiedAdminSession(request);
  const hasLegacyAdminOverride = legacyAdminCodeAuthorized(request);
  const hasOpsAccess = Boolean(adminSession) || hasLegacyAdminOverride;
  const isDriverOnly = driverAuth.ok && !hasOpsAccess;
  if (isDriverOnly && !driverAuth.driverAccessId) {
    return bad("A current person-bound driver account is required.", 403);
  }

  if (id) {
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT_COLUMNS)
      .eq("id", id)
      .maybeSingle<BookingRow>();

    if (error) return bad("Could not load booking.", 500);
    let driverCanRead = false;
    if (data && isDriverOnly && driverAuth.driverAccessId) {
      const { data: assignment, error: assignmentError } = await supabase
        .from("booking_agent_assignments")
        .select("booking_id, status, primary_driver_access_id, accepted_by_driver_access_id")
        .eq("booking_id", data.id)
        .eq("primary_driver_access_id", driverAuth.driverAccessId)
        .in("status", ["assigned", "accepted"])
        .maybeSingle<DriverBookingAssignment>();
      if (assignmentError) return bad("Could not verify driver assignment.", 500);
      driverCanRead = validDriverAssignment(assignment, driverAuth.driverAccessId);
    }
    if (
      data &&
      !canReadBooking(
        data,
        user?.id,
        accessToken,
        isDriverOnly ? driverCanRead : driverAuth.ok,
        hasOpsAccess,
      )
    ) {
      return bad("You do not have access to this booking.", 403);
    }
    const ownsOrToken =
      data ? userOwns(data, user?.id) || tokenMatches(data, accessToken) : false;
    const includeAccessToken = data ? ownsOrToken : false;
    const redactedForDriver = data ? isDriverOnly && !ownsOrToken : false;
    return NextResponse.json({
      ok: true,
      booking: data
        ? await responseBooking(data, includeAccessToken, redactedForDriver)
        : null,
    });
  }

  let query = supabase
    .from("bookings")
    .select(BOOKING_LIST_SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(100);

  const isPrivileged = hasOpsAccess || driverAuth.ok;
  let assignedBookingIds = new Set<string>();

  if (isDriverOnly && driverAuth.driverAccessId) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("booking_agent_assignments")
      .select("booking_id, status, primary_driver_access_id, accepted_by_driver_access_id")
      .eq("primary_driver_access_id", driverAuth.driverAccessId)
      .in("status", ["assigned", "accepted"])
      .returns<DriverBookingAssignment[]>();
    if (assignmentError) return bad("Could not load assigned driver jobs.", 500);
    assignedBookingIds = new Set(
      (assignments ?? [])
        .filter((assignment) => validDriverAssignment(assignment, driverAuth.driverAccessId!))
        .map((assignment) => assignment.booking_id),
    );
    if (assignedBookingIds.size === 0) {
      return NextResponse.json({ ok: true, bookings: [] });
    }
    query = query.in("id", [...assignedBookingIds]);
  }

  if (!isPrivileged) {
    if (!user) return bad("Sign in or provide driver access.", 401);
    query = query.eq("customer_user_id", user.id);
  }

  const { data, error } = await query;

  if (error) return bad("Could not load bookings.", 500);
  const rows = ((data ?? []) as unknown as BookingRow[]).filter((row) => {
    if (isDriverOnly) return driverCanSeeInList(row, assignedBookingIds);
    if (row.archived_at && (!includeArchived || !hasOpsAccess)) {
      return false;
    }
    return true;
  });

  return NextResponse.json({
    ok: true,
    bookings: await Promise.all(rows.map((row) =>
      responseBooking(
        row,
        hasOpsAccess || userOwns(row, user?.id),
        isDriverOnly
      )
    )),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "bookings:post", 12);
  if (limited) return limited;
  const durableLimited = await durableRateLimit(request, "bookings:post", 12, 60_000);
  if (durableLimited) return durableLimited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as Partial<Booking> & {
      source?: string;
      expressPickup?: boolean;
      coverageAccepted?: boolean;
    };
    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!mapsApiKey) {
      return bad(
        "Verified route pricing is not configured. No booking or charge was created.",
        503
      );
    }
    const verifiedRoute = await resolveServerRouteDistance({
      apiKey: mapsApiKey,
      address: body.address ?? "",
      airportCode: body.airport ?? "",
      requireDrivingRoute: true,
    });
    if (!verifiedRoute.ok) return bad(verifiedRoute.error, verifiedRoute.status);
    if (verifiedRoute.distanceSource !== "driving_route") {
      return bad(
        "A verified driving route is required before booking. No booking or charge was created.",
        503
      );
    }

    // Ignore body.distanceMiles entirely. The canonical address, cutoff, and
    // price are derived from the server-side geocode and Google route result.
    const validated = validateBooking(
      {
        ...body,
        address: verifiedRoute.address,
        airport: verifiedRoute.airport,
      },
      verifiedRoute.distanceMiles
    );
    if (typeof validated === "string") return bad(validated);

    const user = await getRequestUser(request);
    validated.customerAccessToken = newAccessToken();
    validated.customerUserId = user?.id;
    validated.status = "pending";
    validated.createdAt = new Date().toISOString();
    // The request carries the customer's affirmative checkbox; the server owns
    // the attestation time so a client cannot backdate the declaration.
    validated.restrictedItemsAttestedAt = new Date().toISOString();
    validated.coverageAcceptedAt = validated.declaredValueCents
      ? new Date().toISOString()
      : undefined;
    validated.paidAt = undefined;
    validated.assignedAt = undefined;
    validated.acceptedAt = undefined;
    validated.enRouteAt = undefined;
    validated.arrivedAt = undefined;
    validated.driverName = undefined;
    validated.driverUserId = undefined;
    validated.driverIdentityVerifiedAt = undefined;
    validated.customerIdentityVerifiedAt = undefined;
    let accountHolderVerifiedAt: string | undefined;
    let accountHolderVerifiedDob: string | undefined;
    let accountHolderVerifiedFirstName: string | undefined;
    let accountHolderVerifiedLastName: string | undefined;
    if (user?.id) {
      const signedInEmail = user.email?.trim().toLowerCase();
      if (!signedInEmail || validated.email !== signedInEmail) {
        return bad("Use the verified email address on your signed-in Travelyt account for the booking owner.", 409);
      }
      const { data: identity, error: identityError } = await supabase
        .from("identity_verifications")
        .select("verified_at, email, metadata, raw_document_paths")
        .eq("user_id", user.id)
        .eq("role", "customer")
        .eq("provider", STRIPE_IDENTITY_PROVIDER)
        .eq("status", "verified")
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          verified_at: string | null;
          email: string | null;
          metadata: Record<string, unknown> | null;
          raw_document_paths: unknown;
        }>();
      if (identityError) {
        console.error("Verified customer identity lookup failed", identityError);
      } else if (identity?.verified_at) {
        const verifiedFirstName = typeof identity.metadata?.verified_first_name === "string"
          ? identity.metadata.verified_first_name.trim()
          : "";
        const verifiedLastName = typeof identity.metadata?.verified_last_name === "string"
          ? identity.metadata.verified_last_name.trim()
          : "";
        const verifiedDob = typeof identity.metadata?.verified_dob === "string"
          ? identity.metadata.verified_dob.trim()
          : "";
        const archivedPaths = Array.isArray(identity.raw_document_paths)
          ? identity.raw_document_paths
          : [];
        const hasDocument = archivedPaths.some((item) =>
          Boolean(item && typeof item === "object" && "kind" in item && item.kind === "document")
        );
        const hasSelfie = archivedPaths.some((item) =>
          Boolean(item && typeof item === "object" && "kind" in item && item.kind === "selfie")
        );
        const identityEmailMatches = identity.email?.trim().toLowerCase() === signedInEmail;
        const identityNameMatches = accountHolderNameMatchesVerifiedIdentity({
          accountHolderName: validated.name,
          verifiedFirstName,
          verifiedLastName,
        });
        const identityDobComplete = /^\d{4}-\d{2}-\d{2}$/.test(verifiedDob);
        if (!identityEmailMatches || !identityNameMatches || !identityDobComplete || !hasDocument || !hasSelfie) {
          return bad(
            "The booking owner does not match the complete verified identity record. Reopen identity verification before booking under this traveler name.",
            409
          );
        }
        accountHolderVerifiedAt = identity.verified_at;
        accountHolderVerifiedDob = verifiedDob;
        accountHolderVerifiedFirstName = verifiedFirstName;
        accountHolderVerifiedLastName = verifiedLastName;
        validated.name = `${verifiedFirstName} ${verifiedLastName}`.trim();
        validated.email = signedInEmail;
        validated.customerIdentityVerifiedAt = accountHolderVerifiedAt;
      }
    }
    const normalizedPassengers = normalizeBookingPassengers(validated.passengers, {
      accountHolderName: validated.name,
      accountHolderEmail: validated.email,
      totalBags: validated.bags,
      travelDate: validated.date,
      accountHolderVerifiedAt,
    });
    if ("error" in normalizedPassengers) return bad(normalizedPassengers.error);
    if (normalizedPassengers.passengers.length > 1 && !user?.id) {
      return bad("Sign in before adding and verifying multiple travelers under one booking.", 401);
    }
    validated.passengers = normalizedPassengers.passengers.map((passenger) =>
      passenger.category === "account_holder" && accountHolderVerifiedAt
        ? {
            ...passenger,
            firstName: accountHolderVerifiedFirstName || passenger.firstName,
            lastName: accountHolderVerifiedLastName || passenger.lastName,
            email: validated.email,
            dateOfBirth: accountHolderVerifiedDob,
          }
        : passenger
    );
    validated.pickedUpAt = undefined;
    validated.deliveryPendingAt = undefined;
    validated.deliveredAt = undefined;
    validated.closedAt = undefined;
    validated.customerConfirmedAt = undefined;
    validated.customerSignatureName = undefined;
    validated.issueType = undefined;
    validated.issueNotes = undefined;
    validated.issueOpenedAt = undefined;
    validated.issueResolvedAt = undefined;
    validated.issueResolution = undefined;
    validated.locationEvents = [];
    validated.proofs = [];
    validated.statusHistory = [];
    validated.deliveryConfirmationCode = newDeliveryConfirmationCode();

    const source = body.source?.trim() || "quote-form";
    const serverQuote = buildServerPricingQuote({
      bookingId: validated.id,
      service: validated.service,
      airport: validated.airport,
      address: validated.address,
      bags: validated.bags,
      expressPickup:
        validated.service !== "arrival" && body.expressPickup === true,
      promoCode: validated.promoCode,
      route: { ...verifiedRoute, distanceSource: "driving_route" },
    });
    validated.priceCents = serverQuote.quote.totalCents;
    validated.distanceMiles = serverQuote.quote.route.distanceMiles;
    validated.discountCents =
      serverQuote.quote.promoDiscountCents || undefined;
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        ...bookingToInsert(validated, source),
        pricing_quote: serverQuote.quote,
        pricing_fingerprint: serverQuote.fingerprint,
      })
      .select("*")
      .single<BookingRow>();

    if (error) {
      console.error("Supabase booking insert failed", error);
      return bad("Could not save booking.", 500);
    }

    await sendBookingEmail(validated, source);
    return NextResponse.json({ ok: true, booking: await responseBooking(data, true) });
  } catch {
    return bad("We could not save that booking.");
  }
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "bookings:patch", 60);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as {
      id?: string;
      patch?: Partial<Booking>;
      proof?: Booking["proofs"][number];
      locationEvent?: LocationEventInput;
      reason?: string;
      confirmationCode?: string;
      accessToken?: string;
      offlineProofDigest?: string;
    };
    const id = body.id?.trim();
    if (!id) return bad("Missing booking ID.");
    const user = await getRequestUser(request);
    const adminSession = await getVerifiedAdminSession(request);
    const hasLegacyAdminOverride = legacyAdminCodeAuthorized(request);
    const hasOpsAccess = Boolean(adminSession) || hasLegacyAdminOverride;
    const hasAdminAccess = adminSession?.role === "admin" || hasLegacyAdminOverride;

    const { data: existing, error: loadError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle<BookingRow>();

    if (loadError) return bad("Could not load booking.", 500);
    if (!existing) return bad("Booking not found.", 404);

    const patch = body.patch ?? {};
    const reason = body.reason?.trim() || undefined;
    const unsupportedPatchFields = Object.keys(patch).filter(
      (field) => !genericPatchFields.has(field as keyof Booking)
    );
    if (unsupportedPatchFields.length) {
      return bad(
        `Server-owned booking fields cannot be changed through the generic update route: ${unsupportedPatchFields.join(", ")}.`,
        403
      );
    }
    if (
      patch.pilotEligibilityStatus !== undefined ||
      patch.pilotEligibilityDecidedAt !== undefined ||
      patch.pilotEligibilityDecidedBy !== undefined ||
      patch.pilotEligibilityReason !== undefined ||
      patch.pilotEligibilityExpiresAt !== undefined ||
      patch.pilotEligibilitySnapshot !== undefined
    ) {
      return bad("Pilot eligibility decisions require the dedicated full-admin review action.", 403);
    }
    if (
      patch.arrivalReleaseStatus !== undefined ||
      patch.arrivalReleaseReference !== undefined ||
      patch.arrivalReleaseLocation !== undefined ||
      patch.arrivalReleaseAuthorizedAt !== undefined ||
      patch.arrivalReleaseAuthorizedBy !== undefined
    ) {
      return bad(
        "Airport-release authority requires the dedicated full-admin evidence action.",
        403,
      );
    }
    if (existing.service === "both") {
      const allowedLegacyKeys = new Set([
        "status",
        "issueType",
        "issueNotes",
        "issueOpenedAt",
        "archivedAt",
        "archivedBy",
      ]);
      const onlyAdministrativeClosure = Object.keys(patch).every((key) =>
        allowedLegacyKeys.has(key)
      );
      const allowedStatus =
        patch.status === undefined ||
        patch.status === "cancelled" ||
        patch.status === "issue";
      if (
        !hasOpsAccess ||
        body.proof ||
        body.locationEvent ||
        !onlyAdministrativeClosure ||
        !allowedStatus
      ) {
        return bad(
          "This legacy combined booking is read-only. Create separate departure and arrival bookings; operations may only archive, cancel, or flag this record.",
          409
        );
      }
    }
    if (patch.status && !bookingStatuses.includes(patch.status)) {
      return bad("Unsupported booking status.");
    }
    const reservedStatusError = reservedAgentAssignmentStatus(patch.status);
    if (reservedStatusError) return bad(reservedStatusError, 409);
    if (patch.status && atomicCustodyStatuses.has(patch.status)) {
      return bad(
        "Pickup, transfer, and delivery statuses are written only by the atomic custody checkpoint.",
        409
      );
    }
    if (patch.locationEvents !== undefined) {
      return bad("Location trail is append-only. Submit a GPS checkpoint or proof instead.", 409);
    }
    if (
      patch.issueType &&
      !Object.prototype.hasOwnProperty.call(ISSUE_TYPE_LABELS, patch.issueType)
    ) {
      return bad("Select a supported issue type.");
    }
    const locationEventError = validateLocationEventInput(body.locationEvent);
    if (locationEventError) return bad(locationEventError, 409);
    if (body.locationEvent?.kind === "driver_en_route" && patch.status !== "en_route") {
      return bad("Route-start GPS must be attached to starting route.", 409);
    }
    if (body.locationEvent?.kind === "driver_arrived" && patch.status !== "arrived") {
      return bad("Arrival GPS must be attached to marking arrival.", 409);
    }
    if (
      patch.status === "en_route" &&
      body.locationEvent?.kind !== "driver_en_route"
    ) {
      return bad("Route-start GPS from the assigned driver is required before starting route.", 409);
    }
    if (
      patch.status === "arrived" &&
      body.locationEvent?.kind !== "driver_arrived"
    ) {
      return bad("Arrival GPS from the assigned driver is required before marking arrival.", 409);
    }
    const statusChanged = Boolean(
      patch.status && patch.status !== existing.status
    );
    const archiveChanged = Boolean(
      patch.archivedAt !== undefined &&
        (patch.archivedAt ?? null) !== (existing.archived_at ?? null)
    );
    const issueRecordPatch = Boolean(
      patch.issueType !== undefined ||
        patch.issueNotes !== undefined ||
        patch.issueResolution !== undefined
    );
    const requiresOpsStatus = Boolean(
      archiveChanged ||
        (statusChanged &&
          patch.status &&
          adminOnlyStatuses.includes(patch.status))
    );
    const requiresDriver =
      Boolean(body.proof) ||
      Boolean(body.locationEvent) ||
      Boolean(patch.driverName || patch.driverUserId || patch.assignedAt) ||
      Boolean(
        statusChanged &&
          patch.status &&
          driverStatuses.includes(patch.status)
      );
    const driverAuth = await authorizeDriverRequest(request);
    const ownsOrToken =
      userOwns(existing, user?.id) || tokenMatches(existing, body.accessToken);
    const customerClosing = statusChanged && patch.status === "closed";
    const opsOverrideClosing = customerClosing && hasOpsAccess;
    const travelerClosing = customerClosing && !opsOverrideClosing;

    if (
      patch.customerConfirmedAt !== undefined ||
      patch.closedAt !== undefined ||
      (!customerClosing && patch.customerSignatureName !== undefined)
    ) {
      return bad(
        "Traveler-confirmation and close timestamps are server-recorded by the atomic custody close action.",
        403
      );
    }

    if (customerClosing && (body.proof || body.locationEvent)) {
      return bad(
        "Close the booking from its existing handoff evidence; do not attach a new proof or GPS event to the close request.",
        409
      );
    }

    if (requiresOpsStatus && !hasOpsAccess) {
      return bad("Operations access is required to set this booking status.", 403);
    }

    if (issueRecordPatch && !hasOpsAccess) {
      return bad("Operations access is required to update the issue record.", 403);
    }

    if (travelerClosing) {
      if (!ownsOrToken) {
        return bad("Customer access is required to confirm delivery.", 403);
      }
      if (existing.status !== "delivery_pending") {
        return bad("Delivery can only be confirmed after driver delivery proof is submitted.", 409);
      }
      if (!patch.customerSignatureName?.trim()) {
        return bad("Enter the receiving customer name before confirming delivery.", 409);
      }
      if (
        !existing.delivery_confirmation_code ||
        body.confirmationCode?.trim() !== existing.delivery_confirmation_code
      ) {
        return bad("Confirmation code does not match this booking.", 409);
      }
    }

    if (opsOverrideClosing && !reason) {
      return bad(
        "Operations must record an override reason before closing without traveler confirmation.",
        409
      );
    }

    if (
      patch.status === "issue" &&
      !patch.issueType &&
      !existing.issue_type
    ) {
      return bad("Select an issue type before marking this booking as Issue / Failed.", 409);
    }

    if (requiresDriver) {
      if ((body.proof || body.locationEvent) && !driverAuth.ok) {
        return bad(
          "Physical proof and GPS evidence require the assigned driver's authenticated session.",
          403
        );
      }
      if (!hasOpsAccess && !driverAuth.ok) {
        return bad("Driver access is required for this update.", 403);
      }
      if (!hasOpsAccess || body.proof || body.locationEvent) {
        if (!driverAuth.driverAccessId) {
          return bad("A current person-bound driver account is required.", 403);
        }
        if (existing.status === "pending") {
          return bad("Travelyt must confirm this booking before driver action.", 409);
        }
        if (patch.status === "assigned" && existing.status !== "paid") {
          return bad("Only confirmed paid bookings can be assigned.", 409);
        }
        if (patch.status === "assigned") {
          return bad("Operations must assign bookings before drivers can accept them.", 403);
        }
        const { data: assignment, error: assignmentError } = await supabase
          .from("booking_agent_assignments")
          .select("booking_id, status, primary_driver_access_id, accepted_by_driver_access_id")
          .eq("booking_id", id)
          .eq("primary_driver_access_id", driverAuth.driverAccessId)
          .eq("status", "accepted")
          .maybeSingle<DriverBookingAssignment>();
        if (assignmentError) return bad("Could not verify driver assignment.", 500);
        if (!validDriverAssignment(assignment, driverAuth.driverAccessId, true)) {
          await recordOpsException(
            supabase,
            id,
            "DRIVER_UNASSIGNED_ACCESS",
            "Driver attempted to act on a booking that was not assigned to them.",
            "critical",
            {
              requestedDriver: patch.driverName,
              assignedDriver: existing.driver_name,
              authorizedDriver: driverAuth.driverName,
              authorizedDriverAccessId: driverAuth.driverAccessId,
              requestedStatus: patch.status,
            }
          );
          return bad("This booking must be assigned to your driver profile before you can update it.", 403);
        }
        if (patch.status === "accepted" && existing.status !== "assigned") {
          return bad("Travelyt dispatch must assign this booking before driver acceptance.", 409);
        }
        if (patch.status === "en_route" && existing.status !== "accepted") {
          return bad("Driver must accept the job before starting route.", 409);
        }
        if (
          patch.status === "en_route" &&
          body.locationEvent?.kind !== "driver_en_route"
        ) {
          return bad("Route-start GPS checkpoint is required before starting route.", 409);
        }
        if (patch.status === "arrived" && existing.status !== "en_route") {
          return bad("Driver must start route before marking arrival.", 409);
        }
        if (
          patch.status === "arrived" &&
          body.locationEvent?.kind !== "driver_arrived"
        ) {
          return bad("Arrival GPS checkpoint is required before marking arrival.", 409);
        }
        if (
          patch.status &&
          patch.status !== "accepted" &&
          patch.status !== "en_route" &&
          patch.status !== "arrived" &&
          !(patch.driverName || existing.driver_name)
        ) {
          return bad("Assign this booking before updating custody status.", 409);
        }
      }
    } else if (
      !canReadBooking(existing, user?.id, body.accessToken, false, hasOpsAccess)
    ) {
      return bad("You do not have access to this booking.", 403);
    }

    let storedProof = body.proof;
    if (body.proof) {
      const airlineAuthorized = carrierHandoffAuthorized({
        externalProvider: existing.external_provider,
        externalReference: existing.external_reference,
        externalStatus: existing.external_status,
      });
      if (body.proof.kind === "airline_handoff" && !airlineAuthorized) {
        return bad("Airline handoff proof is locked until the carrier and station explicitly authorize this booking.", 409);
      }
      if (body.proof.kind === "customer_handoff" && (existing.service !== "departure" || airlineAuthorized)) {
        return bad("Passenger terminal handoff proof is only valid for a carrier-neutral departure booking.", 409);
      }
      if (
        existing.service === "arrival" &&
        body.proof.kind === "seal" &&
        (!body.proof.handoff?.recipientName?.trim() ||
          !body.proof.handoff.organization?.trim() ||
          !body.proof.handoff.badgeOrReference?.trim())
      ) {
        return bad(
          "Every airport-release bag requires the releasing party name, organization, and badge/reference.",
          409
        );
      }
      const proofError = validateProofShape(body.proof);
      if (proofError) {
        await recordOpsException(
          supabase,
          id,
          "PROOF_REJECTED",
          proofError,
          "warning",
          { proofKind: body.proof.kind }
        );
        return bad(proofError, 409);
      }
      try {
        storedProof = await storeProofImage(id, body.proof);
      } catch (proofError) {
        return bad(
          proofError instanceof Error
            ? proofError.message
            : "Proof image could not be stored. Nothing was recorded.",
          503
        );
      }
    }

    if (requiresDriver && !hasOpsAccess) {
      const nextStatus = patch.status;
      const custodyStarts =
        nextStatus === "picked_up" ||
        (existing.service === "arrival" && nextStatus === "in_transit");
      if (custodyStarts && !custodyIdentityReady(existing)) {
        const travelerBlockers = passengerManifestCustodyBlockers(
          existing.passenger_manifest,
          Boolean(existing.customer_identity_verified_at)
        );
        const blockers = [
          existing.customer_identity_verified_at
            ? ""
            : "Customer ID review is not complete.",
          existing.driver_identity_verified_at
            ? ""
            : "Driver ID review is not complete.",
          existing.restricted_items_attested_at
            ? ""
            : "Identity and customer declaration review is not complete.",
          ...travelerBlockers,
        ].filter(Boolean);
        await recordOpsException(
          supabase,
          id,
          "CUSTODY_IDENTITY_GATE",
          "Driver tried to start custody before identity verification and the customer's prohibited-item declaration were complete.",
          "critical",
          { status: existing.status, nextStatus }
        );
        return bad(
          `Driver cannot start because identity and customer declaration review is not complete. ${blockers.join(" ")}`,
          409
        );
      }

      if (nextStatus === "picked_up") {
        if (existing.service === "arrival") {
          return bad("Arrival jobs use airport release, not seal pickup.", 409);
        }
        if (existing.status !== "arrived" || !hasAllRequiredSealProofs(existing)) {
          return bad("A separate intact seal photo, seal ID, method, and GPS proof are required for every bag before pickup can be confirmed.", 409);
        }
      }

      if (nextStatus === "in_transit") {
        if (existing.service === "arrival") {
          if (existing.status !== "arrived" || !hasAllArrivalReleaseProofs(existing)) {
            return bad(
              "Every bag requires a separate intact airport-release seal photo, GPS point, seal ID, method, and releasing-party details.",
              409
            );
          }
        } else {
          if (existing.status !== "picked_up" || !hasApprovedSeal(existing)) {
            return bad("Customer seal approval is required before airline handoff.", 409);
          }
          if (!hasRequiredProof(existing, "airline_handoff")) {
            return bad("Airline handoff proof is required.", 409);
          }
        }
      }

      if (nextStatus === "delivered") {
        if (existing.service === "departure") {
          if (!carrierHandoffAuthorized({
            externalProvider: existing.external_provider,
            externalReference: existing.external_reference,
            externalStatus: existing.external_status,
          })) {
            return bad("Passenger-present departure jobs close through customer terminal confirmation, not airline acceptance.", 409);
          }
          if (existing.status !== "picked_up" || !hasApprovedSeal(existing)) {
            return bad("Customer seal approval is required before airline handoff.", 409);
          }
          if (!hasRequiredProof(existing, "airline_handoff")) {
            return bad("Airline handoff proof is required before completing departure service.", 409);
          }
        } else if (existing.status !== "in_transit" || !hasRequiredProof(existing, "delivery")) {
          return bad("Delivery photo and GPS proof are required before completion.", 409);
        }
      }

      if (nextStatus === "delivery_pending") {
        if (existing.service === "departure") {
          if (carrierHandoffAuthorized({
            externalProvider: existing.external_provider,
            externalReference: existing.external_reference,
            externalStatus: existing.external_status,
          })) {
            return bad("Carrier-authorized departure jobs require airline receiving-party proof.", 409);
          }
          if (
            existing.status !== "picked_up" ||
            !hasApprovedSeal(existing) ||
            !hasRequiredProof(existing, "customer_handoff")
          ) {
            return bad("Passenger terminal handoff photo, GPS, recipient identity match, and approved seal are required.", 409);
          }
        } else if (existing.service === "arrival") {
          if (existing.status !== "in_transit" || !hasRequiredProof(existing, "delivery")) {
            return bad("Delivery photo and GPS proof are required before customer confirmation.", 409);
          }
        } else {
          return bad("Round-trip bookings require separate confirmed legs before customer confirmation.", 409);
        }
      }
    }

    const actor = auditActor(
      adminSession,
      hasAdminAccess,
      request,
      user,
      driverAuth,
    );

    // Seal the booking-wide close checkpoint before changing the booking row.
    // The RPC is atomic across every expected bag and idempotent, so a failed
    // booking-row update can be retried without duplicating custody events.
    if (customerClosing) {
      const checkpoint = await recordCustodyCheckpoint({
        bookingId: id,
        checkpointKey: travelerClosing
          ? `booking:${id}:recipient-confirmed`
          : `booking:${id}:operations-close-override`,
        expectedBagCount: Number(existing.bags),
        eventType: travelerClosing
          ? "recipient_confirmed"
          : "operations_close_override",
        actorRole: travelerClosing ? "traveler" : "operations",
        actorName: travelerClosing
          ? patch.customerSignatureName?.trim() || null
          : actor.actorName || "Operations override",
        verifiedMethod: travelerClosing ? "confirmation_code" : "manual_record",
        note: travelerClosing
          ? "Traveler confirmed physical receipt through the booking account and delivery confirmation code."
          : `Operations closure override; no traveler confirmation code was claimed. Reason: ${reason}`,
      });

      if (!checkpoint.ok) {
        await recordOpsException(
          supabase,
          id,
          travelerClosing
            ? "RECIPIENT_CONFIRMATION_LEDGER_FAILED"
            : "OPERATIONS_CLOSE_OVERRIDE_LEDGER_FAILED",
          travelerClosing
            ? "Booking close was blocked because recipient confirmation was not durably recorded for every bag."
            : "Booking close was blocked because the operations override was not durably recorded for every bag.",
          "critical",
          {
            custodyError: checkpoint.error,
            custodyCode: checkpoint.code,
            expectedBagCount: Number(existing.bags),
            closeMode: travelerClosing ? "traveler_confirmation" : "operations_override",
          }
        );
        return bad(
          "Could not seal the close checkpoint in the custody ledger. Booking remains open.",
          500
        );
      }

      if (checkpoint.bookingStatus !== "closed") {
        await recordOpsException(
          supabase,
          id,
          "BOOKING_CLOSE_STATUS_MISMATCH",
          "The atomic custody checkpoint completed without returning the required closed booking state.",
          "critical",
          {
            returnedStatus: checkpoint.bookingStatus,
            closeMode: travelerClosing
              ? "traveler_confirmation"
              : "operations_override",
          }
        );
        return bad("The custody checkpoint did not close the booking.", 500);
      }

      const { data: closedRow, error: closedRowError } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .eq("status", "closed")
        .maybeSingle<BookingRow>();
      if (closedRowError || !closedRow) {
        console.error("Could not reload atomically closed booking", closedRowError);
        return bad(
          "The custody checkpoint closed, but the updated booking could not be reloaded. Refresh before retrying.",
          503
        );
      }

      await queueBookingNotification(closedRow, "status");
      const includeAccessToken =
        hasOpsAccess ||
        userOwns(closedRow, user?.id) ||
        tokenMatches(closedRow, body.accessToken);
      return NextResponse.json({
        ok: true,
        booking: await responseBooking(closedRow, includeAccessToken),
      });
    }

    const rowPatch = bookingPatchToRowPatch(body.patch ?? {});
    const now = new Date().toISOString();
    if (patch.status === "accepted" && !patch.acceptedAt) {
      rowPatch.accepted_at = now;
    }
    if (patch.status === "en_route" && !patch.enRouteAt) {
      rowPatch.en_route_at = now;
    }
    if (patch.status === "arrived" && !patch.arrivedAt) {
      rowPatch.arrived_at = now;
    }
    if (patch.status === "delivery_pending" && !patch.deliveryPendingAt) {
      rowPatch.delivery_pending_at = now;
    }
    if (patch.status === "issue" && !patch.issueOpenedAt) {
      rowPatch.issue_opened_at = existing.issue_opened_at ?? now;
    }
    if (patch.status === "issue" && !patch.issueNotes && reason) {
      rowPatch.issue_notes = existing.issue_notes ?? reason;
    }
    if (
      existing.status === "issue" &&
      statusChanged &&
      patch.status !== "issue" &&
      !patch.issueResolvedAt
    ) {
      rowPatch.issue_resolved_at = now;
      if (!patch.issueResolution && reason) rowPatch.issue_resolution = reason;
    }
    const history = Array.isArray(existing.status_history)
      ? [...existing.status_history]
      : [];
    if (statusChanged && patch.status) {
      history.push(
        auditEntry({
          action: "status_change",
          fromStatus: existing.status,
          toStatus: patch.status,
          ...actor,
          reason: opsOverrideClosing
            ? `Operations closure override (not traveler confirmation): ${reason}`
            : reason,
        })
      );
    } else if (archiveChanged) {
      history.push(
        auditEntry({
          action: "archive_toggle",
          fromStatus: existing.status,
          toStatus: existing.status,
          ...actor,
          reason:
            reason ||
            (patch.archivedAt
              ? "Archived from active operations queue."
              : "Restored to active operations queue."),
        })
      );
    } else if (storedProof) {
      history.push(
        auditEntry({
          action: "proof_added",
          fromStatus: existing.status,
          toStatus: existing.status,
          ...actor,
          reason: reason || `${storedProof.kind.replaceAll("_", " ")} proof added.`,
        })
      );
    }

    if (history.length !== (existing.status_history?.length ?? 0)) {
      rowPatch.status_history = history;
    }

    if (archiveChanged) {
      rowPatch.archived_at = patch.archivedAt ? now : null;
      rowPatch.archived_by = patch.archivedAt
        ? actor.actorName || actor.actorRole
        : null;
    }

    if (body.locationEvent) {
      rowPatch.location_events = [
        ...(existing.location_events ?? []),
        createServerLocationEvent(
          body.locationEvent.kind,
          body.locationEvent.location,
          actor.actorName,
          body.locationEvent.note
        ),
      ];
    }

    if (storedProof) {
      rowPatch.proofs = [...(existing.proofs ?? []), storedProof];
      if (storedProof.location) {
        const nextEvents = Array.isArray(rowPatch.location_events)
          ? [...(rowPatch.location_events as NonNullable<Booking["locationEvents"]>)]
          : [...(existing.location_events ?? [])];
        nextEvents.push(
          createServerLocationEvent(
            locationKindForProof(storedProof.kind),
            storedProof.location,
            actor.actorName,
            storedProof.note
          )
        );
        rowPatch.location_events = nextEvents;
      }
    }

    if (storedProof && body.offlineProofDigest) {
      if (!/^[a-f0-9]{64}$/i.test(body.offlineProofDigest)) return bad("Offline proof digest is invalid.", 409);
      await recordOpsException(
        supabase,
        id,
        "OFFLINE_PROOF_RECONCILED",
        "Driver proof was captured offline and replayed through the authenticated custody endpoint.",
        "info",
        { proofKind: storedProof.kind, digest: body.offlineProofDigest }
      );
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(rowPatch)
      .eq("id", id)
      .eq("status", existing.status)
      .select("*")
      .single<BookingRow>();

    if (error) {
      console.error("Supabase booking update failed", error);
      return bad("Could not update booking.", 500);
    }

    if (statusChanged || storedProof) {
      await queueBookingNotification(data, storedProof ? "proof" : "status");
    }

    const includeAccessToken =
      hasOpsAccess ||
      userOwns(data, user?.id) ||
      tokenMatches(data, body.accessToken);
    return NextResponse.json({
      ok: true,
      booking: await responseBooking(data, includeAccessToken),
    });
  } catch (error) {
    console.error("Booking update failed", error);
    return bad("We could not update that booking.");
  }
}
