import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getStripe } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
function bad(error: string, status = 400) { return NextResponse.json({ ok: false, error }, { status }); }
export async function POST(request: Request) {
  const session = getAdminSession(request); if (!session || session.role !== "admin") return bad("Full admin access is required.", 403);
  const supabase = getSupabaseAdmin(); const stripe = getStripe(); if (!supabase || !stripe) return bad("Refund service is not configured.", 503);
  const body = await request.json().catch(() => ({})) as { bookingId?: string; paymentIntentId?: string; amountCents?: number; reason?: string; idempotencyKey?: string };
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : ""; const paymentIntentId = typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : ""; const amountCents = Number(body.amountCents); const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bookingId) || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId) || !reason || !/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey) || !Number.isInteger(amountCents) || amountCents < 1) return bad("Booking, payment intent, amount, reason, and idempotency key are required.");
  const { data: booking, error: bookingError } = await supabase.from("bookings").select("id").eq("id", bookingId).maybeSingle<{ id: string }>();
  if (bookingError || !booking) return bad("Booking was not found.", 404);
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return bad("The Stripe payment could not be verified.", 409);
  }
  if (paymentIntent.metadata?.bookingId !== bookingId || paymentIntent.status !== "succeeded" || amountCents > paymentIntent.amount_received) {
    return bad("The refund does not match a completed payment for this booking.", 409);
  }
  const { data: prior, error: lookupError } = await supabase.from("booking_financial_events").select("status, stripe_refund_id").eq("booking_id", bookingId).eq("idempotency_key", idempotencyKey).maybeSingle<{ status: string; stripe_refund_id: string | null }>();
  if (lookupError) return bad("Could not read the refund ledger.", 500); if (prior) return NextResponse.json({ ok: true, idempotent: true, status: prior.status, refundId: prior.stripe_refund_id });
  const { error: pendingError } = await supabase.from("booking_financial_events").insert({ booking_id: bookingId, kind: "refund_requested", amount_cents: amountCents, reason, idempotency_key: idempotencyKey, status: "pending", requested_by: session.email });
  if (pendingError) return bad("Could not create refund ledger entry.", 500);
  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, amount: amountCents, metadata: { bookingId, requestedBy: session.email, reason } }, { idempotencyKey });
    const status = refund.status === "succeeded" ? "succeeded" : "manual_review";
    await supabase.from("booking_financial_events").update({ kind: refund.status === "succeeded" ? "refund_succeeded" : "refund_failed", stripe_refund_id: refund.id, status }).eq("booking_id", bookingId).eq("idempotency_key", idempotencyKey);
    return NextResponse.json({ ok: true, idempotent: false, status, refundId: refund.id });
  } catch {
    await supabase.from("booking_financial_events").update({ kind: "refund_failed", status: "failed" }).eq("booking_id", bookingId).eq("idempotency_key", idempotencyKey);
    return bad("Stripe refund failed; review the financial ledger before retrying.", 502);
  }
}
