import type Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  buildPaymentConfirmationEmail,
  type PaymentConfirmationBooking,
} from "@/lib/payment-confirmation-copy";
import {
  sendTransactionalEmail,
  type TransactionalEmailResult,
} from "@/lib/transactional-email";

function deliveryPatch(result: TransactionalEmailResult, now = new Date()) {
  if (result.status === "sent") {
    return {
      status: "sent",
      sent_at: now.toISOString(),
      next_attempt_at: null,
      provider_message_id: result.providerMessageId ?? null,
      provider_status: null,
      last_error: null,
    };
  }
  if (result.status === "not_configured") {
    return {
      status: "not_configured",
      sent_at: null,
      next_attempt_at: new Date(now.getTime() + 60 * 60_000).toISOString(),
      provider_message_id: null,
      provider_status: null,
      last_error: "Transactional email is not configured.",
    };
  }
  return {
    status: "failed",
    sent_at: null,
    next_attempt_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
    provider_message_id: null,
    provider_status: result.providerStatus ?? null,
    last_error: "Transactional email provider rejected or did not complete the send.",
  };
}

export async function sendBookingPaymentConfirmation(input: {
  booking: PaymentConfirmationBooking;
  session: Stripe.Checkout.Session;
  siteUrl: string;
}) {
  const sessionBookingId =
    input.session.metadata?.bookingId || input.session.client_reference_id;
  if (
    input.session.payment_status !== "paid" ||
    sessionBookingId !== input.booking.id ||
    typeof input.session.amount_total !== "number"
  ) {
    return { status: "not_paid" as const };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: claimToken, error: claimError } = await supabase.rpc(
    "claim_booking_payment_receipt",
    {
      p_booking_id: input.booking.id,
      p_stripe_checkout_session_id: input.session.id,
      p_recipient_email: input.booking.email,
      p_amount_cents: input.session.amount_total,
      p_currency: input.session.currency || "usd",
      p_livemode: input.session.livemode,
    }
  );
  if (claimError) throw claimError;
  if (typeof claimToken !== "string" || !claimToken) {
    return { status: "already_claimed" as const };
  }

  const email = buildPaymentConfirmationEmail({
    booking: input.booking,
    amountCents: input.session.amount_total,
    currency: input.session.currency || "usd",
    livemode: input.session.livemode,
  }, input.siteUrl);
  const result = await sendTransactionalEmail({
    to: input.booking.email,
    subject: email.subject,
    text: email.text,
    idempotencyKey: `payment-confirmation:${input.booking.id}`,
  });
  const patch = deliveryPatch(result);
  const { error: updateError } = await supabase
    .from("booking_payment_receipts")
    .update({
      ...patch,
      claim_token: null,
      claimed_at: null,
    })
    .eq("booking_id", input.booking.id)
    .eq("stripe_checkout_session_id", input.session.id)
    .eq("claim_token", claimToken)
    .eq("status", "sending");
  if (updateError) throw updateError;

  return result;
}
