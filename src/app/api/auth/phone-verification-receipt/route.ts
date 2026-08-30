import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildPhoneVerificationProof,
  phoneOtpProviderConfiguration,
} from "@/lib/phone-verification-proof";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const limited = rateLimit(request, "auth:phone-verification-receipt", 10);
  if (limited) return limited;

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Verified account session required." },
      { status: 401 },
    );
  }

  const proofSecret = process.env.TRAVELYT_CONSENT_HASH_SECRET;
  const providerConfiguration = phoneOtpProviderConfiguration(
    process.env,
    proofSecret,
  );
  if (!providerConfiguration.ok) {
    console.error(
      "Phone OTP provider binding is unavailable",
      providerConfiguration.reason,
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "Phone OTP is not enabled with a bound provider configuration for this deployment.",
      },
      { status: 503 },
    );
  }

  const proof = buildPhoneVerificationProof(user, proofSecret, {
    providerConfigurationHash:
      providerConfiguration.value.provider_config_hash,
  });
  if (!proof.ok) {
    const unavailable =
      proof.reason === "secret_missing" ||
      proof.reason === "provider_config_missing" ||
      proof.reason === "provider_config_invalid";
    const stale = proof.reason === "confirmation_stale";
    let errorMessage =
      "Supabase has not confirmed a valid phone for this account.";
    if (unavailable) {
      errorMessage = "Phone-verification evidence is not configured.";
    } else if (stale) {
      errorMessage =
        "Complete a new SMS OTP check before recording delivery evidence.";
    }
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
      },
      { status: unavailable ? 503 : 409 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Phone-verification evidence is unavailable." },
      { status: 503 },
    );
  }

  const { error } = await supabase
    .from("phone_verification_receipts")
    .upsert(proof.value, { onConflict: "user_id,phone_hash" });

  if (error) {
    console.error("Could not record phone-verification evidence", error);
    return NextResponse.json(
      { ok: false, error: "Could not record phone-verification evidence." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, verifiedAt: proof.value.verified_at });
}
