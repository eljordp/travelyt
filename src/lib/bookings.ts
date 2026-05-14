"use client";

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
  createdAt: string;
  paidAt?: string;
  assignedAt?: string;
  driverName?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  proofs: PhotoProof[];
}

const KEY = "travelyt:bookings";
const EVENT = "travelyt:bookings-updated";

function read(): Booking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch {
    return [];
  }
}

function write(rows: Booking[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(EVENT));
}

export function getBookings(): Booking[] {
  return read().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getBooking(id: string): Booking | undefined {
  return read().find((b) => b.id === id);
}

export function calcPriceCents(bags: number, service: ServiceType): number {
  const base = service === "both" ? 9000 : 5500;
  const perBag = 2500;
  return base + perBag * bags;
}

export function createBooking(
  data: Omit<
    Booking,
    "id" | "status" | "createdAt" | "proofs" | "priceCents"
  >
): Booking {
  const all = read();
  const id = `TVT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const b: Booking = {
    ...data,
    id,
    status: "pending",
    priceCents: calcPriceCents(data.bags, data.service),
    proofs: [],
    createdAt: new Date().toISOString(),
  };
  all.push(b);
  write(all);
  return b;
}

export function updateBooking(
  id: string,
  patch: Partial<Booking>
): Booking | undefined {
  const all = read();
  const i = all.findIndex((b) => b.id === id);
  if (i === -1) return;
  all[i] = { ...all[i], ...patch };
  write(all);
  return all[i];
}

export function addProof(id: string, proof: PhotoProof): Booking | undefined {
  const all = read();
  const i = all.findIndex((b) => b.id === id);
  if (i === -1) return;
  all[i].proofs = [...all[i].proofs, proof];
  write(all);
  return all[i];
}

export function subscribe(cb: () => void): () => void {
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
