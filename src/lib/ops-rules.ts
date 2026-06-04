import type { Booking } from "@/lib/bookings";

export type SlaAlert = {
  code: string;
  severity: "warning" | "critical";
  label: string;
  detail: string;
  minutesLate: number;
};

const MINUTE = 60 * 1000;

function minutesSince(value?: string, now = new Date()) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((now.getTime() - parsed) / MINUTE));
}

function alertIfLate(
  alerts: SlaAlert[],
  elapsed: number,
  limit: number,
  code: string,
  label: string,
  detail: string
) {
  if (elapsed <= limit) return;
  alerts.push({
    code,
    severity: elapsed >= limit * 2 ? "critical" : "warning",
    label,
    detail,
    minutesLate: elapsed - limit,
  });
}

export function getSlaAlerts(booking: Booking, now = new Date()): SlaAlert[] {
  const alerts: SlaAlert[] = [];

  if (booking.status === "paid") {
    alertIfLate(
      alerts,
      minutesSince(booking.paidAt || booking.createdAt, now),
      10,
      "AWAITING_DRIVER_ASSIGNMENT",
      "Awaiting driver assignment",
      "Confirmed booking has not been assigned to a driver."
    );
  }

  if (booking.status === "assigned") {
    alertIfLate(
      alerts,
      minutesSince(booking.assignedAt || booking.paidAt || booking.createdAt, now),
      10,
      "AWAITING_DRIVER_ACCEPTANCE",
      "Awaiting driver acceptance",
      "Driver has not accepted the assigned job."
    );
  }

  if (booking.status === "accepted") {
    alertIfLate(
      alerts,
      minutesSince(booking.acceptedAt || booking.assignedAt || booking.createdAt, now),
      15,
      "AWAITING_ROUTE_START",
      "Awaiting route start",
      "Driver accepted but has not started route."
    );
  }

  if (booking.status === "en_route") {
    alertIfLate(
      alerts,
      minutesSince(booking.enRouteAt || booking.acceptedAt || booking.createdAt, now),
      45,
      "AWAITING_ARRIVAL",
      "Awaiting arrival",
      "Driver is en route but has not marked arrival."
    );
  }

  if (booking.status === "arrived") {
    alertIfLate(
      alerts,
      minutesSince(booking.arrivedAt || booking.enRouteAt || booking.createdAt, now),
      30,
      "AWAITING_CUSTODY_START",
      "Awaiting custody start",
      "Driver arrived but custody proof has not been completed."
    );
  }

  if (booking.status === "picked_up") {
    alertIfLate(
      alerts,
      minutesSince(booking.pickedUpAt || booking.arrivedAt || booking.createdAt, now),
      20,
      "AWAITING_SEAL_APPROVAL_OR_HANDOFF",
      "Awaiting next custody step",
      "Bags are picked up but the next proof or seal approval has not cleared."
    );
  }

  if (booking.status === "in_transit") {
    alertIfLate(
      alerts,
      minutesSince(booking.pickedUpAt || booking.arrivedAt || booking.createdAt, now),
      240,
      "IN_CUSTODY_TOO_LONG",
      "In custody too long",
      "Booking has been in custody longer than the pilot SLA."
    );
  }

  if (booking.status === "delivery_pending") {
    alertIfLate(
      alerts,
      minutesSince(booking.deliveryPendingAt || booking.createdAt, now),
      30,
      "AWAITING_CUSTOMER_CONFIRMATION",
      "Awaiting customer confirmation",
      "Driver submitted delivery proof but customer has not confirmed receipt."
    );
  }

  return alerts;
}

export function latestLocationEvent(booking: Booking) {
  const events = booking.locationEvents ?? [];
  return [...events].sort(
    (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)
  )[0];
}
