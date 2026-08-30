import type Stripe from "stripe";
import { getSiteUrl, getStripe } from "@/lib/stripe-server";

export const STRIPE_IDENTITY_PROVIDER = "stripe_identity";

export function verifiedIdentityProfile(session: Stripe.Identity.VerificationSession) {
  const dob = session.verified_outputs?.dob;
  const dateOfBirth = dob?.year && dob.month && dob.day
    ? [dob.year, String(dob.month).padStart(2, "0"), String(dob.day).padStart(2, "0")].join("-")
    : undefined;
  return {
    firstName: session.verified_outputs?.first_name?.trim() || undefined,
    lastName: session.verified_outputs?.last_name?.trim() || undefined,
    dateOfBirth,
  };
}

export function verifiedDob(session: Stripe.Identity.VerificationSession) {
  return verifiedIdentityProfile(session).dateOfBirth;
}

function normalizedIdentityName(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function accountHolderNameMatchesVerifiedIdentity(input: {
  accountHolderName: string;
  verifiedFirstName?: string;
  verifiedLastName?: string;
}) {
  const candidate = normalizedIdentityName(input.accountHolderName);
  const first = normalizedIdentityName(input.verifiedFirstName);
  const last = normalizedIdentityName(input.verifiedLastName);
  if (!candidate || !first || !last) return false;
  return candidate === `${first} ${last}` ||
    (candidate.startsWith(`${first} `) && candidate.endsWith(` ${last}`));
}

export async function createStripeIdentitySession(input: {
  verificationId: string;
  userId: string;
  email?: string;
  phone?: string;
  role: string;
  documentType: "driver_license" | "passport" | "employee_badge" | "other";
  request: Request;
  returnPath?: string;
}) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe Identity is not configured.");

  const allowedTypes: Array<"driving_license" | "id_card" | "passport"> =
    input.documentType === "passport"
      ? ["passport"]
      : input.documentType === "driver_license"
        ? ["driving_license"]
        : ["driving_license", "id_card", "passport"];

  return stripe.identity.verificationSessions.create({
    type: "document",
    client_reference_id: input.verificationId,
    return_url: `${getSiteUrl(input.request)}${input.returnPath || "/profile?identity=return"}`,
    provided_details: {
      email: input.email,
      phone: input.phone,
    },
    options: {
      document: {
        allowed_types: allowedTypes,
        require_live_capture: true,
        require_matching_selfie: true,
      },
    },
    metadata: {
      travelyt_verification_id: input.verificationId,
      travelyt_subject_id: input.userId,
      travelyt_role: input.role,
    },
  });
}
