import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import { getStripe } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

async function reconcileRefund(refund: Stripe.Refund, eventId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const bookingId = refund.metadata?.bookingId;
  const query = supabase.from("booking_financial_events").update({
    kind: refund.status === "succeeded" ? "refund_succeeded" : "refund_failed",
    status: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "manual_review",
    stripe_refund_id: refund.id,
  }).eq("stripe_refund_id", refund.id);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (data?.length || !bookingId) return;
  // Stripe can deliver before our request response. Store a durable event so
  // operations has a reconciliation record rather than silently dropping it.
  const { error: insertError } = await supabase.from("booking_financial_events").insert({
    booking_id: bookingId, kind: refund.status === "succeeded" ? "refund_succeeded" : "refund_failed",
    amount_cents: refund.amount, currency: refund.currency, reason: "Stripe refund webhook reconciliation.",
    idempotency_key: `stripe:${eventId}`, stripe_refund_id: refund.id,
    status: refund.status === "succeeded" ? "succeeded" : "manual_review", requested_by: "stripe_webhook",
  });
  if (insertError && !/duplicate|unique/i.test(insertError.message)) throw insertError;
}

async function reconcileDispute(dispute: Stripe.Dispute, eventId: string) {
  const bookingId = dispute.metadata?.bookingId;
  if (!bookingId) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("booking_financial_events").insert({
    booking_id: bookingId, kind: "manual_adjustment", amount_cents: dispute.amount,
    currency: dispute.currency, reason: `Stripe dispute opened: ${dispute.reason}.`,
    idempotency_key: `stripe:${eventId}`, status: "manual_review", requested_by: "stripe_webhook",
  });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return json({ ok: false, error: "Stripe webhook is not configured." }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return json({ ok: false, error: "Missing Stripe signature." }, 400);

  let event: Stripe.Event;
  const rawBody = await request.text();

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return json({ ok: false, error: "Invalid Stripe signature." }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await markBookingPaidFromCheckoutSession(
        event.data.object as Stripe.Checkout.Session
      );
    }
    if (event.type === "refund.updated") {
      await reconcileRefund(event.data.object as Stripe.Refund, event.id);
    }
    if (event.type === "charge.dispute.created") {
      await reconcileDispute(event.data.object as Stripe.Dispute, event.id);
    }

    return json({ ok: true, received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed", error);
    return json({ ok: false, error: "Webhook handler failed." }, 500);
  }
}
