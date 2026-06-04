import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import {
  bookingPatchToRowPatch,
  bookingToInsert,
  rowToBooking,
  type BookingRow,
} from "@/lib/booking-mappers";
import { queueBookingNotification } from "@/lib/push-notifications-server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { calcPriceBreakdown } from "@/lib/pricing";
import { getAdminSession, isFullAdminSession, isOpsSession } from "@/lib/admin-auth";
import { canonicalDriverName } from "@/lib/drivers";
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s().-]{6,}$/;
const serviceTypes = ["departure", "arrival", "both"] as const;
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
const ISSUE_TYPE_LABELS = {
  airport_hold: "Airport hold",
  customer_no_show: "Customer no-show",
  missing_id: "Missing ID",
  wrong_bag: "Wrong bag",
  driver_delay: "Driver delay",
  vehicle_issue: "Vehicle issue",
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

const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <info@travelyt.us>";
const proofBucket = "booking-proofs";
const maxProofBytes = 10 * 1024 * 1024;

const serviceLabels: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function newAccessToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8);
}

function newDeliveryConfirmationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function adminAuthorized(request: Request) {
  const expected = process.env.TRAVELYT_ADMIN_ACCESS_CODE;
  return isFullAdminSession(request) || Boolean(expected && request.headers.get("x-travelyt-admin-code") === expected);
}

function opsAuthorized(request: Request) {
  const expected = process.env.TRAVELYT_ADMIN_ACCESS_CODE;
  return isOpsSession(request) || Boolean(expected && request.headers.get("x-travelyt-admin-code") === expected);
}

function tokenMatches(row: BookingRow, token?: string | null) {
  return Boolean(token && row.customer_access_token && token === row.customer_access_token);
}

function userOwns(row: BookingRow, userId?: string | null) {
  return Boolean(userId && row.customer_user_id && row.customer_user_id === userId);
}

function canReadBooking(
  request: Request,
  row: BookingRow,
  userId?: string | null,
  token?: string | null,
  driverAuthorized = false
) {
  return (
    opsAuthorized(request) ||
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

function driverCanSeeInList(row: BookingRow) {
  if (row.archived_at) return false;
  if (row.status === "pending") return false;
  if (row.status === "cancelled" || row.status === "issue") return false;
  if (row.status === "paid" && isPastTravelDate(row.travel_date)) return false;
  return true;
}

function redactForDriver(row: BookingRow) {
  const booking = rowToBooking(row);
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

async function signedProofUrls(booking: Booking) {
  if (!booking.proofs.some((proof) => proof.storagePath)) return booking;

  const supabase = getSupabaseAdmin();
  if (!supabase) return booking;

  const proofs = await Promise.all(
    booking.proofs.map(async (proof) => {
      if (!proof.storagePath) return proof;

      const { data, error } = await supabase.storage
        .from(proofBucket)
        .createSignedUrl(proof.storagePath, 60 * 60);

      if (error || !data?.signedUrl) {
        console.error("Supabase proof signed URL failed", error);
        return proof;
      }

      return { ...proof, dataUrl: data.signedUrl };
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
  if (!proof.dataUrl.startsWith("data:")) return proof;

  const parsed = parseProofDataUrl(proof.dataUrl);
  if (!parsed) return proof;

  const supabase = getSupabaseAdmin();
  if (!supabase) return proof;

  const fileName = `${Date.now()}-${proof.kind}-${crypto.randomUUID()}.${parsed.extension}`;
  const storagePath = `${bookingId}/${fileName}`;
  const { error } = await supabase.storage
    .from(proofBucket)
    .upload(storagePath, parsed.buffer, {
      contentType: parsed.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Supabase proof upload failed", error);
    return proof;
  }

  const { data: signed } = await supabase.storage
    .from(proofBucket)
    .createSignedUrl(storagePath, 60 * 60);

  return {
    ...proof,
    dataUrl: signed?.signedUrl ?? proof.dataUrl,
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
  return Boolean(latestProof(row, "seal")?.approvedAt);
}

function hasRequiredProof(row: BookingRow, kind: Booking["proofs"][number]["kind"]) {
  const proof = latestProof(row, kind);
  if (!proof?.dataUrl || !proof.location) return false;
  if (kind === "seal") return Boolean(proof.sealId);
  if (kind === "airline_handoff" || kind === "pickup") {
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
      row.restricted_items_attested_at
  );
}

function auditActor(
  request: Request,
  user: Awaited<ReturnType<typeof getRequestUser>>,
  driverAuth: DriverAuthorization
): Pick<
  NonNullable<Booking["statusHistory"]>[number],
  "actorRole" | "actorName"
> {
  const adminSession = getAdminSession(request);
  if (adminSession?.email) {
    return { actorRole: adminSession.role, actorName: adminSession.email };
  }
  if (adminAuthorized(request)) {
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
  const locationError = validateGpsLocation(proof.location);
  if (locationError) return locationError;
  if (proof.kind === "seal" && !proof.sealId?.trim()) {
    return "Seal ID is required.";
  }
  if (proof.kind === "airline_handoff" || proof.kind === "pickup") {
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
  if (kind === "airline_handoff") return "airline_handoff";
  return "delivery_proof";
}

function validateBooking(
  body: Partial<Booking> & {
    source?: string;
    flightTime?: string;
    expressPickup?: boolean;
  }
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
  const phone = body.phone?.trim();
  const notes = body.notes?.trim() || undefined;
  const declaredValueCents =
    typeof body.declaredValueCents === "number" &&
    Number.isFinite(body.declaredValueCents)
      ? Math.max(0, Math.round(body.declaredValueCents))
      : undefined;
  const distanceMiles =
    typeof body.distanceMiles === "number" && Number.isFinite(body.distanceMiles)
      ? Math.max(0, body.distanceMiles)
      : undefined;

  if (!service || !serviceTypes.includes(service)) return "Pick a service.";
  if (!airport) return "Airport is required.";
  if (!address) return "Address is required.";
  const dateError = validateTravelDateTime(date, body.flightTime);
  if (dateError) return dateError;
  if (!flightTime) return "Select a flight time.";
  const cutoffError = validateFlightCutoff(
    date,
    flightTime,
    service,
    distanceMiles
  );
  if (cutoffError) return cutoffError;
  if (!bags || bags < 1) return "Need at least one bag.";
  if (!name) return "Name is required.";
  if (!email || !emailPattern.test(email)) return "Enter a valid email address.";
  if (!phone || !phonePattern.test(phone)) return "Enter a valid phone number.";
  if (!body.restrictedItemsAttestedAt) {
    return "Confirm that your bags do not contain restricted or undeclared high-value items.";
  }
  if (declaredValueCents && !body.coverageAcceptedAt) {
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

  const booking: Booking = {
    id: body.id?.trim() || `TVT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    service,
    airport,
    address,
    date,
    flightTime,
    flight,
    bags,
    name,
    email,
    phone,
    notes,
    distanceMiles,
    declaredValueCents,
    coverageElection: declaredValueCents ? "declared_value" : "standard",
    coverageAcceptedAt: body.coverageAcceptedAt,
    restrictedItemsAttestedAt: body.restrictedItemsAttestedAt,
    customerIdentityVerifiedAt: body.customerIdentityVerifiedAt,
    driverIdentityVerifiedAt: body.driverIdentityVerifiedAt,
    status: body.status ?? "pending",
    priceCents: Math.max(0, priceBreakdown.totalBeforePromoCents - discountCents),
    promoCode,
    discountCents: discountCents || undefined,
    createdAt: body.createdAt ?? new Date().toISOString(),
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
    deliveryConfirmationCode:
      body.deliveryConfirmationCode || newDeliveryConfirmationCode(),
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
  if (!resendApiKey || !leadNotifyEmail) return;

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
    `Declared value: ${booking.declaredValueCents ? formatPrice(booking.declaredValueCents) : "Standard coverage"}`,
    `Price:    ${formatPrice(booking.priceCents)}`,
    "",
    `Name:     ${booking.name}`,
    `Email:    ${booking.email}`,
    `Phone:    ${booking.phone}`,
    `Notes:    ${booking.notes || "(none)"}`,
    `Track:    ${trackingUrl}`,
    "",
    `Source:   ${source}`,
    `Created:  ${booking.createdAt}`,
  ].join("\n");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: leadFromEmail,
      to: leadNotifyEmail,
      subject: `New Travelyt booking: ${booking.id} (${booking.name})`,
      reply_to: booking.email,
      text: lines,
    }),
  });

  if (!resendResponse.ok) {
    const message = await resendResponse.text();
    console.error("Resend booking notification failed", message);
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
  const isDriverOnly = driverAuth.ok && !opsAuthorized(request);

  if (id) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle<BookingRow>();

    if (error) return bad("Could not load booking.", 500);
    if (data && !canReadBooking(request, data, user?.id, accessToken, driverAuth.ok)) {
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
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const isPrivileged = opsAuthorized(request) || driverAuth.ok;

  if (!isPrivileged) {
    if (!user) return bad("Sign in or provide driver access.", 401);
    query = query.eq("customer_user_id", user.id);
  }

  const { data, error } = await query;

  if (error) return bad("Could not load bookings.", 500);
  const rows = ((data ?? []) as BookingRow[]).filter((row) => {
    if (isDriverOnly) return driverCanSeeInList(row);
    if (row.archived_at && (!includeArchived || !opsAuthorized(request))) {
      return false;
    }
    return true;
  });

  return NextResponse.json({
    ok: true,
    bookings: await Promise.all(rows.map((row) =>
      responseBooking(
        row,
        opsAuthorized(request) || userOwns(row, user?.id),
        isDriverOnly
      )
    )),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "bookings:post", 12);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as Partial<Booking> & { source?: string };
    const validated = validateBooking(body);
    if (typeof validated === "string") return bad(validated);

    const user = await getRequestUser(request);
    validated.customerAccessToken = validated.customerAccessToken || newAccessToken();
    validated.customerUserId = user?.id;

    const source = body.source?.trim() || "quote-form";
    const { data, error } = await supabase
      .from("bookings")
      .insert(bookingToInsert(validated, source))
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
    };
    const id = body.id?.trim();
    if (!id) return bad("Missing booking ID.");
    const user = await getRequestUser(request);

    const { data: existing, error: loadError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle<BookingRow>();

    if (loadError) return bad("Could not load booking.", 500);
    if (!existing) return bad("Booking not found.", 404);

    const patch = body.patch ?? {};
    const reason = body.reason?.trim() || undefined;
    if (patch.status && !bookingStatuses.includes(patch.status)) {
      return bad("Unsupported booking status.");
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
    const statusChanged = Boolean(
      patch.status && patch.status !== existing.status
    );
    const archiveChanged = Boolean(
      patch.archivedAt !== undefined &&
        (patch.archivedAt ?? null) !== (existing.archived_at ?? null)
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

    if (requiresOpsStatus && !opsAuthorized(request)) {
      return bad("Operations access is required to set this booking status.", 403);
    }

    if (customerClosing && !opsAuthorized(request)) {
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
        existing.delivery_confirmation_code &&
        body.confirmationCode?.trim() !== existing.delivery_confirmation_code
      ) {
        return bad("Confirmation code does not match this booking.", 409);
      }
    }

    if (
      patch.status === "issue" &&
      !patch.issueType &&
      !existing.issue_type
    ) {
      return bad("Select an issue type before marking this booking as Issue / Failed.", 409);
    }

    if (requiresDriver) {
      if (!opsAuthorized(request) && !driverAuth.ok) {
        return bad("Driver access is required for this update.", 403);
      }
      if (!opsAuthorized(request)) {
        if (driverAuth.perDriverCode && patch.driverName && driverAuth.driverName) {
          if (canonicalDriverName(patch.driverName) !== canonicalDriverName(driverAuth.driverName)) {
            await recordOpsException(
              supabase,
              id,
              "DRIVER_ID_MISMATCH",
              "Driver attempted to claim or update a job under a different name.",
              "critical",
              { requestedDriver: patch.driverName, authorizedDriver: driverAuth.driverName }
            );
            return bad("This access code is not assigned to that driver.", 403);
          }
        }
        if (existing.status === "pending") {
          return bad("Travelyt must confirm this booking before driver action.", 409);
        }
        if (patch.status === "assigned" && existing.status !== "paid") {
          return bad("Only confirmed paid bookings can be assigned.", 409);
        }
        if (
          patch.status === "accepted" &&
          !["paid", "assigned"].includes(existing.status)
        ) {
          return bad("Only confirmed or assigned bookings can be accepted.", 409);
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
          patch.status !== "assigned" &&
          patch.status !== "accepted" &&
          patch.status !== "en_route" &&
          patch.status !== "arrived" &&
          !(patch.driverName || existing.driver_name)
        ) {
          return bad("Assign this booking before updating custody status.", 409);
        }
      }
    } else if (!canReadBooking(request, existing, user?.id, body.accessToken)) {
      return bad("You do not have access to this booking.", 403);
    }

    let storedProof = body.proof;
    if (body.proof) {
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
      storedProof = await storeProofImage(id, body.proof);
    }

    if (requiresDriver && !opsAuthorized(request)) {
      const nextStatus = patch.status;
      if (nextStatus === "assigned" || nextStatus === "accepted") {
        const assignedDriver = patch.driverName || driverAuth.driverName;
        if (!assignedDriver) return bad("Select the driver assigned to this access code.", 403);
        if (
          nextStatus === "accepted" &&
          existing.driver_name &&
          canonicalDriverName(existing.driver_name) !== canonicalDriverName(assignedDriver)
        ) {
          return bad("This booking is assigned to a different driver.", 403);
        }

        const { data: conflicts, error: conflictError } = await supabase
          .from("bookings")
          .select("id")
          .eq("travel_date", existing.travel_date)
          .eq("driver_name", assignedDriver)
          .in("status", [
            "assigned",
            "accepted",
            "en_route",
            "arrived",
            "picked_up",
            "in_transit",
            "delivery_pending",
          ])
          .neq("id", id)
          .limit(1);

        if (conflictError) return bad("Could not check driver availability.", 500);
        if (conflicts?.length) {
          await recordOpsException(
            supabase,
            id,
            "DRIVER_SCHEDULE_CONFLICT",
            `${assignedDriver} already has an active job on this travel date.`,
            "critical",
            { driverName: assignedDriver, conflictingBookingId: conflicts[0].id }
          );
          return bad("This driver already has an active job on this travel date.", 409);
        }
      }

      const custodyStarts =
        nextStatus === "picked_up" ||
        (existing.service === "arrival" && nextStatus === "in_transit");
      if (custodyStarts && !custodyIdentityReady(existing)) {
        const blockers = [
          existing.customer_identity_verified_at
            ? ""
            : "Customer ID review is not complete.",
          existing.driver_identity_verified_at
            ? ""
            : "Driver ID review is not complete.",
          existing.restricted_items_attested_at
            ? ""
            : "Manual ID/bag review is not complete.",
        ].filter(Boolean);
        await recordOpsException(
          supabase,
          id,
          "CUSTODY_IDENTITY_GATE",
          "Driver tried to start custody before ID verification and restricted-item attestation were complete.",
          "critical",
          { status: existing.status, nextStatus }
        );
        return bad(
          `Driver cannot start because manual ID/bag review is not complete. ${blockers.join(" ")}`,
          409
        );
      }

      if (nextStatus === "picked_up") {
        if (existing.service === "arrival") {
          return bad("Arrival jobs use airport release, not seal pickup.", 409);
        }
        if (existing.status !== "arrived" || !hasRequiredProof(existing, "seal")) {
          return bad("Seal photo, seal ID, and GPS proof are required before pickup can be confirmed.", 409);
        }
      }

      if (nextStatus === "in_transit") {
        if (existing.service === "arrival") {
          if (existing.status !== "arrived" || !hasRequiredProof(existing, "pickup")) {
            return bad("Airport release proof and receiving-party details are required.", 409);
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
        if (existing.service !== "arrival") {
          return bad("Only arrival deliveries use customer delivery confirmation.", 409);
        }
        if (existing.status !== "in_transit" || !hasRequiredProof(existing, "delivery")) {
          return bad("Delivery photo and GPS proof are required before customer confirmation.", 409);
        }
      }
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
    if (patch.status === "closed" && !patch.closedAt) {
      rowPatch.closed_at = now;
    }
    if (patch.status === "closed" && !patch.customerConfirmedAt) {
      rowPatch.customer_confirmed_at = now;
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
    const actor = auditActor(request, user, driverAuth);
    const history = Array.isArray(existing.status_history)
      ? [...existing.status_history]
      : [];
    const manualReviewCompleted = Boolean(
      (!existing.customer_identity_verified_at && patch.customerIdentityVerifiedAt) ||
        (!existing.driver_identity_verified_at && patch.driverIdentityVerifiedAt) ||
        (!existing.restricted_items_attested_at && patch.restrictedItemsAttestedAt)
    );

    if (statusChanged && patch.status) {
      history.push(
        auditEntry({
          action: "status_change",
          fromStatus: existing.status,
          toStatus: patch.status,
          ...actor,
          reason,
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
    } else if (manualReviewCompleted) {
      history.push(
        auditEntry({
          action: "manual_review_override",
          fromStatus: existing.status,
          toStatus: existing.status,
          ...actor,
          reason: reason || "Manual ID/bag review marked complete.",
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

    const { data, error } = await supabase
      .from("bookings")
      .update(rowPatch)
      .eq("id", id)
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
      opsAuthorized(request) ||
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
