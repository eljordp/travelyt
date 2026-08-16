import type Stripe from "stripe";
import { getSiteUrl, getStripe } from "@/lib/stripe-server";

export const STRIPE_IDENTITY_PROVIDER = "stripe_identity";

export function verifiedDob(session: Stripe.Identity.VerificationSession) {
  const dob = session.verified_outputs?.dob;
  if (!dob?.year || !dob.month || !dob.day) return undefined;
  return [dob.year, String(dob.month).padStart(2, "0"), String(dob.day).padStart(2, "0")].join("-");
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
