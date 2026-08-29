import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { emailDeliveryReadiness } from "@/lib/transactional-email";

export async function GET(request: Request) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Admin access is required." }, { status: 401 });
  }

  const email = emailDeliveryReadiness();
  const phoneOtpEnabled = process.env.NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED === "true";

  return NextResponse.json({
    ok: true,
    email: {
      provider: email.provider,
      configured: email.apiKeyConfigured && email.fromAddressConfigured,
      apiKeyConfigured: email.apiKeyConfigured,
      fromAddressConfigured: email.fromAddressConfigured,
      deliveryTested: false,
    },
    sms: {
      provider: "supabase_auth",
      applicationEnabled: phoneOtpEnabled,
      dashboardProviderMustBeVerified: true,
      deliveryTested: false,
    },
    note: "Configuration is not delivery proof. Mark delivery tested only after a real provider receipt and OTP completion.",
  });
}
