import { createHmac } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { normalizePhone, validatePhone } from "./auth-policy.ts";

type PhoneProofUser = Pick<User, "id" | "phone" | "phone_confirmed_at">;

type PhoneOtpEnvironment = Record<string, string | undefined> & {
  NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  TRAVELYT_PHONE_OTP_PROVIDER?: string;
  TRAVELYT_PHONE_OTP_PROVIDER_CONFIG_ID?: string;
};

export const PHONE_CONFIRMATION_RECEIPT_WINDOW_MS = 10 * 60 * 1000;
export const PHONE_DELIVERY_PROOF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PHONE_CONFIRMATION_MAX_FUTURE_SKEW_MS = 60 * 1000;

export type PhoneOtpProviderConfiguration =
  | {
      ok: true;
      value: {
        provider: string;
        provider_config_hash: string;
      };
    }
  | {
      ok: false;
      reason:
        | "application_disabled"
        | "secret_missing"
        | "supabase_project_missing"
        | "supabase_project_invalid"
        | "provider_missing"
        | "provider_invalid"
        | "provider_config_id_missing"
        | "provider_config_id_invalid";
    };

export type PhoneDeliveryReceipt = {
  verified_at: string;
  recorded_at: string;
  provider_config_hash: string | null;
};

export type PhoneVerificationProof =
  | {
      ok: true;
      value: {
        user_id: string;
        phone_hash: string;
        provider: "supabase_auth";
        provider_config_hash: string;
        verified_at: string;
        recorded_at: string;
      };
    }
  | {
      ok: false;
      reason:
        | "secret_missing"
        | "phone_missing"
        | "phone_invalid"
        | "confirmation_missing"
        | "confirmation_invalid"
        | "confirmation_future"
        | "confirmation_stale"
        | "provider_config_missing"
        | "provider_config_invalid";
    };

function normalizedSupabaseProjectUrl(env: PhoneOtpEnvironment): string | null {
  const candidate = (
    env.NEXT_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_URL ??
    ""
  ).trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname) return "";
    return `${url.protocol}//${url.hostname.toLowerCase()}`;
  } catch {
    return "";
  }
}

/**
 * Builds a non-secret binding for the exact Supabase project and SMS provider
 * configuration under test. A new Twilio Verify service (or provider switch)
 * produces a new hash, so an old delivery receipt cannot certify the new path.
 */
export function phoneOtpProviderConfiguration(
  env: PhoneOtpEnvironment,
  secret: string | null | undefined,
): PhoneOtpProviderConfiguration {
  if (env.NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED !== "true") {
    return { ok: false, reason: "application_disabled" };
  }

  const proofSecret = secret?.trim();
  if (!proofSecret) return { ok: false, reason: "secret_missing" };

  const projectUrl = normalizedSupabaseProjectUrl(env);
  if (projectUrl === null) {
    return { ok: false, reason: "supabase_project_missing" };
  }
  if (!projectUrl) {
    return { ok: false, reason: "supabase_project_invalid" };
  }

  const provider = env.TRAVELYT_PHONE_OTP_PROVIDER?.trim().toLowerCase();
  if (!provider) return { ok: false, reason: "provider_missing" };
  if (!/^[a-z][a-z0-9_-]{2,63}$/.test(provider)) {
    return { ok: false, reason: "provider_invalid" };
  }

  const providerConfigId = env.TRAVELYT_PHONE_OTP_PROVIDER_CONFIG_ID?.trim();
  if (!providerConfigId) {
    return { ok: false, reason: "provider_config_id_missing" };
  }
  if (
    providerConfigId.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9:._/-]+$/.test(providerConfigId)
  ) {
    return { ok: false, reason: "provider_config_id_invalid" };
  }

  const providerConfigHash = createHmac("sha256", proofSecret)
    .update(
      JSON.stringify({
        version: 1,
        project_url: projectUrl,
        provider,
        provider_config_id: providerConfigId,
      }),
    )
    .digest("hex");

  return {
    ok: true,
    value: {
      provider,
      provider_config_hash: providerConfigHash,
    },
  };
}

export function buildPhoneVerificationProof(
  user: PhoneProofUser,
  secret: string | null | undefined,
  options: {
    providerConfigurationHash: string | null | undefined;
    now?: Date;
    confirmationWindowMs?: number;
  },
): PhoneVerificationProof {
  const proofSecret = secret?.trim();
  if (!proofSecret) return { ok: false, reason: "secret_missing" };

  const providerConfigurationHash =
    options.providerConfigurationHash?.trim();
  if (!providerConfigurationHash) {
    return { ok: false, reason: "provider_config_missing" };
  }
  if (!/^[a-f0-9]{64}$/.test(providerConfigurationHash)) {
    return { ok: false, reason: "provider_config_invalid" };
  }

  const phone = normalizePhone(user.phone ?? "");
  if (!phone) return { ok: false, reason: "phone_missing" };
  if (!phone.startsWith("+") || validatePhone(phone)) {
    return { ok: false, reason: "phone_invalid" };
  }

  const verifiedAt = user.phone_confirmed_at?.trim();
  if (!verifiedAt) return { ok: false, reason: "confirmation_missing" };
  if (!Number.isFinite(Date.parse(verifiedAt))) {
    return { ok: false, reason: "confirmation_invalid" };
  }

  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const verifiedAtMs = Date.parse(verifiedAt);
  const confirmationWindowMs =
    options.confirmationWindowMs ?? PHONE_CONFIRMATION_RECEIPT_WINDOW_MS;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(confirmationWindowMs) ||
    confirmationWindowMs <= 0
  ) {
    return { ok: false, reason: "confirmation_invalid" };
  }
  if (verifiedAtMs > nowMs + PHONE_CONFIRMATION_MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: "confirmation_future" };
  }
  if (nowMs - verifiedAtMs > confirmationWindowMs) {
    return { ok: false, reason: "confirmation_stale" };
  }

  return {
    ok: true,
    value: {
      user_id: user.id,
      phone_hash: createHmac("sha256", proofSecret)
        .update(phone)
        .digest("hex"),
      provider: "supabase_auth",
      provider_config_hash: providerConfigurationHash,
      verified_at: verifiedAt,
      recorded_at: now.toISOString(),
    },
  };
}

/**
 * Delivery evidence is current only for the provider configuration that
 * produced it, and only for a bounded operational test period.
 */
export function isCurrentPhoneDeliveryReceipt(
  receipt: PhoneDeliveryReceipt | null | undefined,
  providerConfigurationHash: string,
  options: { now?: Date; maxAgeMs?: number } = {},
): boolean {
  if (!receipt || receipt.provider_config_hash !== providerConfigurationHash) {
    return false;
  }

  const nowMs = (options.now ?? new Date()).getTime();
  const maxAgeMs = options.maxAgeMs ?? PHONE_DELIVERY_PROOF_MAX_AGE_MS;
  const verifiedAtMs = Date.parse(receipt.verified_at);
  const recordedAtMs = Date.parse(receipt.recorded_at);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0 ||
    !Number.isFinite(verifiedAtMs) ||
    !Number.isFinite(recordedAtMs)
  ) {
    return false;
  }

  if (
    verifiedAtMs > nowMs + PHONE_CONFIRMATION_MAX_FUTURE_SKEW_MS ||
    recordedAtMs > nowMs + PHONE_CONFIRMATION_MAX_FUTURE_SKEW_MS
  ) {
    return false;
  }
  if (nowMs - verifiedAtMs > maxAgeMs || nowMs - recordedAtMs > maxAgeMs) {
    return false;
  }

  // The server receipt must have been written during the OTP confirmation
  // window, not much later by replaying a historical authenticated session.
  return (
    recordedAtMs >= verifiedAtMs - PHONE_CONFIRMATION_MAX_FUTURE_SKEW_MS &&
    recordedAtMs <=
      verifiedAtMs +
        PHONE_CONFIRMATION_RECEIPT_WINDOW_MS +
        PHONE_CONFIRMATION_MAX_FUTURE_SKEW_MS
  );
}
