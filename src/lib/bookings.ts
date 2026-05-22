"use client";

import {
  calcPriceBreakdown,
  calcPriceCents,
} from "@/lib/pricing";

export { calcPriceBreakdown, calcPriceCents };

export type BookingStatus =
  | "pending"
  | "paid"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered";

export type ServiceType = "departure" | "arrival" | "both";

export interface PhotoProof {
  kind: "pickup" | "delivery";
  dataUrl: string;
  timestamp: string;
  driverName?: string;
  note?: string;
}

export interface Booking {
  id: string;
  service: ServiceType;
  airport: string;
  address: string;
  date: string;
  flight?: string;
  bags: number;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  status: BookingStatus;
  priceCents: number;
  promoCode?: string;
  discountCents?: number;
  createdAt: string;
  paidAt?: string;
  assignedAt?: string;
  driverName?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  proofs: PhotoProof[];
  customerAccessToken?: string;
  customerUserId?: string;
  driverUserId?: string;
}

const KEY = "travelyt:bookings";
const EVENT = "travelyt:bookings-updated";
const DRIVER_CODE_KEY = "travelyt:driver-code";
const ACCESS_PREFIX = "travelyt:booking-access:";

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
  return headers;
}

function getStoredAccessToken(id: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${ACCESS_PREFIX}${id}`);
}

function storeAccessToken(booking: Booking) {
  if (typeof window === "undefined" || !booking.customerAccessToken) return;
  localStorage.setItem(
    `${ACCESS_PREFIX}${booking.id}`,
    booking.customerAccessToken
  );
}

export function getDriverAccessCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DRIVER_CODE_KEY);
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

function writeLocal(rows: Booking[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(rows));
  notifyBookingsChanged();
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
  try {
    const headers = {
      ...(await authHeaders()),
      ...(init?.headers as Record<string, string> | undefined),
    };
    const res = await fetch(input, { ...init, headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function upsertLocal(booking: Booking) {
  const all = readLocal();
  const i = all.findIndex((b) => b.id === booking.id);
  if (i === -1) all.push(booking);
  else all[i] = booking;
  storeAccessToken(booking);
  writeLocal(all);
}

export async function getBookings(): Promise<Booking[]> {
  const data = await apiJson<{ bookings: Booking[] }>("/api/bookings");
  if (data?.bookings) {
    data.bookings.forEach(upsertLocal);
    return sorted(data.bookings);
  }
  return sorted(readLocal());
}

export async function getBooking(id: string): Promise<Booking | undefined> {
  const accessToken = getStoredAccessToken(id);
  const qs = new URLSearchParams({ id });
  if (accessToken) qs.set("accessToken", accessToken);
  const data = await apiJson<{ booking: Booking | null }>(
    `/api/bookings?${qs.toString()}`
  );
  if (data?.booking) {
    upsertLocal(data.booking);
    return data.booking;
  }
  return readLocal().find((b) => b.id === id);
}

export const PROMO_CODES: Record<string, { percentOff: number; label: string }> = {
  TRAVELYT30: { percentOff: 30, label: "Launch offer — 30% off" },
};

export function normalizePromoCode(input?: string | null): string | undefined {
  if (!input) return undefined;
  const code = input.trim().toUpperCase();
  return PROMO_CODES[code] ? code : undefined;
}

export function getPromoDiscountCents(
  subtotalCents: number,
  code?: string | null
): number {
  const normalized = normalizePromoCode(code);
  if (!normalized) return 0;
  const promo = PROMO_CODES[normalized];
  return Math.round((subtotalCents * promo.percentOff) / 100);
}

export async function createBooking(
  data: Omit<
    Booking,
    "id" | "status" | "createdAt" | "proofs" | "priceCents" | "discountCents"
  > & { promoCode?: string; expressPickup?: boolean }
): Promise<Booking> {
  const { expressPickup, ...bookingData } = data;
  const subtotal = calcPriceCents(data.bags, data.service, expressPickup);
  const promoCode = normalizePromoCode(data.promoCode);
  const discountCents = getPromoDiscountCents(subtotal, promoCode);
  const notes = [
    expressPickup ? "Express pickup requested." : "",
    bookingData.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const booking: Booking = {
    ...bookingData,
    notes: notes || undefined,
    promoCode,
    discountCents: discountCents || undefined,
    id: `TVT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    status: "pending",
    priceCents: subtotal - discountCents,
    proofs: [],
    createdAt: new Date().toISOString(),
  };

  const saved = await apiJson<{ booking: Booking }>("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...booking,
      accessToken: getStoredAccessToken(booking.id),
      source: "quote-form",
    }),
  });

  upsertLocal(saved?.booking ?? booking);
  return saved?.booking ?? booking;
}

export async function updateBooking(
  id: string,
  patch: Partial<Booking>
): Promise<Booking | undefined> {
  const saved = await apiJson<{ booking: Booking }>(`/api/bookings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, patch, accessToken: getStoredAccessToken(id) }),
  });

  if (saved?.booking) {
    upsertLocal(saved.booking);
    return saved.booking;
  }

  const all = readLocal();
  const i = all.findIndex((b) => b.id === id);
  if (i === -1) return;
  all[i] = { ...all[i], ...patch };
  writeLocal(all);
  return all[i];
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

  const all = readLocal();
  const i = all.findIndex((b) => b.id === id);
  if (i === -1) return;
  all[i].proofs = [...all[i].proofs, proof];
  writeLocal(all);
  return all[i];
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
  pending: "Awaiting Payment",
  paid: "Confirmed — Awaiting Driver",
  assigned: "Driver Assigned",
  picked_up: "Bags Picked Up",
  in_transit: "In Transit",
  delivered: "Delivered",
};

export const STATUS_ORDER: BookingStatus[] = [
  "pending",
  "paid",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
];

export function statusIndex(s: BookingStatus): number {
  return STATUS_ORDER.indexOf(s);
}

export const SERVICE_LABELS: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};
