export type IdentityVerificationStatus =
  | "pending"
  | "verified"
  | "manual_review"
  | "expired";

export type IdentityLivenessStatus =
  | "pending"
  | "passed"
  | "failed"
  | "manual_review";

export type StripeIdentityEventType =
  | "identity.verification_session.verified"
  | "identity.verification_session.requires_input"
  | "identity.verification_session.canceled";

export type IdentityVerdict = {
  status: IdentityVerificationStatus;
  livenessStatus: IdentityLivenessStatus;
};

export function providerIdentityVerdict(
  eventType: StripeIdentityEventType,
): IdentityVerdict {
  if (eventType === "identity.verification_session.verified") {
    return { status: "verified", livenessStatus: "passed" };
  }
  if (eventType === "identity.verification_session.requires_input") {
    return { status: "manual_review", livenessStatus: "failed" };
  }
  return { status: "expired", livenessStatus: "manual_review" };
}

export function expectedDobMatch(
  expectedDob: string | undefined,
  providerVerifiedDob: string | undefined,
) {
  if (!expectedDob) return null;
  return Boolean(providerVerifiedDob && expectedDob === providerVerifiedDob);
}

export function requireVerifiedIdentityGate(
  verdict: IdentityVerdict,
  gatePassed: boolean,
): IdentityVerdict {
  if (verdict.status !== "verified" || gatePassed) return verdict;
  return { status: "manual_review", livenessStatus: "manual_review" };
}

export function verifiedIdentityProfileComplete(profile: {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}) {
  const firstName = profile.firstName?.trim();
  const lastName = profile.lastName?.trim();
  const dateOfBirth = profile.dateOfBirth?.trim();
  if (!firstName || !lastName || !dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return false;
  }
  const parsed = new Date(`${dateOfBirth}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === dateOfBirth &&
    dateOfBirth <= new Date().toISOString().slice(0, 10);
}
