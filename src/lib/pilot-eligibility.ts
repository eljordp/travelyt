import type {
  Booking,
  PilotEligibilitySnapshot,
  PilotEligibilityStatus,
} from "./bookings.ts";
import { validateFlightCutoff } from "./booking-time.ts";
import { passengerManifestCustodyBlockers } from "./passengers.ts";
import {
  ORD_PILOT_AIRPORT,
  ORD_PILOT_ROUTE_BOUNDARY_MILES,
} from "./service-rules.ts";

export const PILOT_APPROVAL_WINDOW_MINUTES = 24 * 60;

export const PILOT_ELIGIBILITY_LABELS: Record<PilotEligibilityStatus, string> = {
  pending: "Eligibility review pending",
  approved: "Pilot approved",
  waitlisted: "Pilot waitlist",
  declined: "Not eligible for this pilot",
  expired: "Pilot approval expired",
};

export const REQUIRED_PILOT_CHECKS = [
  "eligibleFlight",
  "eligibleTraveler",
  "routeWithinPilotArea",
  "noticeSatisfied",
  "capacityConfirmed",
] as const;

export function missingPilotChecks(snapshot: PilotEligibilitySnapshot) {
  return REQUIRED_PILOT_CHECKS.filter((key) => snapshot[key] !== true);
}

export function requiresConfirmedOffHoursPlan(
  service: Booking["service"],
  flightTime?: string,
) {
  const match = /^(\d{2}):(\d{2})$/.exec(flightTime?.trim() ?? "");
  if (!match) return true;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return true;
  void service;
  return false;
}

export function derivePilotEligibilitySnapshot(
  booking: Pick<
    Booking,
    | "airport"
    | "service"
    | "flight"
    | "flightTime"
    | "date"
    | "distanceMiles"
    | "customerIdentityVerifiedAt"
    | "restrictedItemsAttestedAt"
    | "consentToSearchAt"
    | "consentToSearchVersion"
    | "passengers"
  >,
  options: {
    capacityConfirmed?: boolean;
    identityEvidenceCurrent?: boolean;
    now?: Date;
  } = {},
): PilotEligibilitySnapshot {
  const airport = booking.airport.trim().toUpperCase();
  const distanceMiles = booking.distanceMiles;
  const identityReady = options.identityEvidenceCurrent ??
    Boolean(booking.customerIdentityVerifiedAt);
  const travelerBlockers = passengerManifestCustodyBlockers(
    booking.passengers,
    identityReady,
  );
  const offHoursPlanRequired = requiresConfirmedOffHoursPlan(
    booking.service,
    booking.flightTime,
  );

  return {
    eligibleFlight: Boolean(
      booking.flight?.trim() &&
        booking.flightTime?.trim() &&
        booking.date?.trim(),
    ),
    eligibleTraveler:
      identityReady &&
      Boolean(booking.restrictedItemsAttestedAt) &&
      Boolean(
        booking.consentToSearchAt &&
        booking.consentToSearchVersion === "2026-08-30"
      ) &&
      travelerBlockers.length === 0,
    routeWithinPilotArea:
      airport === ORD_PILOT_AIRPORT &&
      typeof distanceMiles === "number" &&
      Number.isFinite(distanceMiles) &&
      distanceMiles >= 0 &&
      distanceMiles <= ORD_PILOT_ROUTE_BOUNDARY_MILES,
    noticeSatisfied:
      !validateFlightCutoff(
        booking.date,
        booking.flightTime,
        booking.service,
        distanceMiles,
        airport,
        options.now ?? new Date(),
      ),
    capacityConfirmed: options.capacityConfirmed === true,
    airport,
    service: booking.service,
    operatingWindowMode: offHoursPlanRequired
      ? options.capacityConfirmed === true
        ? "confirmed_off_hours"
        : "requires_off_hours_plan"
      : "standard",
  };
}

export function checkoutEligibilityBlocker(
  input: {
    status?: PilotEligibilityStatus | null;
    expiresAt?: string | null;
  },
  now = new Date()
): string | null {
  switch (input.status ?? "pending") {
    case "pending":
      return "This request is still under pilot eligibility review. No payment has been requested.";
    case "waitlisted":
      return "This request is waitlisted and has not been approved for payment. No charge has been made.";
    case "declined":
      return "This request was not approved for the pilot. No charge has been made.";
    case "expired":
      return "This request's pilot approval expired. No new charge has been made; request another review.";
    case "approved": {
      const expiresAt = input.expiresAt ? Date.parse(input.expiresAt) : Number.NaN;
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
        return "This request's pilot approval is missing or expired. No new charge has been made; request another review.";
      }
      return null;
    }
  }
}

export function pilotEligibilityMessage(
  status: PilotEligibilityStatus,
  expiresAt?: string
) {
  if (status === "approved") {
    return expiresAt
      ? `Eligibility approved. Secure checkout is available until ${new Date(expiresAt).toLocaleString()}.`
      : "Eligibility approval is incomplete. Checkout remains locked.";
  }
  return checkoutEligibilityBlocker({ status, expiresAt }) ?? "";
}
