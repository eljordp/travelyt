import type {
  Booking,
  BookingStatus,
  PhotoProof,
  ServiceType,
} from "@/lib/bookings";

export interface BookingRow {
  id: string;
  service: ServiceType;
  airport: string;
  address: string;
  travel_date: string;
  flight: string | null;
  bags: number;
  customer_name: string;
  email: string;
  phone: string;
  notes: string | null;
  status: BookingStatus;
  price_cents: number;
  created_at: string;
  paid_at: string | null;
  assigned_at: string | null;
  driver_name: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  proofs: PhotoProof[] | null;
  customer_access_token: string | null;
  customer_user_id: string | null;
  driver_user_id: string | null;
  source?: string | null;
}

export function rowToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    service: row.service,
    airport: row.airport,
    address: row.address,
    date: row.travel_date,
    flight: row.flight ?? undefined,
    bags: row.bags,
    name: row.customer_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes ?? undefined,
    status: row.status,
    priceCents: row.price_cents,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
    driverName: row.driver_name ?? undefined,
    pickedUpAt: row.picked_up_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    proofs: Array.isArray(row.proofs) ? row.proofs : [],
    customerAccessToken: row.customer_access_token ?? undefined,
    customerUserId: row.customer_user_id ?? undefined,
    driverUserId: row.driver_user_id ?? undefined,
  };
}

export function bookingToInsert(
  booking: Booking,
  source = "quote-form"
): Omit<BookingRow, "source"> & { source: string } {
  return {
    id: booking.id,
    service: booking.service,
    airport: booking.airport,
    address: booking.address,
    travel_date: booking.date,
    flight: booking.flight ?? null,
    bags: booking.bags,
    customer_name: booking.name,
    email: booking.email,
    phone: booking.phone,
    notes: booking.notes ?? null,
    status: booking.status,
    price_cents: booking.priceCents,
    created_at: booking.createdAt,
    paid_at: booking.paidAt ?? null,
    assigned_at: booking.assignedAt ?? null,
    driver_name: booking.driverName ?? null,
    picked_up_at: booking.pickedUpAt ?? null,
    delivered_at: booking.deliveredAt ?? null,
    proofs: booking.proofs,
    customer_access_token:
      booking.customerAccessToken ??
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8),
    customer_user_id: booking.customerUserId ?? null,
    driver_user_id: booking.driverUserId ?? null,
    source,
  };
}

export function bookingPatchToRowPatch(patch: Partial<Booking>) {
  const row: Record<string, unknown> = {};
  if (patch.service !== undefined) row.service = patch.service;
  if (patch.airport !== undefined) row.airport = patch.airport;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.date !== undefined) row.travel_date = patch.date;
  if (patch.flight !== undefined) row.flight = patch.flight ?? null;
  if (patch.bags !== undefined) row.bags = patch.bags;
  if (patch.name !== undefined) row.customer_name = patch.name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priceCents !== undefined) row.price_cents = patch.priceCents;
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt;
  if (patch.paidAt !== undefined) row.paid_at = patch.paidAt ?? null;
  if (patch.assignedAt !== undefined) row.assigned_at = patch.assignedAt ?? null;
  if (patch.driverName !== undefined) row.driver_name = patch.driverName ?? null;
  if (patch.pickedUpAt !== undefined) row.picked_up_at = patch.pickedUpAt ?? null;
  if (patch.deliveredAt !== undefined) row.delivered_at = patch.deliveredAt ?? null;
  if (patch.proofs !== undefined) row.proofs = patch.proofs;
  if (patch.customerAccessToken !== undefined) {
    row.customer_access_token = patch.customerAccessToken ?? null;
  }
  if (patch.customerUserId !== undefined) {
    row.customer_user_id = patch.customerUserId ?? null;
  }
  if (patch.driverUserId !== undefined) {
    row.driver_user_id = patch.driverUserId ?? null;
  }
  return row;
}
