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
      return bad("Stripe has not marked this checkout as paid yet.", 409);
    }

    return NextResponse.json({ ok: true, booking: result.booking });
  } catch (error) {
    console.error("Stripe session confirmation failed", error);
    return bad("Could not confirm Stripe payment.", 500);
  }
}
