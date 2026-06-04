import { NextResponse } from "next/server";
import { rowToBooking, type BookingRow } from "@/lib/booking-mappers";
import type { ServiceType } from "@/lib/bookings";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { getSiteUrl, getStripe } from "@/lib/stripe-server";

const SERVICE_LABELS: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

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
  const limited = rateLimit(request, "stripe:checkout", 20);
  if (limited) return limited;

  const stripe = getStripe();
  if (!stripe) return bad("Stripe is not configured.", 503);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as {
      bookingId?: string;
      accessToken?: string;
    };
    const bookingId = body.bookingId?.trim();
    if (!bookingId) return bad("Missing booking ID.");

    const { data: row, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle<BookingRow>();

    if (error) return bad("Could not load booking.", 500);
    if (!row) return bad("Booking not found.", 404);

    const user = await getRequestUser(request);
    if (!userOwns(row, user?.id) && !tokenMatches(row, body.accessToken)) {
      return bad("You do not have access to this booking.", 403);
    }

    const booking = rowToBooking(row);
    if (booking.status !== "pending") {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        url: `${getSiteUrl(request)}/booking/${booking.id}`,
      });
    }

    if (booking.priceCents <= 0) {
      const now = new Date().toISOString();
      await supabase
        .from("bookings")
        .update({ status: "paid", paid_at: now })
        .eq("id", booking.id)
        .eq("status", "pending");
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        url: `${getSiteUrl(request)}/booking/${booking.id}?payment=confirmed`,
      });
    }

    const siteUrl = getSiteUrl(request);
    const description = [
      `${SERVICE_LABELS[booking.service]} at ${booking.airport}`,
      `${booking.bags} bag${booking.bags === 1 ? "" : "s"}`,
      booking.flight ? `Flight ${booking.flight}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: booking.id,
      customer_email: booking.email,
      success_url: `${siteUrl}/booking/${booking.id}/pay?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/booking/${booking.id}/pay?checkout=cancelled`,
      metadata: {
        bookingId: booking.id,
      },
      payment_intent_data: {
        metadata: {
          bookingId: booking.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: process.env.STRIPE_CURRENCY || "usd",
            unit_amount: booking.priceCents,
            product_data: {
              name: `Travelyt ${SERVICE_LABELS[booking.service]}`,
              description,
              metadata: {
                bookingId: booking.id,
              },
            },
          },
        },
      ],
      custom_text: {
        submit: {
          message:
            "Travelyt confirms operational availability before custody begins. Airline baggage fees, if any, are paid separately to the airline.",
        },
      },
    });

    if (!session.url) {
      return bad("Stripe did not return a checkout URL.", 502);
    }

    return NextResponse.json({
      ok: true,
      url: session.url,
      amount: formatPrice(booking.priceCents),
    });
  } catch (error) {
    console.error("Stripe checkout failed", error);
    return bad("Could not start secure checkout.", 500);
  }
}
