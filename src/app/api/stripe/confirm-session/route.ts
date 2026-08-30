import { NextResponse } from "next/server";
import { type BookingRow } from "@/lib/booking-mappers";
import { rateLimit } from "@/lib/rate-limit";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe-server";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function tokenMatches(row: BookingRow, token?: string | null) {
  return Boolean(token && row.customer_access_token && token === row.customer_access_token);
}

function userOwns(row: BookingRow, userId?: string | null) {
  return Boolean(userId && row.customer_user_id && row.customer_user_id === userId);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "stripe:confirm-session", 30);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return bad("Stripe is not configured.", 503);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as {
      bookingId?: string;
      sessionId?: string;
      accessToken?: string;
    };
    const bookingId = body.bookingId?.trim();
    const sessionId = body.sessionId?.trim();
    if (!bookingId || !sessionId) return bad("Missing booking or session ID.");

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionBookingId = session.metadata?.bookingId || session.client_reference_id;
    if (sessionBookingId !== bookingId) {
      return bad("Stripe session does not match this booking.", 409);
    }

    const { data: row, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRow>();

    if (error) return bad("Could not load booking.", 500);
    if (!row) return bad("Booking not found.", 404);

    const user = await getRequestUser(request);
    const payerEmail = session.customer_details?.email || session.customer_email;
    const sameEmail =
      payerEmail &&
      row.email.trim().toLowerCase() === payerEmail.trim().toLowerCase();

    if (!userOwns(row, user?.id) && !tokenMatches(row, body.accessToken) && !sameEmail) {
      return bad("You do not have access to this booking.", 403);
    }

    const result = await markBookingPaidFromCheckoutSession(session);
    if (!result.ok) {
      if (result.reason === "payment-mismatch") {
        return bad(
          "Stripe payment details did not match this booking. Any open authorization was blocked; payment and custody require review.",
          409
        );
      }
      if (result.reason === "payment-mismatch-refunded") {
        return bad(
          "Stripe captured an amount or currency that did not match this booking. Travelyt blocked the booking and confirmed an automatic full refund.",
          409,
        );
      }
      if (result.reason === "payment-mismatch-refund-pending") {
        return bad(
          "Stripe captured an amount or currency that did not match this booking. Travelyt blocked the booking and requested a full refund, but financial reconciliation is still pending.",
          409,
        );
      }
      if (result.reason === "checkout-session-mismatch") {
        return bad(
          "This paid Stripe session does not match the checkout recorded for this booking. It was flagged for manual review.",
          409
        );
      }
      if (result.reason === "payment-mode-mismatch") {
        return bad(
          "Stripe test/live mode did not match this booking. Any authorization was canceled or routed to manual review; custody remains blocked.",
          409,
        );
      }
      if (result.reason === "operations-paused") {
        return bad(
          "Travelyt paused this operating mode before capture. Any open authorization was canceled; no custody may begin.",
          409,
        );
      }
      if (result.reason === "legacy-automatic-capture") {
        return bad(
          "This older automatic-capture payment was routed to manual review. Custody remains blocked until payment reconciliation is complete.",
          409,
        );
      }
      if (
        result.reason === "identity-invalid-at-payment" ||
        result.reason === "capture-not-authorized"
      ) {
        return bad(
          "Your card authorization was not captured because the current identity or pilot gate did not pass. No Travelyt payment was completed.",
          409,
        );
      }
      if (result.reason === "capture-finalization-refunded") {
        return bad(
          "Stripe captured the authorization, but Travelyt could not safely finalize the booking. An automatic full refund was confirmed; the booking remains unpaid and blocked.",
          409,
        );
      }
      if (result.reason === "capture-finalization-refund-pending") {
        return bad(
          "Stripe captured the authorization, but Travelyt could not safely finalize the booking. An automatic refund was requested, but its outcome still requires payment reconciliation.",
          409,
        );
      }
      return bad("Stripe has not marked this checkout as paid yet.", 409);
    }

    return NextResponse.json({ ok: true, booking: result.booking });
  } catch (error) {
    console.error("Stripe session confirmation failed", error);
    return bad("Could not confirm Stripe payment.", 500);
  }
}
