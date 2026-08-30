import type Stripe from "stripe";
import { rowToBooking, type BookingRow } from "@/lib/booking-mappers";
import { sendBookingPaymentConfirmation } from "@/lib/payment-confirmation-email";
import { queueBookingNotification } from "@/lib/push-notifications-server";
import { getSiteUrl } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function markBookingPaidFromCheckoutSession(
  session: Stripe.Checkout.Session
) {
  const bookingId = session.metadata?.bookingId || session.client_reference_id;
  if (!bookingId || session.payment_status !== "paid") {
    return { ok: false as const, reason: "not-paid" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");

  const paidAt = new Date().toISOString();

  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (loadError) throw loadError;
  if (!existing) throw new Error(`Booking not found for Stripe session: ${bookingId}`);

  const expectedCurrency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
  if (
    session.amount_total !== existing.price_cents ||
    session.currency?.toLowerCase() !== expectedCurrency
  ) {
    console.error("Stripe payment amount or currency mismatch", {
      bookingId,
      checkoutSessionId: session.id,
      expectedAmountCents: existing.price_cents,
      actualAmountCents: session.amount_total,
      expectedCurrency,
      actualCurrency: session.currency,
    });
    return { ok: false as const, reason: "payment-mismatch" };
  }

  const { data: checkoutState, error: checkoutStateError } = await supabase
    .from("booking_checkout_sessions")
    .select("stripe_checkout_session_id, status")
    .eq("booking_id", bookingId)
    .maybeSingle<{
      stripe_checkout_session_id: string | null;
      status: string;
    }>();
  if (checkoutStateError) throw checkoutStateError;

  if (
    checkoutState &&
    (checkoutState.status === "manual_review" ||
      checkoutState.stripe_checkout_session_id !== session.id)
  ) {
    const { error: reviewError } = await supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: bookingId,
        kind: "manual_adjustment",
        amount_cents: session.amount_total,
        currency: session.currency || expectedCurrency,
        reason:
          "Paid Stripe Checkout Session did not match the single session recorded for this booking.",
        idempotency_key: `duplicate-checkout:${session.id}`,
        status: "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
        ignoreDuplicates: true,
      });
    if (reviewError) throw reviewError;
    if (checkoutState?.status !== "manual_review") {
      const { error: stateError } = await supabase
        .from("booking_checkout_sessions")
        .update({
          status: "manual_review",
          last_error: "A different paid Checkout Session requires manual review.",
        })
        .eq("booking_id", bookingId);
      if (stateError) throw stateError;
    }
    console.error("Duplicate Stripe Checkout Session requires manual review", {
      bookingId,
      recordedCheckoutSessionId: checkoutState?.stripe_checkout_session_id,
      receivedCheckoutSessionId: session.id,
    });
    return { ok: false as const, reason: "checkout-session-mismatch" };
  }

  if (!checkoutState) {
    const { error: insertCheckoutError } = await supabase
      .from("booking_checkout_sessions")
      .insert({
        booking_id: bookingId,
        stripe_checkout_session_id: session.id,
        status: "paid",
        attempts: 1,
      });
    if (insertCheckoutError) throw insertCheckoutError;
  } else {
    const { error: updateCheckoutError } = await supabase
      .from("booking_checkout_sessions")
      .update({
        status: "paid",
        claim_token: null,
        claimed_at: null,
        last_error: null,
      })
      .eq("booking_id", bookingId)
      .eq("stripe_checkout_session_id", session.id);
    if (updateCheckoutError) throw updateCheckoutError;
  }

  const patch =
    existing.status === "pending"
      ? { status: "paid", paid_at: paidAt }
      : { paid_at: existing.paid_at || paidAt };

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .select("*")
    .single<BookingRow>();

  if (updateError) throw updateError;
  if (existing.status === "pending") {
    await queueBookingNotification(updated, "status");
  }

  const booking = rowToBooking(updated);
  await sendBookingPaymentConfirmation({
    booking,
    session,
    siteUrl: getSiteUrl(),
  });

  return { ok: true as const, booking };
}
