import type Stripe from "stripe";
import { rowToBooking, type BookingRow } from "@/lib/booking-mappers";
import { queueBookingNotification } from "@/lib/push-notifications-server";
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

  const paidAt =
    typeof session.created === "number"
      ? new Date(session.created * 1000).toISOString()
      : new Date().toISOString();

  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (loadError) throw loadError;
  if (!existing) throw new Error(`Booking not found for Stripe session: ${bookingId}`);

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

  return { ok: true as const, booking: rowToBooking(updated) };
}
