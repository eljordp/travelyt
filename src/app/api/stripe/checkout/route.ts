import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { rowToBooking, type BookingRow } from "@/lib/booking-mappers";
import type { ServiceType } from "@/lib/bookings";
import { rateLimit } from "@/lib/rate-limit";
import { markBookingPaidFromCheckoutSession } from "@/lib/stripe-payments";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import { configuredStripeLivemode, getSiteUrl, getStripe } from "@/lib/stripe-server";
import { checkoutEligibilityBlocker } from "@/lib/pilot-eligibility";
import {
  configuredOperationalMode,
  isOperationalMode,
  stripeLivemodeForOperationalMode,
} from "@/lib/operational-mode";
import { verifyStoredServerPricingQuote } from "@/lib/server-pricing-quote";

const SERVICE_LABELS: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
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

interface CheckoutClaim {
  claimed_token: string | null;
  existing_session_id: string | null;
  checkout_status:
    | "creating"
    | "open"
    | "capture_authorized"
    | "paid"
    | "expired"
    | "failed"
    | "manual_review";
  checkout_attempt: number;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "stripe:checkout", 20);
  if (limited) return limited;

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
    if (row.service === "both") {
      return bad(
        "This legacy combined booking must be replaced with separate departure and arrival bookings before payment.",
        409
      );
    }

    const booking = rowToBooking(row);
    if (booking.status !== "pending" && booking.priceCents <= 0) {
      return NextResponse.json({
        ok: true,
        noPaymentDue: true,
        url: `${getSiteUrl(request)}/booking/${booking.id}`,
      });
    }
    if (booking.status !== "pending" && booking.paidAt) {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        url: `${getSiteUrl(request)}/booking/${booking.id}`,
      });
    }
    if (booking.status !== "pending") {
      return bad(
        "This unpaid booking is not eligible for checkout in its current status. No charge was created.",
        409,
      );
    }

    if (!isOperationalMode(booking.operationalMode)) {
      return bad(
        "This legacy or unreviewed booking has no classified operating mode. No checkout or charge was created.",
        409,
      );
    }
    const configuredMode = configuredOperationalMode();
    if (configuredMode !== booking.operationalMode) {
      return bad(
        booking.operationalMode === "live"
          ? "Live operations are paused. No checkout or charge was created."
          : "This rehearsal booking no longer matches the active operating mode. No checkout or charge was created.",
        409,
      );
    }
    const expectedStripeLivemode = stripeLivemodeForOperationalMode(
      booking.operationalMode,
    );

    const pricingIntegrity = verifyStoredServerPricingQuote({
      bookingId: row.id,
      service: booking.service,
      airport: row.airport,
      address: row.address,
      bags: row.bags,
      priceCents: row.price_cents,
      quoteValue: row.pricing_quote,
      fingerprint: row.pricing_fingerprint,
    });
    if (!pricingIntegrity.ok) {
      console.error("Checkout blocked by pricing provenance", {
        bookingId: row.id,
        error: pricingIntegrity.error,
      });
      return bad(
        "This booking needs a fresh server-verified route quote. No checkout or charge was created.",
        409
      );
    }

    const eligibilityBlocker = checkoutEligibilityBlocker({
      status: booking.pilotEligibilityStatus,
      expiresAt: booking.pilotEligibilityExpiresAt,
    });
    if (eligibilityBlocker) {
      if (
        booking.pilotEligibilityStatus === "approved" &&
        booking.pilotEligibilityExpiresAt &&
        Date.parse(booking.pilotEligibilityExpiresAt) <= Date.now()
      ) {
        await supabase
          .from("bookings")
          .update({ pilot_eligibility_status: "expired" })
          .eq("id", booking.id)
          .eq("status", "pending")
          .eq("pilot_eligibility_status", "approved");
      }
      return bad(eligibilityBlocker, 409);
    }

    // Approval is time-bounded, but identity can be rejected, expire, lose
    // consent, or have its private archive destroyed inside that window. Recheck
    // the canonical provider evidence immediately before any checkout claim.
    const { data: identityEvidenceCurrent, error: identityEvidenceError } =
      await supabase.rpc("booking_has_current_identity", {
        p_booking_id: booking.id,
      });
    if (identityEvidenceError) {
      console.error("Checkout identity revalidation failed", identityEvidenceError);
      return bad(
        "Current identity evidence could not be revalidated. No checkout or charge was created.",
        503,
      );
    }
    if (identityEvidenceCurrent !== true) {
      await supabase
        .from("bookings")
        .update({
          pilot_eligibility_status: "expired",
          pilot_eligibility_expires_at: null,
          pilot_eligibility_snapshot: {
            ...(booking.pilotEligibilitySnapshot ?? {}),
            eligibleTraveler: false,
            identityEvidenceMode: "missing_or_nonlive",
            identityEvidenceRevalidatedAt: new Date().toISOString(),
          },
          pilot_eligibility_reason:
            "Approval expired because current mode-matched identity evidence is missing.",
        })
        .eq("id", booking.id)
        .eq("status", "pending")
        .eq("pilot_eligibility_status", "approved");
      return bad(
        "Current identity verification for this booking mode is required. This approval expired; no checkout or charge was created.",
        409,
      );
    }

    const approvalExpiresAt = Date.parse(booking.pilotEligibilityExpiresAt!);
    const remainingApprovalSeconds = Math.floor((approvalExpiresAt - Date.now()) / 1000);
    if (remainingApprovalSeconds < 30 * 60) {
      return bad(
        "This pilot approval has less than 30 minutes remaining. No charge has been made; request another review.",
        409
      );
    }

    if (booking.priceCents <= 0) {
      const now = new Date().toISOString();
      const { data: activated, error: activationError } = await supabase
        .from("bookings")
        .update({ status: "paid", paid_at: now })
        .eq("id", booking.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle<{ id: string }>();
      if (activationError || !activated) {
        return bad(
          "This zero-dollar booking could not pass the final identity gate. No booking activation or charge occurred.",
          409,
        );
      }
      return NextResponse.json({
        ok: true,
        noPaymentDue: true,
        url: `${getSiteUrl(request)}/booking/${booking.id}`,
      });
    }

    const stripe = getStripe();
    if (!stripe) return bad("Stripe is not configured.", 503);
    const stripeLivemode = configuredStripeLivemode();
    if (stripeLivemode === null || stripeLivemode !== expectedStripeLivemode) {
      return bad(
        booking.operationalMode === "rehearsal"
          ? "Rehearsal checkout requires Stripe test mode. No checkout or charge was created."
          : "Live checkout requires Stripe live mode. No checkout or charge was created.",
        503,
      );
    }

    const siteUrl = getSiteUrl(request);
    const description = [
      `${SERVICE_LABELS[booking.service]} at ${booking.airport}`,
      `${booking.bags} bag${booking.bags === 1 ? "" : "s"}`,
      booking.flight ? `Flight ${booking.flight}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

    const claimCheckout = async () => {
      const { data, error: claimError } = await supabase
        .rpc("claim_booking_checkout_session", { p_booking_id: booking.id })
        .single<CheckoutClaim>();
      if (claimError) throw claimError;
      return data;
    };

    let claim = await claimCheckout();
    for (let pass = 0; pass < 2; pass += 1) {
      if (!claim.claimed_token) {
        if (claim.checkout_status === "paid") {
          return NextResponse.json({
            ok: true,
            alreadyPaid: true,
            url: `${siteUrl}/booking/${booking.id}?payment=confirmed`,
          });
        }
        if (claim.checkout_status === "manual_review") {
          return bad(
            "This booking's payment needs manual review. No new checkout was created.",
            409
          );
        }
        if (claim.checkout_status === "creating") {
          return bad(
            "Secure checkout is already being prepared. Try again in a moment; no charge has been made.",
            409
          );
        }
        if (claim.checkout_status === "capture_authorized") {
          return bad(
            "Card authorization is being identity-checked before capture. No second checkout was created.",
            409,
          );
        }
        if (claim.checkout_status === "open" && claim.existing_session_id) {
          const existingSession = await stripe.checkout.sessions.retrieve(
            claim.existing_session_id
          );
          const existingMode = existingSession.metadata?.operationalMode;
          if (
            existingSession.livemode !== expectedStripeLivemode ||
            existingMode !== booking.operationalMode
          ) {
            if (existingSession.status === "open") {
              await stripe.checkout.sessions.expire(existingSession.id).catch(() => null);
            }
            const { error: modeError } = await supabase
              .from("booking_checkout_sessions")
              .update({
                status: "expired",
                claim_token: null,
                claimed_at: null,
                last_error: "Checkout operating mode did not match the booking.",
              })
              .eq("booking_id", booking.id)
              .eq("stripe_checkout_session_id", claim.existing_session_id);
            if (modeError) throw modeError;
            claim = await claimCheckout();
            continue;
          }
          if (
            existingSession.payment_status === "paid" ||
            existingSession.status === "complete"
          ) {
            const reconciled = await markBookingPaidFromCheckoutSession(existingSession);
            if (!reconciled.ok) {
              return bad(
                "This payment needs manual review. No new checkout was created.",
                409
              );
            }
            return NextResponse.json({
              ok: true,
              alreadyPaid: true,
              url: `${siteUrl}/booking/${booking.id}?payment=confirmed`,
            });
          }
          if (existingSession.status === "open" && existingSession.url) {
            return NextResponse.json({
              ok: true,
              url: existingSession.url,
              amount: formatPrice(booking.priceCents),
              reused: true,
            });
          }
          const { error: expireError } = await supabase
            .from("booking_checkout_sessions")
            .update({ status: "expired", claim_token: null, claimed_at: null })
            .eq("booking_id", booking.id)
            .eq("stripe_checkout_session_id", claim.existing_session_id)
            .eq("status", "open");
          if (expireError) throw expireError;
          claim = await claimCheckout();
          continue;
        }
        return bad("Secure checkout is unavailable for this booking.", 409);
      }

      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: ["card"],
            client_reference_id: booking.id,
            customer_email: booking.email,
            success_url: `${siteUrl}/booking/${booking.id}/pay?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/booking/${booking.id}/pay?checkout=cancelled`,
            metadata: {
              bookingId: booking.id,
              pilotEligibilityDecidedAt: booking.pilotEligibilityDecidedAt || "",
              pilotEligibilityExpiresAt: booking.pilotEligibilityExpiresAt || "",
              operationalMode: booking.operationalMode,
            },
            payment_intent_data: {
              capture_method: "manual",
              metadata: {
                bookingId: booking.id,
                pilotEligibilityDecidedAt: booking.pilotEligibilityDecidedAt || "",
                operationalMode: booking.operationalMode,
              },
            },
            expires_at: Math.min(
              Math.floor(Date.now() / 1000) + 23 * 60 * 60,
              Math.floor(approvalExpiresAt / 1000)
            ),
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
          },
          {
            idempotencyKey: `travelyt-booking:${booking.id}:${claim.checkout_attempt}`,
          }
        );
      } catch (createError) {
        await supabase
          .from("booking_checkout_sessions")
          .update({
            status: "failed",
            claim_token: null,
            claimed_at: null,
            last_error: "Stripe Checkout Session creation failed.",
          })
          .eq("booking_id", booking.id)
          .eq("claim_token", claim.claimed_token)
          .eq("status", "creating");
        throw createError;
      }

      if (!session.url) {
        await supabase
          .from("booking_checkout_sessions")
          .update({
            status: "failed",
            claim_token: null,
            claimed_at: null,
            last_error: "Stripe did not return a Checkout URL.",
          })
          .eq("booking_id", booking.id)
          .eq("claim_token", claim.claimed_token)
          .eq("status", "creating");
        return bad("Stripe did not return a checkout URL.", 502);
      }

      if (
        session.livemode !== expectedStripeLivemode ||
        session.metadata?.operationalMode !== booking.operationalMode
      ) {
        await stripe.checkout.sessions.expire(session.id).catch(() => null);
        await supabase
          .from("booking_checkout_sessions")
          .update({
            status: "failed",
            claim_token: null,
            claimed_at: null,
            last_error: "Stripe returned a Checkout Session in the wrong operating mode.",
          })
          .eq("booking_id", booking.id)
          .eq("claim_token", claim.claimed_token)
          .eq("status", "creating");
        return bad("Stripe operating mode did not match this booking. No charge was created.", 503);
      }

      const { data: finalized, error: finalizeError } = await supabase.rpc(
        "finalize_booking_checkout_session",
        {
          p_booking_id: booking.id,
          p_claim_token: claim.claimed_token,
          p_checkout_session_id: session.id,
          p_operational_mode: booking.operationalMode,
          p_stripe_livemode: session.livemode,
        },
      );
      if (finalizeError || finalized !== true) {
        await stripe.checkout.sessions.expire(session.id).catch(() => null);
        throw finalizeError || new Error("Checkout claim could not be finalized.");
      }

      return NextResponse.json({
        ok: true,
        url: session.url,
        amount: formatPrice(booking.priceCents),
      });
    }

    return bad("Secure checkout could not be prepared. No charge has been made.", 409);
  } catch (error) {
    console.error("Stripe checkout failed", error);
    return bad("Could not start secure checkout.", 500);
  }
}
