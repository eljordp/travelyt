"use client";

import {
  calcPriceBreakdown,
  calcPriceCents,
} from "@/lib/pricing";
import {
  getPromoDiscountCents,
  normalizePromoCode,
  PROMO_CODES,
} from "@/lib/promos";

export { calcPriceBreakdown, calcPriceCents };
export { getPromoDiscountCents, normalizePromoCode, PROMO_CODES };

export type BookingStatus =
  | "pending"
  | "paid"
  | "assigned"
  | "accepted"
  | "en_route"
  | "arrived"
  | "picked_up"
  | "in_transit"
  | "delivery_pending"
  | "delivered"
  | "closed"
  | "cancelled"
  | "issue";

export type ServiceType = "departure" | "arrival" | "both";

export const ISSUE_TYPE_LABELS = {
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

export type BookingIssueType = keyof typeof ISSUE_TYPE_LABELS;

export interface BookingLocationEvent {
  id: string;
  kind:
    | "driver_en_route"
    | "driver_arrived"
    | "seal_proof"
    | "airport_release"
    | "airline_handoff"
    | "delivery_proof";
  label: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
  actorName?: string;
  note?: string;
}

export interface BookingLocationEventInput {
  kind: BookingLocationEvent["kind"];
  location: NonNullable<PhotoProof["location"]>;
  note?: string;
}

export interface BookingAuditEntry {
  id: string;
  action:
    | "status_change"
    | "manual_review_override"
    | "proof_added"
    | "archive_toggle";
  fromStatus?: BookingStatus;
  toStatus?: BookingStatus;
  actorRole: "admin" | "dispatcher" | "driver" | "customer" | "system";
  actorName?: string;
  reason?: string;
  timestamp: string;
}

export interface PhotoProof {
  kind: "seal" | "pickup" | "airline_handoff" | "delivery";
  dataUrl: string;
  storagePath?: string;
  contentType?: string;
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    capturedAt: string;
  };
  handoff?: {
    recipientName: string;
    recipientRole?: string;
    organization: string;
    badgeOrReference?: string;
    verificationMethod: "employee_badge" | "driver_license" | "passport" | "manual";
  };
  sealId?: string;
  driverName?: string;
  note?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface Booking {
  id: string;
  service: ServiceType;
  airport: string;
  address: string;
  date: string;
  flightTime?: string;
  flight?: string;
  bags: number;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  distanceMiles?: number;
  declaredValueCents?: number;
  coverageElection?: "standard" | "declared_value";
  coverageAcceptedAt?: string;
  restrictedItemsAttestedAt?: string;
  customerIdentityVerifiedAt?: string;
  driverIdentityVerifiedAt?: string;
  status: BookingStatus;
  priceCents: number;
  promoCode?: string;
  discountCents?: number;
  createdAt: string;
  paidAt?: string;
  assignedAt?: string;
  acceptedAt?: string;
  enRouteAt?: string;
  arrivedAt?: string;
  driverName?: string;
  pickedUpAt?: string;
  deliveryPendingAt?: string;
  deliveredAt?: string;
  closedAt?: string;
  deliveryConfirmationCode?: string;
  customerConfirmedAt?: string;
  customerSignatureName?: string;
  issueType?: BookingIssueType;
  issueNotes?: string;
  issueOpenedAt?: string;
  issueResolvedAt?: string;
  issueResolution?: string;
  locationEvents?: BookingLocationEvent[];
  proofs: PhotoProof[];
  statusHistory?: BookingAuditEntry[];
  archivedAt?: string | null;
  archivedBy?: string | null;
  customerAccessToken?: string;
  customerUserId?: string;
  driverUserId?: string;
}

const KEY = "travelyt:bookings";
const EVENT = "travelyt:bookings-updated";
const DRIVER_CODE_KEY = "travelyt:driver-code";
const ACCESS_PREFIX = "travelyt:booking-access:";
let lastApiFailureStatus: number | undefined;
let lastApiFailureMessage = "";

async function authHeaders() {
  const headers: Record<string, string> = {};
  try {
    const { getSupabaseBrowser } = await import("@/lib/supabase-client");
    const supabase = getSupabaseBrowser();
    const session = supabase
      ? (await supabase.auth.getSession()).data.session
      : null;
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {}

  const driverCode = getDriverAccessCode();
  if (driverCode) headers["x-travelyt-driver-code"] = driverCode;
  const driverName = getStoredDriverName();
  if (driverName) headers["x-travelyt-driver-name"] = driverName;
  return headers;
}

function getStoredAccessToken(id: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${ACCESS_PREFIX}${id}`);
}

export function getBookingAccessToken(id: string): string | null {
  return getStoredAccessToken(id);
}

export function storeBookingAccessToken(id: string, accessToken?: string | null) {
  if (typeof window === "undefined" || !accessToken) return;
  try {
    localStorage.setItem(`${ACCESS_PREFIX}${id}`, accessToken);
  } catch {
    localStorage.removeItem(KEY);
    try {
      localStorage.setItem(`${ACCESS_PREFIX}${id}`, accessToken);
    } catch {}
  }
}

function storeAccessToken(booking: Booking) {
  storeBookingAccessToken(booking.id, booking.customerAccessToken);
}

export function getBookingTrackingHref(
  booking: Pick<Booking, "id" | "customerAccessToken">
) {
  const accessToken =
    booking.customerAccessToken || getBookingAccessToken(booking.id);
  const token = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  return `/track/${encodeURIComponent(booking.id)}${token}`;
}

export function getDriverAccessCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DRIVER_CODE_KEY);
}

export function getStoredDriverName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("travelyt:driver");
}

export function setDriverAccessCode(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRIVER_CODE_KEY, code);
}

export function clearDriverAccessCode() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRIVER_CODE_KEY);
}

function readLocal(): Booking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch {
    return [];
  }
}

function slimBookingForLocalCache(booking: Booking): Booking {
  return {
    ...booking,
    proofs: booking.proofs.map((proof) => ({
      ...proof,
      dataUrl: proof.storagePath || "",
    })),
  };
}

function writeLocal(rows: Booking[], notify = true) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    try {
      localStorage.setItem(KEY, JSON.stringify(rows.map(slimBookingForLocalCache)));
    } catch {
      localStorage.removeItem(KEY);
    }
  }
  if (notify) notifyBookingsChanged();
}

function notifyBookingsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

function sorted(rows: Booking[]): Booking[] {
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T | null> {
  lastApiFailureStatus = undefined;
  lastApiFailureMessage = "";
  try {
    const headers = {
      ...(await authHeaders()),
      ...(init?.headers as Record<string, string> | undefined),
    };
    const res = await fetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? "same-origin",
    });
    if (!res.ok) {
      lastApiFailureStatus = res.status;
      try {
        const payload = (await res.clone().json()) as { error?: string };
        lastApiFailureMessage =
          payload.error || `Request failed with status ${res.status}.`;
      } catch {
        const text = await res.text();
        lastApiFailureMessage =
          text.slice(0, 280) || `Request failed with status ${res.status}.`;
      }
      return null;
    }
    return (await res.json()) as T;
  } catch {
    lastApiFailureStatus = 0;
    lastApiFailureMessage = "Network connection failed. Try again.";
    return null;
  }
}

export function getLastApiFailureMessage() {
  return lastApiFailureMessage;
}

function canUseLocalFallback() {
  return lastApiFailureStatus === 0 || lastApiFailureStatus === undefined;
}

function upsertLocal(booking: Booking, notify = true) {
  const all = readLocal();
  const i = all.findIndex((b) => b.id === booking.id);
  if (i === -1) all.push(booking);
  else all[i] = booking;
  storeAccessToken(booking);
  writeLocal(all, notify);
}

export async function getBookings(): Promise<Booking[]> {
  const data = await apiJson<{ bookings: Booking[] }>("/api/bookings");
  if (data?.bookings) {
    data.bookings.forEach((booking) => upsertLocal(booking, false));
    return sorted(data.bookings);
  }
  return sorted(readLocal());
}

export async function getBooking(
  id: string,
  explicitAccessToken?: string | null
): Promise<Booking | undefined> {
  const accessToken = explicitAccessToken || getStoredAccessToken(id);
  if (explicitAccessToken) storeBookingAccessToken(id, explicitAccessToken);
  const qs = new URLSearchParams({ id });
  if (accessToken) qs.set("accessToken", accessToken);
  const data = await apiJson<{ booking: Booking | null }>(
    `/api/bookings?${qs.toString()}`
  );
  if (data?.booking) {
    upsertLocal(data.booking, false);
    return data.booking;
  }
  return readLocal().find((b) => b.id === id);
}

export async function createBooking(
  data: Omit<
    Booking,
    "id" | "status" | "createdAt" | "proofs" | "priceCents" | "discountCents"
  > & { promoCode?: string; expressPickup?: boolean; flightTime?: string }
): Promise<Booking> {
  const { expressPickup, flightTime, ...bookingData } = data;
  const priceBreakdown = calcPriceBreakdown(
    data.bags,
    data.service,
    expressPickup,
    data.distanceMiles
  );
  const promoCode = normalizePromoCode(data.promoCode);
  const discountCents = getPromoDiscountCents(
    priceBreakdown.promoEligibleCents,
    promoCode
  );
  const notes = [
    expressPickup ? "Express pickup requested." : "",
    typeof data.distanceMiles === "number"
      ? `Estimated airport distance: ${data.distanceMiles} miles.`
      : "",
    priceBreakdown.distanceSurchargeCents > 0
      ? `Distance surcharge: ${formatPrice(priceBreakdown.distanceSurchargeCents)} for ${priceBreakdown.extraDistanceMiles} miles beyond ${priceBreakdown.includedDistanceMiles} at ${formatPrice(priceBreakdown.distanceRateCents)}/mi.`
      : "",
    bookingData.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const booking: Booking = {
    ...bookingData,
    flightTime,
    notes: notes || undefined,
    promoCode,
    discountCents: discountCents || undefined,
    id: `TVT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: "pending",
    priceCents: priceBreakdown.totalBeforePromoCents - discountCents,
    proofs: [],
    createdAt: new Date().toISOString(),
  };

  const saved = await apiJson<{ booking: Booking }>("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...booking,
      expressPickup,
      flightTime,
      accessToken: getStoredAccessToken(booking.id),
      source: "quote-form",
    }),
  });

  if (saved?.booking) {
    upsertLocal(saved.booking);
    return saved.booking;
  }
  if (!canUseLocalFallback()) {
    throw new Error("Booking backend rejected this request.");
  }
  upsertLocal(booking);
  return booking;
}

export async function updateBooking(
  id: string,
  patch: Partial<Booking>,
  reason?: string,
  locationEvent?: BookingLocationEventInput
): Promise<Booking | undefined> {
  const saved = await apiJson<{ booking: Booking }>(`/api/bookings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      patch,
      reason,
      locationEvent,
      accessToken: getStoredAccessToken(id),
    }),
  });

  if (saved?.booking) {
    upsertLocal(saved.booking);
    return saved.booking;
  }

  if (!canUseLocalFallback()) return undefined;

  const all = readLocal();
  const i = all.findIndex((b) => b.id === id);
  if (i === -1) return;
  const next = { ...all[i], ...patch };
  if (locationEvent) {
    next.locationEvents = [
      ...(all[i].locationEvents ?? []),
      createLocationEvent(
        locationEvent.kind,
        locationEvent.location,
        getStoredDriverName() ?? undefined,
        locationEvent.note
      ),
    ];
  }
  all[i] = next;
  writeLocal(all);
  return all[i];
}

export async function confirmDelivery(
  id: string,
  signatureName: string,
  confirmationCode: string
): Promise<Booking | undefined> {
  const saved = await apiJson<{ booking: Booking }>(`/api/bookings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      confirmationCode,
      patch: {
        status: "closed",
        customerConfirmedAt: new Date().toISOString(),
        customerSignatureName: signatureName.trim(),
        closedAt: new Date().toISOString(),
      },
      reason: `${signatureName.trim()} confirmed delivery with customer code.`,
      accessToken: getStoredAccessToken(id),
    }),
  });

  if (saved?.booking) {
    upsertLocal(saved.booking);
    return saved.booking;
  }

  return undefined;
}

export async function addProof(
  id: string,
  proof: PhotoProof
): Promise<Booking | undefined> {
  const saved = await apiJson<{ booking: Booking }>(`/api/bookings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, proof, accessToken: getStoredAccessToken(id) }),
  });

  if (saved?.booking) {
    upsertLocal(saved.booking);
    return saved.booking;
  }

  if (!canUseLocalFallback()) return undefined;

  const all = readLocal();
  const i = all.findIndex((b) => b.id === id);
  if (i === -1) return;
  all[i].proofs = [...all[i].proofs, proof];
  writeLocal(all);
  return all[i];
}

export async function recordClientOpsException(
  bookingId: string,
  code: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning",
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await apiJson("/api/ops-exceptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookingId, code, message, severity, metadata }),
  });
}

const LOCATION_EVENT_LABELS: Record<BookingLocationEvent["kind"], string> = {
  driver_en_route: "Driver started route",
  driver_arrived: "Driver arrived",
  seal_proof: "Seal proof captured",
  airport_release: "Airport release captured",
  airline_handoff: "Airline handoff captured",
  delivery_proof: "Delivery proof captured",
};

export function createLocationEvent(
  kind: BookingLocationEvent["kind"],
  location: NonNullable<PhotoProof["location"]>,
  actorName?: string,
  note?: string
): BookingLocationEvent {
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

export async function approveProof(
  id: string,
  proofIndex: number,
  approvedBy?: string
): Promise<Booking | undefined> {
  const current = await getBooking(id);
  if (!current || !current.proofs[proofIndex]) return;

  const proofs = current.proofs.map((proof, index) =>
    index === proofIndex
      ? {
          ...proof,
          approvedAt: new Date().toISOString(),
          approvedBy,
        }
      : proof
  );

  return updateBooking(id, { proofs });
}

export function clearLocalBookings() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  notifyBookingsChanged();
}

export function subscribe(cb: () => void | Promise<void>): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Quote Request Received",
  paid: "Confirmed — Coordination Started",
  assigned: "Driver Assigned",
  accepted: "Driver Accepted",
  en_route: "Driver En Route",
  arrived: "Driver Arrived",
  picked_up: "Bags Picked Up",
  in_transit: "Airline Accepted / In Transit",
  delivery_pending: "Delivery Pending Confirmation",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
  issue: "Failed / Issue",
};

export function getBookingStatusLabel(
  booking: Pick<Booking, "service" | "status">
): string {
  if (booking.status === "cancelled") return "Cancelled";
  if (booking.status === "issue") return "Failed / Issue";
  if (booking.status === "delivery_pending") return "Delivery Pending Confirmation";
  if (booking.status === "closed") return "Closed";

  if (booking.service === "departure") {
    if (booking.status === "accepted") return "Driver Accepted";
    if (booking.status === "en_route") return "Driver En Route";
    if (booking.status === "arrived") return "Driver Arrived";
    if (booking.status === "picked_up") return "Seal Awaiting Approval";
    if (booking.status === "in_transit") return "Airline Handoff Pending";
    if (booking.status === "delivered") return "Accepted by Airline";
  }

  if (booking.service === "arrival") {
    if (booking.status === "assigned") return "Airport Release Assigned";
    if (booking.status === "accepted") return "Driver Accepted";
    if (booking.status === "en_route") return "Driver En Route";
    if (booking.status === "arrived") return "Driver Arrived";
    if (booking.status === "picked_up") return "Airport Release Captured";
    if (booking.status === "in_transit") return "Out for Delivery";
    if (booking.status === "delivered") return "Delivered to Customer";
  }

  if (booking.service === "both") {
    if (booking.status === "accepted") return "Driver Accepted";
    if (booking.status === "en_route") return "Driver En Route";
    if (booking.status === "arrived") return "Driver Arrived";
    if (booking.status === "picked_up") return "Seal Awaiting Approval";
    if (booking.status === "in_transit") return "Airport Handoff Complete";
  }

  return STATUS_LABELS[booking.status];
}

export const STATUS_ORDER: BookingStatus[] = [
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
];

export const TERMINAL_STATUSES: BookingStatus[] = ["delivered", "closed", "cancelled", "issue"];

export function statusIndex(s: BookingStatus): number {
  return STATUS_ORDER.indexOf(s);
}

export const SERVICE_LABELS: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};
