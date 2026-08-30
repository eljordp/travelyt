import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSiteUrl,
  getStripeForLivemode,
} from "@/lib/stripe-server";
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
  idempotencyKey?: string;
  stripeLivemode: boolean;
}) {
  const stripe = getStripeForLivemode(input.stripeLivemode);
  if (!stripe) throw new Error("Stripe Identity is not configured.");
  const operationalMode = input.stripeLivemode ? "live" : "rehearsal";

  const allowedTypes: Array<"driving_license" | "id_card" | "passport"> =
    input.documentType === "passport"
      ? ["passport"]
      : input.documentType === "driver_license"
        ? ["driving_license"]
        : ["driving_license", "id_card", "passport"];

  const session = await stripe.identity.verificationSessions.create({
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
      operationalMode,
    },
  }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);
  return session;
}

type IdentitySessionBindFields = {
  provider?: string;
  document_type?: string;
  consent_at?: string;
  consent_version?: string;
  consent_signature_name?: string;
  consent_scope?: Record<string, unknown>;
  consent_ip_hash?: string;
  consent_user_agent_hash?: string;
  status?: string;
  liveness_status?: string;
};

export async function createBoundStripeIdentitySession(input: {
  supabase: SupabaseClient;
  verificationId: string;
  userId: string;
  email?: string;
  phone?: string;
  role: string;
  documentType: "driver_license" | "passport" | "employee_badge" | "other";
  request: Request;
  returnPath?: string;
  bindMetadata?: Record<string, unknown>;
  bindFields?: IdentitySessionBindFields;
}) {
  // The verification UUID is also the durable attempt token. Retries use the
  // same Stripe idempotency key and can never create a second orphan session
  // after an ambiguous provider timeout.
  const claimToken = input.verificationId;
  const { data: protectedAttempt, error: protectedAttemptError } = await input.supabase
    .from("identity_verifications")
    .select("metadata, provider_session_claim_livemode")
    .eq("id", input.verificationId)
    .maybeSingle<{
      metadata: Record<string, unknown> | null;
      provider_session_claim_livemode: boolean | null;
    }>();
  if (protectedAttemptError || !protectedAttempt) {
    throw new Error("Identity verification could not load its protected provider mode.");
  }
  const metadataLivemode = protectedAttempt.metadata?.stripe_livemode;
  const stripeLivemode = typeof protectedAttempt.provider_session_claim_livemode === "boolean"
    ? protectedAttempt.provider_session_claim_livemode
    : typeof metadataLivemode === "boolean"
      ? metadataLivemode
      : null;
  if (stripeLivemode === null) {
    throw new Error("Identity verification is missing its protected provider mode.");
  }
  const { data: claimed, error: claimError } = await input.supabase.rpc(
    "claim_identity_provider_session_creation",
    {
      p_identity_id: input.verificationId,
      p_claim_token: claimToken,
      p_stripe_livemode: stripeLivemode,
    },
  );
  if (claimError || claimed !== true) {
    throw new Error(
      claimError?.message ||
      "Identity verification could not be safely claimed for provider launch.",
    );
  }

  let session: Stripe.Identity.VerificationSession | null = null;
  try {
    session = await createStripeIdentitySession({
      ...input,
      stripeLivemode,
      idempotencyKey: `travelyt-identity-create:${input.verificationId}`,
    });
    if (session.livemode !== stripeLivemode) {
      throw new Error("Stripe Identity operating mode did not match Travelyt.");
    }
    if (!session.url) {
      throw new Error("Stripe Identity did not return a verification URL.");
    }
    const { data: bound, error: bindError } = await input.supabase.rpc(
      "finalize_identity_provider_session_creation",
      {
        p_identity_id: input.verificationId,
        p_claim_token: claimToken,
        p_provider_session_id: session.id,
        p_metadata: input.bindMetadata ?? {},
        p_identity_fields: input.bindFields ?? {},
      },
    );
    if (bindError || bound !== true) {
      const { data: reconciled, error: reconcileError } = await input.supabase
        .from("identity_verifications")
        .select("provider_session_id, provider_session_claim_token")
        .eq("id", input.verificationId)
        .maybeSingle<{
          provider_session_id: string | null;
          provider_session_claim_token: string | null;
        }>();
      if (
        !reconcileError &&
        reconciled?.provider_session_id === session.id &&
        reconciled.provider_session_claim_token === null
      ) {
        return session;
      }
      throw new Error(bindError?.message ||
        "Stripe Identity session could not be bound to its protected Travelyt record.");
    }
    return session;
  } catch (error) {
    if (session) {
      const { data: quarantined, error: quarantineError } = await input.supabase.rpc(
        "quarantine_identity_provider_session_creation",
        {
          p_identity_id: input.verificationId,
          p_claim_token: claimToken,
          p_provider_session_id: session.id,
          p_error: error instanceof Error ? error.message : "Provider launch failed.",
        },
      );
      if (quarantineError || quarantined !== true) {
        console.error(
          "Stripe Identity session remains protected by its durable creation claim",
          quarantineError,
        );
      }
    } else {
      const { data: markedUnknown, error: markUnknownError } = await input.supabase.rpc(
        "mark_identity_provider_session_creation_unknown",
        {
          p_identity_id: input.verificationId,
          p_claim_token: claimToken,
          p_error: error instanceof Error ? error.message : "Provider launch outcome is unknown.",
        },
      );
      if (markUnknownError || markedUnknown !== true) {
        console.error(
          "Stripe Identity creation outcome remains protected by its durable claim",
          markUnknownError,
        );
      }
    }
    // Never release an ambiguous provider call. A retry uses the same durable
    // claim and Stripe idempotency key; a known session is quarantined into the
    // retention worker instead of being forgotten.
    throw error;
  }
}
