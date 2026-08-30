import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { emailDeliveryReadiness } from "@/lib/transactional-email";

export async function GET(request: Request) {
  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Admin access is required." }, { status: 401 });
  }

  const email = emailDeliveryReadiness();
  const phoneOtpEnabled = process.env.NEXT_PUBLIC_SUPABASE_PHONE_OTP_ENABLED === "true";
  const supabase = getSupabaseAdmin();
  let latestPaymentEmailSentAt: string | null = null;
  if (supabase) {
    const { data, error } = await supabase
      .from("booking_payment_receipts")
      .select("sent_at")
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ sent_at: string }>();
    if (error) {
      console.error("Could not load durable email delivery proof", error);
    } else {
      latestPaymentEmailSentAt = data?.sent_at ?? null;
    }
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
      provider: "supabase_auth",
      applicationEnabled: phoneOtpEnabled,
      dashboardProviderMustBeVerified: true,
      deliveryTested: false,
    },
    note: "Configuration is not delivery proof. Mark delivery tested only after a real provider receipt and OTP completion.",
  });
}
