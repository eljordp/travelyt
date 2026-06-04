import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import { getStripe } from "@/lib/stripe-server";

export const runtime = "nodejs";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
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

    return json({ ok: true, received: true });
  } catch (error) {
    console.error("Stripe webhook handler failed", error);
    return json({ ok: false, error: "Webhook handler failed." }, 500);
  }
}
