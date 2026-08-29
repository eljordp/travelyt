import type {
  PilotEligibilitySnapshot,
  PilotEligibilityStatus,
} from "@/lib/bookings";

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
