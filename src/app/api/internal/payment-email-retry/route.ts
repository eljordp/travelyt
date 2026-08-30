import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import { getStripe } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

interface PaymentReceiptRetryRow {
  booking_id: string;
  stripe_checkout_session_id: string;
  status: "sending" | "failed" | "not_configured";
  claimed_at: string | null;
  next_attempt_at: string | null;
}

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function retryIsDue(row: PaymentReceiptRetryRow, now: Date) {
  if (row.status === "sending") {
    return Boolean(
      row.claimed_at &&
        Date.parse(row.claimed_at) <= now.getTime() - 15 * 60_000
    );
  }
  return !row.next_attempt_at || Date.parse(row.next_attempt_at) <= now.getTime();
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Payment-email worker authorization failed." },
      { status: 401 }
    );
  }
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  if (!stripe || !supabase) {
    return NextResponse.json(
      { ok: false, error: "Payment-email retry services are not configured." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("booking_payment_receipts")
    .select(
      "booking_id, stripe_checkout_session_id, status, claimed_at, next_attempt_at"
    )
    .in("status", ["sending", "failed", "not_configured"])
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Could not load payment-email retry queue." },
      { status: 500 }
    );
  }

  const due = ((data ?? []) as PaymentReceiptRetryRow[])
    .filter((row) => retryIsDue(row, new Date()))
    .slice(0, 25);
  const results = [];
  for (const row of due) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        row.stripe_checkout_session_id
      );
      const result = await markBookingPaidFromCheckoutSession(session);
      results.push({ bookingId: row.booking_id, ok: result.ok });
    } catch (retryError) {
      console.error("Payment confirmation email retry failed", retryError);
      results.push({ bookingId: row.booking_id, ok: false });
    }
  }

  const failed = results.filter((result) => !result.ok);
  return NextResponse.json(
    {
      ok: failed.length === 0,
      scanned: data?.length ?? 0,
      due: due.length,
      reconciled: results.length - failed.length,
      failed: failed.length,
    },
    { status: failed.length ? 207 : 200 }
  );
}
