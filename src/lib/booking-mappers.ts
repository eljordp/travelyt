import type {
  Booking,
  BookingAuditEntry,
  BookingIssueType,
  BookingLocationEvent,
  BookingStatus,
  PhotoProof,
  ServiceType,
} from "@/lib/bookings";

export const BOOKING_SELECT_COLUMNS = [
  "id",
  "service",
  "airport",
  "address",
  "travel_date",
  "flight_time",
  "flight",
  "bags",
  "customer_name",
  "email",
  "phone",
  "notes",
  "declared_value_cents",
  "coverage_election",
  "coverage_accepted_at",
  "restricted_items_attested_at",
  "customer_identity_verified_at",
  "driver_identity_verified_at",
  "status",
  "price_cents",
  "created_at",
  "paid_at",
  "assigned_at",
  "accepted_at",
  "en_route_at",
  "arrived_at",
  "driver_name",
  "picked_up_at",
  "delivery_pending_at",
  "delivered_at",
  "closed_at",
  "delivery_confirmation_code",
  "customer_confirmed_at",
  "customer_signature_name",
  "issue_type",
  "issue_notes",
  "issue_opened_at",
  "issue_resolved_at",
  "issue_resolution",
  "location_events",
  "proofs",
  "status_history",
  "archived_at",
  "archived_by",
  "external_provider",
  "external_reference",
  "external_status",
  "external_synced_at",
  "customer_access_token",
  "customer_user_id",
  "driver_user_id",
  "source",
].join(",");

export const BOOKING_LIST_SELECT_COLUMNS = BOOKING_SELECT_COLUMNS
  .split(",")
  .filter((column) => column !== "proofs")
  .join(",");

export interface BookingRow {
  id: string;
  service: ServiceType;
  airport: string;
  address: string;
  travel_date: string;
  flight_time: string | null;
  flight: string | null;
  bags: number;
  customer_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  declared_value_cents: number | null;
  coverage_election: "standard" | "declared_value" | null;
  coverage_accepted_at: string | null;
  restricted_items_attested_at: string | null;
  customer_identity_verified_at: string | null;
  driver_identity_verified_at: string | null;
  status: BookingStatus;
  price_cents: number;
  created_at: string;
  paid_at: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  driver_name: string | null;
  picked_up_at: string | null;
  delivery_pending_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  delivery_confirmation_code: string | null;
  customer_confirmed_at: string | null;
  customer_signature_name: string | null;
  issue_type: BookingIssueType | null;
  issue_notes: string | null;
  issue_opened_at: string | null;
  issue_resolved_at: string | null;
  issue_resolution: string | null;
  location_events: BookingLocationEvent[] | null;
  proofs: PhotoProof[] | null;
  status_history: BookingAuditEntry[] | null;
  archived_at?: string | null;
  archived_by?: string | null;
  external_provider?: string | null;
  external_reference?: string | null;
  external_status?: string | null;
  external_synced_at?: string | null;
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
    flightTime: row.flight_time ?? undefined,
    flight: row.flight ?? undefined,
    bags: row.bags,
    name: row.customer_name,
    email: row.email,
    phone: row.phone ?? "",
    notes: row.notes ?? undefined,
    declaredValueCents: row.declared_value_cents ?? undefined,
    coverageElection: row.coverage_election ?? undefined,
    coverageAcceptedAt: row.coverage_accepted_at ?? undefined,
    restrictedItemsAttestedAt: row.restricted_items_attested_at ?? undefined,
    customerIdentityVerifiedAt: row.customer_identity_verified_at ?? undefined,
    driverIdentityVerifiedAt: row.driver_identity_verified_at ?? undefined,
    status: row.status,
    priceCents: row.price_cents,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
    acceptedAt: row.accepted_at ?? undefined,
    enRouteAt: row.en_route_at ?? undefined,
    arrivedAt: row.arrived_at ?? undefined,
    driverName: row.driver_name ?? undefined,
    pickedUpAt: row.picked_up_at ?? undefined,
    deliveryPendingAt: row.delivery_pending_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    deliveryConfirmationCode: row.delivery_confirmation_code ?? undefined,
    customerConfirmedAt: row.customer_confirmed_at ?? undefined,
    customerSignatureName: row.customer_signature_name ?? undefined,
    issueType: row.issue_type ?? undefined,
    issueNotes: row.issue_notes ?? undefined,
    issueOpenedAt: row.issue_opened_at ?? undefined,
    issueResolvedAt: row.issue_resolved_at ?? undefined,
    issueResolution: row.issue_resolution ?? undefined,
    locationEvents: Array.isArray(row.location_events) ? row.location_events : [],
    proofs: Array.isArray(row.proofs) ? row.proofs : [],
    statusHistory: Array.isArray(row.status_history) ? row.status_history : [],
    archivedAt: row.archived_at ?? undefined,
    archivedBy: row.archived_by ?? undefined,
    externalProvider: row.external_provider ?? undefined,
    externalReference: row.external_reference ?? undefined,
    externalStatus: row.external_status ?? undefined,
    externalSyncedAt: row.external_synced_at ?? undefined,
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
    flight_time: booking.flightTime ?? null,
    flight: booking.flight ?? null,
    bags: booking.bags,
    customer_name: booking.name,
    email: booking.email,
    phone: booking.phone.trim() || null,
    notes: booking.notes ?? null,
    declared_value_cents: booking.declaredValueCents ?? null,
    coverage_election: booking.coverageElection ?? "standard",
    coverage_accepted_at: booking.coverageAcceptedAt ?? null,
    restricted_items_attested_at: booking.restrictedItemsAttestedAt ?? null,
    customer_identity_verified_at: booking.customerIdentityVerifiedAt ?? null,
    driver_identity_verified_at: booking.driverIdentityVerifiedAt ?? null,
    status: booking.status,
    price_cents: booking.priceCents,
    created_at: booking.createdAt,
    paid_at: booking.paidAt ?? null,
    assigned_at: booking.assignedAt ?? null,
    accepted_at: booking.acceptedAt ?? null,
    en_route_at: booking.enRouteAt ?? null,
    arrived_at: booking.arrivedAt ?? null,
    driver_name: booking.driverName ?? null,
    picked_up_at: booking.pickedUpAt ?? null,
    delivery_pending_at: booking.deliveryPendingAt ?? null,
    delivered_at: booking.deliveredAt ?? null,
    closed_at: booking.closedAt ?? null,
    delivery_confirmation_code: booking.deliveryConfirmationCode ?? null,
    customer_confirmed_at: booking.customerConfirmedAt ?? null,
    customer_signature_name: booking.customerSignatureName ?? null,
    issue_type: booking.issueType ?? null,
    issue_notes: booking.issueNotes ?? null,
    issue_opened_at: booking.issueOpenedAt ?? null,
    issue_resolved_at: booking.issueResolvedAt ?? null,
    issue_resolution: booking.issueResolution ?? null,
    location_events: booking.locationEvents ?? [],
    proofs: booking.proofs,
    status_history: booking.statusHistory ?? [],
    external_provider: booking.externalProvider ?? null,
    external_reference: booking.externalReference ?? null,
    external_status: booking.externalStatus ?? null,
    external_synced_at: booking.externalSyncedAt ?? null,
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
  if (patch.flightTime !== undefined) row.flight_time = patch.flightTime ?? null;
  if (patch.flight !== undefined) row.flight = patch.flight ?? null;
  if (patch.bags !== undefined) row.bags = patch.bags;
  if (patch.name !== undefined) row.customer_name = patch.name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  if (patch.declaredValueCents !== undefined) {
    row.declared_value_cents = patch.declaredValueCents ?? null;
  }
  if (patch.coverageElection !== undefined) {
    row.coverage_election = patch.coverageElection ?? "standard";
  }
  if (patch.coverageAcceptedAt !== undefined) {
    row.coverage_accepted_at = patch.coverageAcceptedAt ?? null;
  }
  if (patch.restrictedItemsAttestedAt !== undefined) {
    row.restricted_items_attested_at = patch.restrictedItemsAttestedAt ?? null;
  }
  if (patch.customerIdentityVerifiedAt !== undefined) {
    row.customer_identity_verified_at = patch.customerIdentityVerifiedAt ?? null;
  }
  if (patch.driverIdentityVerifiedAt !== undefined) {
    row.driver_identity_verified_at = patch.driverIdentityVerifiedAt ?? null;
  }
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priceCents !== undefined) row.price_cents = patch.priceCents;
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt;
  if (patch.paidAt !== undefined) row.paid_at = patch.paidAt ?? null;
  if (patch.assignedAt !== undefined) row.assigned_at = patch.assignedAt ?? null;
  if (patch.acceptedAt !== undefined) row.accepted_at = patch.acceptedAt ?? null;
  if (patch.enRouteAt !== undefined) row.en_route_at = patch.enRouteAt ?? null;
  if (patch.arrivedAt !== undefined) row.arrived_at = patch.arrivedAt ?? null;
  if (patch.driverName !== undefined) row.driver_name = patch.driverName ?? null;
  if (patch.pickedUpAt !== undefined) row.picked_up_at = patch.pickedUpAt ?? null;
  if (patch.deliveryPendingAt !== undefined) {
    row.delivery_pending_at = patch.deliveryPendingAt ?? null;
  }
  if (patch.deliveredAt !== undefined) row.delivered_at = patch.deliveredAt ?? null;
  if (patch.closedAt !== undefined) row.closed_at = patch.closedAt ?? null;
  if (patch.deliveryConfirmationCode !== undefined) {
    row.delivery_confirmation_code = patch.deliveryConfirmationCode ?? null;
  }
  if (patch.customerConfirmedAt !== undefined) {
    row.customer_confirmed_at = patch.customerConfirmedAt ?? null;
  }
  if (patch.customerSignatureName !== undefined) {
    row.customer_signature_name = patch.customerSignatureName ?? null;
  }
  if (patch.issueType !== undefined) row.issue_type = patch.issueType ?? null;
  if (patch.issueNotes !== undefined) row.issue_notes = patch.issueNotes ?? null;
  if (patch.issueOpenedAt !== undefined) {
    row.issue_opened_at = patch.issueOpenedAt ?? null;
  }
  if (patch.issueResolvedAt !== undefined) {
    row.issue_resolved_at = patch.issueResolvedAt ?? null;
  }
  if (patch.issueResolution !== undefined) {
    row.issue_resolution = patch.issueResolution ?? null;
  }
  if (patch.locationEvents !== undefined) {
    row.location_events = patch.locationEvents ?? [];
  }
  if (patch.proofs !== undefined) row.proofs = patch.proofs;
  if (patch.statusHistory !== undefined) row.status_history = patch.statusHistory;
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt ?? null;
  if (patch.archivedBy !== undefined) row.archived_by = patch.archivedBy ?? null;
  if (patch.externalProvider !== undefined) {
    row.external_provider = patch.externalProvider ?? null;
  }
  if (patch.externalReference !== undefined) {
    row.external_reference = patch.externalReference ?? null;
  }
  if (patch.externalStatus !== undefined) {
    row.external_status = patch.externalStatus ?? null;
  }
  if (patch.externalSyncedAt !== undefined) {
    row.external_synced_at = patch.externalSyncedAt ?? null;
  }
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
