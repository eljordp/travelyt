import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  PHONE_DELIVERY_PROOF_MAX_AGE_MS,
  isCurrentPhoneDeliveryReceipt,
  phoneOtpProviderConfiguration,
  type PhoneDeliveryReceipt,
} from "@/lib/phone-verification-proof";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { emailDeliveryReadiness } from "@/lib/transactional-email";

export async function GET(request: Request) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Admin access is required." }, { status: 401 });
  }

  const email = emailDeliveryReadiness();
  const phoneOtpEnabled = process.env.NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED === "true";
  const phoneProviderConfiguration = phoneOtpProviderConfiguration(
    process.env,
    process.env.TRAVELYT_CONSENT_HASH_SECRET,
  );
  const supabase = getSupabaseAdmin();
  let latestPaymentEmailSentAt: string | null = null;
  let latestPhoneReceipt: PhoneDeliveryReceipt | null = null;
  let latestPhoneVerifiedAt: string | null = null;
  if (supabase) {
    const emailResult = await supabase
      .from("booking_payment_receipts")
      .select("sent_at")
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ sent_at: string }>();
    if (emailResult.error) {
      console.error("Could not load durable email delivery proof", emailResult.error);
    } else {
      latestPaymentEmailSentAt = emailResult.data?.sent_at ?? null;
    }

    if (phoneProviderConfiguration.ok) {
      const proofCutoff = new Date(
        Date.now() - PHONE_DELIVERY_PROOF_MAX_AGE_MS,
      ).toISOString();
      const phoneResult = await supabase
        .from("phone_verification_receipts")
        .select("verified_at,recorded_at,provider_config_hash")
        .eq(
          "provider_config_hash",
          phoneProviderConfiguration.value.provider_config_hash,
        )
        .gte("verified_at", proofCutoff)
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle<PhoneDeliveryReceipt>();
      if (phoneResult.error) {
        console.error("Could not load durable phone delivery proof", phoneResult.error);
      } else {
        latestPhoneReceipt = phoneResult.data ?? null;
      }
    }
  }

  const smsDeliveryTested =
    phoneOtpEnabled &&
    phoneProviderConfiguration.ok &&
    isCurrentPhoneDeliveryReceipt(
      latestPhoneReceipt,
      phoneProviderConfiguration.value.provider_config_hash,
    );
  if (smsDeliveryTested) {
    latestPhoneVerifiedAt = latestPhoneReceipt?.verified_at ?? null;
  }

  return NextResponse.json({
    ok: true,
    email: {
      provider: email.provider,
      configured: email.apiKeyConfigured && email.fromAddressConfigured,
      apiKeyConfigured: email.apiKeyConfigured,
      fromAddressConfigured: email.fromAddressConfigured,
      deliveryTested: Boolean(latestPaymentEmailSentAt),
      latestDeliveryTestedAt: latestPaymentEmailSentAt,
    },
    sms: {
      provider: phoneProviderConfiguration.ok
        ? phoneProviderConfiguration.value.provider
        : "not_configured",
      applicationEnabled: phoneOtpEnabled,
      providerConfigurationBound: phoneProviderConfiguration.ok,
      providerConfigurationStatus: phoneProviderConfiguration.ok
        ? "bound"
        : phoneProviderConfiguration.reason,
      dashboardProviderMustBeVerified: true,
      deliveryTested: smsDeliveryTested,
      latestDeliveryTestedAt: latestPhoneVerifiedAt,
      deliveryProofMaxAgeDays:
        PHONE_DELIVERY_PROOF_MAX_AGE_MS / (24 * 60 * 60 * 1000),
    },
    note: "Configuration is not delivery proof. Mark delivery tested only after a real provider receipt and OTP completion.",
  });
}
