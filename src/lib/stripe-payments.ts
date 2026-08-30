import type Stripe from "stripe";
import { rowToBooking, type BookingRow } from "@/lib/booking-mappers";
import { sendBookingPaymentConfirmation } from "@/lib/payment-confirmation-email";
import { queueBookingNotification } from "@/lib/push-notifications-server";
import { getSiteUrl, getStripe } from "@/lib/stripe-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  configuredOperationalMode,
  isOperationalMode,
  stripeLivemodeForOperationalMode,
} from "@/lib/operational-mode";

type CompensatingRefundOutcome = {
  status: "succeeded" | "manual_review";
  refundId: string | null;
  detail: string;
};

type CompensationPurpose = "capture_finalization" | "payment_mismatch";

function compensationDetails(
  purpose: CompensationPurpose,
  paymentIntentId: string,
) {
  if (purpose === "payment_mismatch") {
    return {
      idempotencyKey: `payment-mismatch-refund:${paymentIntentId}`,
      metadataSource: "payment_mismatch_compensation",
      baseReason:
        "Automatic full refund because Stripe captured an amount or currency that did not match Travelyt's immutable booking price.",
    };
  }
  return {
    idempotencyKey: `capture-finalization-refund:${paymentIntentId}`,
    metadataSource: "capture_finalization_compensation",
    baseReason:
      "Automatic full refund after Stripe capture could not be confirmed in Travelyt's booking ledger.",
  };
}

async function findCaptureFinalizationCompensation(input: {
  bookingId: string;
  paymentIntent: Stripe.PaymentIntent;
  stripe: NonNullable<ReturnType<typeof getStripe>>;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
}): Promise<CompensatingRefundOutcome | null> {
  const idempotencyKey =
    `capture-finalization-refund:${input.paymentIntent.id}`;
  const { data: ledger, error: ledgerError } = await input.supabase
    .from("booking_financial_events")
    .select("status, stripe_refund_id")
    .eq("booking_id", input.bookingId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<{ status: string; stripe_refund_id: string | null }>();
  if (ledgerError) throw ledgerError;

  // Provider state is the decisive fallback when the payment finalization
  // committed but the compensating-refund ledger write was temporarily lost.
  const refunds = await input.stripe.refunds.list({
    payment_intent: input.paymentIntent.id,
    limit: 100,
  });
  const providerRefund = refunds.data.find((refund) =>
    refund.metadata?.bookingId === input.bookingId &&
    refund.metadata?.source === "capture_finalization_compensation"
  );
  if (!ledger && !providerRefund) return null;

  if (providerRefund) {
    const succeeded = providerRefund.status === "succeeded";
    const { error: reconciliationError } = await input.supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: input.bookingId,
        kind: succeeded ? "refund_succeeded" : "refund_failed",
        amount_cents: providerRefund.amount,
        currency: providerRefund.currency,
        reason:
          "Stripe compensation detected during paid-replay reconciliation; customer receipt and custody remain blocked.",
        idempotency_key: idempotencyKey,
        stripe_refund_id: providerRefund.id,
        status: succeeded ? "succeeded" : "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
      });
    if (reconciliationError) throw reconciliationError;
    return {
      status: succeeded ? "succeeded" : "manual_review",
      refundId: providerRefund.id,
      detail: succeeded
        ? "Stripe confirms this captured payment was automatically refunded."
        : "Stripe confirms a compensating refund exists, but its outcome requires review.",
    };
  }

  return {
    status: ledger?.status === "succeeded" ? "succeeded" : "manual_review",
    refundId: ledger?.stripe_refund_id ?? null,
    detail:
      "Travelyt's compensation ledger shows a refund attempt; the paid receipt path remains blocked until Stripe reconciliation is complete.",
  };
}

async function attemptCaptureFinalizationRefund(input: {
  bookingId: string;
  checkoutSessionId: string;
  paymentIntent: Stripe.PaymentIntent;
  stripe: NonNullable<ReturnType<typeof getStripe>>;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  purpose?: CompensationPurpose;
}): Promise<CompensatingRefundOutcome> {
  const purpose = input.purpose ?? "capture_finalization";
  const { idempotencyKey, metadataSource, baseReason } = compensationDetails(
    purpose,
    input.paymentIntent.id,
  );
  const amountCents =
    input.paymentIntent.amount_received || input.paymentIntent.amount;

  const { data: prior, error: priorError } = await input.supabase
    .from("booking_financial_events")
    .select("status, stripe_refund_id")
    .eq("booking_id", input.bookingId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<{ status: string; stripe_refund_id: string | null }>();
  if (priorError) {
    console.error("Could not read compensating-refund ledger", priorError);
  }
  if (prior?.status === "succeeded" && prior.stripe_refund_id) {
    return {
      status: "succeeded",
      refundId: prior.stripe_refund_id,
      detail: "The automatic compensating refund was already recorded as succeeded.",
    };
  }

  let ledgerReady = Boolean(prior);
  if (!prior && !priorError) {
    const { data: requestRecord, error: requestError } = await input.supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: input.bookingId,
        kind: "refund_requested",
        amount_cents: amountCents,
        currency: input.paymentIntent.currency,
        reason: baseReason,
        idempotency_key: idempotencyKey,
        status: "pending",
        requested_by: "stripe_capture_compensation",
      }, {
        onConflict: "booking_id,idempotency_key",
        ignoreDuplicates: true,
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    ledgerReady = !requestError && Boolean(requestRecord);
    if (!ledgerReady) {
      // The customer-safety action still runs if the audit write is
      // temporarily unavailable. The same Stripe idempotency key makes a
      // later webhook/browser retry safe.
      console.error("Could not create compensating-refund ledger entry", requestError);
    }
  }

  try {
    const refund = prior?.stripe_refund_id
      ? await input.stripe.refunds.retrieve(prior.stripe_refund_id)
      : await input.stripe.refunds.create({
          payment_intent: input.paymentIntent.id,
          amount: amountCents,
          metadata: {
            bookingId: input.bookingId,
            checkoutSessionId: input.checkoutSessionId,
            paymentIntentId: input.paymentIntent.id,
            source: metadataSource,
          },
        }, {
          idempotencyKey,
        });
    const succeeded = refund.status === "succeeded";
    const detail = succeeded
      ? "Stripe confirmed the automatic compensating refund. The booking remains blocked and unpaid in Travelyt."
      : `Stripe accepted the automatic refund, but its current status is ${refund.status || "unknown"}; financial review remains required.`;
    const { data: outcomeRecord, error: outcomeError } = await input.supabase
      .from("booking_financial_events")
      .update({
        kind: succeeded ? "refund_succeeded" : "refund_failed",
        stripe_refund_id: refund.id,
        status: succeeded ? "succeeded" : "manual_review",
        reason: `${baseReason} ${detail}`,
      })
      .eq("booking_id", input.bookingId)
      .eq("idempotency_key", idempotencyKey)
      .select("id")
      .maybeSingle<{ id: string }>();
    const outcomePersisted = ledgerReady && !outcomeError && Boolean(outcomeRecord);
    if (!outcomePersisted) {
      console.error("Could not persist compensating-refund outcome", outcomeError);
    }
    return {
      status: succeeded && outcomePersisted ? "succeeded" : "manual_review",
      refundId: refund.id,
      detail:
        succeeded && !outcomePersisted
          ? `${detail} The refund succeeded at Stripe, but Travelyt could not durably record the outcome; reconciliation must retry with the same idempotency key.`
          : detail,
    };
  } catch (error) {
    const detail =
      "The automatic refund request returned an unknown outcome. Retry only with the same idempotency key and reconcile Stripe before any manual refund.";
    const { error: outcomeError } = await input.supabase
      .from("booking_financial_events")
      .update({
        kind: "refund_requested",
        status: "manual_review",
        reason: `${baseReason} ${detail}`,
      })
      .eq("booking_id", input.bookingId)
      .eq("idempotency_key", idempotencyKey);
    if (outcomeError) {
      console.error("Could not persist unknown compensating-refund outcome", outcomeError);
    }
    console.error("Stripe compensating refund outcome is unknown", error);
    return { status: "manual_review", refundId: null, detail };
  }
}

type BookingCheckoutState = {
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  operational_mode: string | null;
  stripe_livemode: boolean | null;
  captured_at: string | null;
  last_error: string | null;
};

async function containPaymentMismatch(input: {
  bookingId: string;
  session: Stripe.Checkout.Session;
  paymentIntent: Stripe.PaymentIntent;
  checkoutState: BookingCheckoutState | null;
  operationalMode: "rehearsal" | "live";
  expectedLivemode: boolean;
  expectedAmountCents: number;
  expectedCurrency: string;
  stripe: NonNullable<ReturnType<typeof getStripe>>;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
}) {
  const mismatchReason = [
    "Stripe amount/currency mismatch; payment and custody are blocked.",
    `Expected ${input.expectedAmountCents} ${input.expectedCurrency}.`,
    `Checkout reported ${input.session.amount_total ?? "unknown"} ${input.session.currency ?? "unknown"}.`,
    `PaymentIntent reported ${input.paymentIntent.amount} ${input.paymentIntent.currency}.`,
  ].join(" ");
  const mismatchEventKey = `payment-mismatch:${input.session.id}:${input.paymentIntent.id}`;

  const exactCheckoutBinding = Boolean(
    input.checkoutState &&
      input.checkoutState.stripe_checkout_session_id === input.session.id &&
      input.checkoutState.operational_mode === input.operationalMode &&
      input.checkoutState.stripe_livemode === input.expectedLivemode &&
      (
        input.checkoutState.stripe_payment_intent_id === null ||
        input.checkoutState.stripe_payment_intent_id === input.paymentIntent.id
      )
  );

  // Persist and bind the fail-closed state before touching Stripe. A fast
  // refund webhook can then only reconcile against this exact PaymentIntent.
  const { error: initialReviewError } = await input.supabase
    .from("booking_financial_events")
    .upsert({
      booking_id: input.bookingId,
      kind: "manual_adjustment",
      amount_cents:
        input.paymentIntent.amount_received || input.paymentIntent.amount,
      currency: input.paymentIntent.currency,
      reason: `${mismatchReason} Provider containment started.`,
      idempotency_key: mismatchEventKey,
      status: "manual_review",
      requested_by: "stripe_reconciliation",
    }, {
      onConflict: "booking_id,idempotency_key",
    });
  if (initialReviewError) {
    console.error("Could not persist initial payment-mismatch review", initialReviewError);
  }

  let initialCheckoutError: Error | null = null;
  if (exactCheckoutBinding && input.checkoutState) {
    let checkoutUpdate = input.supabase
      .from("booking_checkout_sessions")
      .update({
        status: "manual_review",
        stripe_payment_intent_id: input.paymentIntent.id,
        claim_token: null,
        claimed_at: null,
        last_error: `${mismatchReason} Provider containment started.`,
      })
      .eq("booking_id", input.bookingId)
      .eq("stripe_checkout_session_id", input.session.id)
      .eq("status", input.checkoutState.status)
      .eq("operational_mode", input.operationalMode)
      .eq("stripe_livemode", input.expectedLivemode);
    checkoutUpdate = input.checkoutState.stripe_payment_intent_id === null
      ? checkoutUpdate.is("stripe_payment_intent_id", null)
      : checkoutUpdate.eq(
          "stripe_payment_intent_id",
          input.checkoutState.stripe_payment_intent_id,
        );
    const { data: blockedCheckout, error: checkoutError } = await checkoutUpdate
      .select("booking_id")
      .maybeSingle<{ booking_id: string }>();
    if (checkoutError || !blockedCheckout) {
      initialCheckoutError = checkoutError ?? new Error(
        "The exact Checkout state changed before Travelyt could block the mismatch.",
      );
      console.error("Could not persist initial payment-mismatch Checkout block", initialCheckoutError);
    }
  }

  const { data: blockedApproval, error: approvalError } = await input.supabase
    .from("bookings")
    .update({
      pilot_eligibility_status: "expired",
      pilot_eligibility_expires_at: null,
      pilot_eligibility_reason:
        "Payment amount/currency mismatch requires financial reconciliation before checkout or custody can continue.",
    })
    .eq("id", input.bookingId)
    .eq("pilot_eligibility_status", "approved")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (approvalError) {
    console.error("Could not expire payment-mismatch approval", approvalError);
  }

  let providerDetail = "Stripe did not report a capturable or captured payment.";
  let checkoutStatus: "failed" | "manual_review" = "manual_review";
  let outcome:
    | "payment-mismatch"
    | "payment-mismatch-refunded"
    | "payment-mismatch-refund-pending" = "payment-mismatch";

  if (input.paymentIntent.status === "canceled") {
    checkoutStatus = "failed";
    providerDetail = "Stripe confirms the mismatched authorization is canceled.";
  } else if (input.paymentIntent.status === "requires_capture") {
    try {
      const canceled = await input.stripe.paymentIntents.cancel(
        input.paymentIntent.id,
        {},
        {
          idempotencyKey:
            `travelyt-cancel-payment-mismatch:${input.bookingId}:${input.paymentIntent.id}`,
        },
      );
      if (canceled.status !== "canceled") {
        throw new Error(`Stripe returned ${canceled.status} after cancellation.`);
      }
      checkoutStatus = "failed";
      providerDetail = "Stripe confirmed the mismatched authorization was canceled.";
    } catch (error) {
      providerDetail =
        "The mismatched authorization cancellation outcome is unknown; retry only with the same idempotency key.";
      console.error("Stripe mismatch authorization cancellation is unresolved", error);
    }
  } else if (
    input.paymentIntent.status === "succeeded" ||
    input.session.payment_status === "paid"
  ) {
    const refund = await attemptCaptureFinalizationRefund({
      bookingId: input.bookingId,
      checkoutSessionId: input.session.id,
      paymentIntent: input.paymentIntent,
      stripe: input.stripe,
      supabase: input.supabase,
      purpose: "payment_mismatch",
    });
    providerDetail = refund.detail;
    outcome = refund.status === "succeeded"
      ? "payment-mismatch-refunded"
      : "payment-mismatch-refund-pending";
  }

  const { error: finalReviewError } = await input.supabase
    .from("booking_financial_events")
    .upsert({
      booking_id: input.bookingId,
      kind: "manual_adjustment",
      amount_cents:
        input.paymentIntent.amount_received || input.paymentIntent.amount,
      currency: input.paymentIntent.currency,
      reason: `${mismatchReason} ${providerDetail}`,
      idempotency_key: mismatchEventKey,
      status: "manual_review",
      requested_by: "stripe_reconciliation",
    }, {
      onConflict: "booking_id,idempotency_key",
    });

  let finalCheckoutError: Error | null = null;
  if (exactCheckoutBinding) {
    const { data: finalCheckout, error: checkoutError } = await input.supabase
      .from("booking_checkout_sessions")
      .update({
        status: checkoutStatus,
        stripe_payment_intent_id: input.paymentIntent.id,
        claim_token: null,
        claimed_at: null,
        last_error: `${mismatchReason} ${providerDetail}`,
      })
      .eq("booking_id", input.bookingId)
      .eq("stripe_checkout_session_id", input.session.id)
      .eq("operational_mode", input.operationalMode)
      .eq("stripe_livemode", input.expectedLivemode)
      .eq("stripe_payment_intent_id", input.paymentIntent.id)
      .in("status", ["manual_review", "failed"])
      .select("booking_id")
      .maybeSingle<{ booking_id: string }>();
    if (checkoutError || !finalCheckout) {
      finalCheckoutError = checkoutError ?? new Error(
        "The exact Checkout state changed during payment-mismatch containment.",
      );
    }
  }

  if (!exactCheckoutBinding || !blockedApproval) {
    console.error("Payment mismatch required a fail-closed finance review", {
      bookingId: input.bookingId,
      checkoutSessionId: input.session.id,
      exactCheckoutBinding,
      approvalWasApproved: Boolean(blockedApproval),
    });
  }

  const persistenceError =
    finalReviewError || approvalError || finalCheckoutError;
  if (persistenceError) {
    throw new Error(
      `Stripe mismatch containment ran, but its durable fail-closed state is incomplete: ${persistenceError.message}`,
    );
  }

  return { ok: false as const, reason: outcome };
}

export async function markBookingPaidFromCheckoutSession(
  session: Stripe.Checkout.Session,
  verifiedStripeClient?: Stripe,
) {
  const bookingId = session.metadata?.bookingId || session.client_reference_id;
  if (!bookingId) {
    return { ok: false as const, reason: "not-paid" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const stripe = verifiedStripeClient ?? getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId)
    : null;
  const manualCapture = paymentIntent?.capture_method === "manual";
  if (
    (!manualCapture && session.payment_status !== "paid") ||
    (manualCapture && !["requires_capture", "succeeded", "canceled"].includes(paymentIntent.status))
  ) {
    return { ok: false as const, reason: "not-paid" };
  }

  const paidAt = new Date().toISOString();

  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();

  if (loadError) throw loadError;
  if (!existing) throw new Error(`Booking not found for Stripe session: ${bookingId}`);

  const recordCapturedModeReview = async (reason: string, key: string) => {
    if (paymentIntent?.status !== "succeeded" && session.payment_status !== "paid") {
      return;
    }
    const { error } = await supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: bookingId,
        kind: "manual_adjustment",
        amount_cents: session.amount_total ?? paymentIntent?.amount_received ?? 0,
        currency: session.currency || paymentIntent?.currency || "usd",
        reason,
        idempotency_key: key,
        status: "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  };

  if (!isOperationalMode(existing.operational_mode)) {
    if (paymentIntent?.status === "requires_capture") {
      await stripe.paymentIntents.cancel(paymentIntent.id, {}, {
        idempotencyKey: `travelyt-cancel-unclassified:${bookingId}:${paymentIntent.id}`,
      }).catch((error) => {
        console.error("Stripe unclassified-booking authorization cancellation failed", error);
      });
    }
    await recordCapturedModeReview(
      "Payment reached Stripe for a legacy booking with no classified operating mode. Custody remains blocked; refund/manual review is required.",
      `unclassified-payment:${session.id}`,
    );
    const { error: unclassifiedStateError } = await supabase
      .from("booking_checkout_sessions")
      .update({
        status:
          paymentIntent?.status === "succeeded" || session.payment_status === "paid"
            ? "manual_review"
            : "expired",
        claim_token: null,
        claimed_at: null,
        last_error: "Booking operating mode is unclassified; payment and custody are blocked.",
      })
      .eq("booking_id", bookingId);
    if (unclassifiedStateError) throw unclassifiedStateError;
    return { ok: false as const, reason: "payment-mode-mismatch" };
  }
  const expectedLivemode = stripeLivemodeForOperationalMode(
    existing.operational_mode,
  );
  const paymentModeMatches = Boolean(
    paymentIntent &&
      session.livemode === expectedLivemode &&
      paymentIntent.livemode === expectedLivemode &&
      session.metadata?.operationalMode === existing.operational_mode &&
      paymentIntent.metadata?.operationalMode === existing.operational_mode
  );
  if (!paymentModeMatches) {
    if (paymentIntent?.status === "requires_capture") {
      await stripe.paymentIntents.cancel(paymentIntent.id, {}, {
        idempotencyKey: `travelyt-cancel-mode-mismatch:${bookingId}:${paymentIntent.id}`,
      }).catch((error) => {
        console.error("Stripe mode-mismatch authorization cancellation failed", error);
      });
    }
    await recordCapturedModeReview(
      "Payment reached Stripe in a live/test mode that did not match the booking. Custody remains blocked; refund/manual review is required.",
      `mode-mismatch-payment:${session.id}`,
    );
    const { error: checkoutModeError } = await supabase
      .from("booking_checkout_sessions")
      .update({
        status: "manual_review",
        claim_token: null,
        claimed_at: null,
        last_error: "Stripe live/test mode did not match the booking operating mode.",
      })
      .eq("booking_id", bookingId);
    if (checkoutModeError) throw checkoutModeError;
    console.error("Stripe payment mode mismatch", {
      bookingId,
      checkoutSessionId: session.id,
      bookingOperationalMode: existing.operational_mode,
      sessionLivemode: session.livemode,
      paymentIntentLivemode: paymentIntent?.livemode,
    });
    return { ok: false as const, reason: "payment-mode-mismatch" };
  }
  if (!paymentIntent) {
    throw new Error("Stripe payment mode validation passed without a PaymentIntent.");
  }

  const { data: checkoutState, error: checkoutStateError } = await supabase
    .from("booking_checkout_sessions")
    .select("stripe_checkout_session_id, stripe_payment_intent_id, status, operational_mode, stripe_livemode, captured_at, last_error")
    .eq("booking_id", bookingId)
    .maybeSingle<BookingCheckoutState>();
  if (checkoutStateError) throw checkoutStateError;

  const expectedCurrency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
  if (
    session.amount_total !== existing.price_cents ||
    session.currency?.toLowerCase() !== expectedCurrency ||
    (paymentIntent &&
      (paymentIntent.amount !== existing.price_cents ||
        paymentIntent.currency.toLowerCase() !== expectedCurrency))
  ) {
    console.error("Stripe payment amount or currency mismatch", {
      bookingId,
      checkoutSessionId: session.id,
      expectedAmountCents: existing.price_cents,
      actualAmountCents: session.amount_total,
      expectedCurrency,
      actualCurrency: session.currency,
      paymentIntentAmountCents: paymentIntent?.amount,
      paymentIntentCurrency: paymentIntent?.currency,
    });
    return containPaymentMismatch({
      bookingId,
      session,
      paymentIntent,
      checkoutState,
      operationalMode: existing.operational_mode,
      expectedLivemode,
      expectedAmountCents: existing.price_cents,
      expectedCurrency,
      stripe,
      supabase,
    });
  }
  if (paymentIntent.status === "canceled") {
    return { ok: false as const, reason: "not-paid" };
  }

  const exactPaidReplay = Boolean(
    Boolean(existing.paid_at) &&
      paymentIntent?.status === "succeeded" &&
      checkoutState?.status === "paid" &&
      checkoutState.captured_at &&
      checkoutState.stripe_checkout_session_id === session.id &&
      checkoutState.stripe_payment_intent_id === paymentIntent.id &&
      checkoutState.operational_mode === existing.operational_mode &&
      checkoutState.stripe_livemode === expectedLivemode
  );
  if (exactPaidReplay && paymentIntent) {
    const compensation = await findCaptureFinalizationCompensation({
      bookingId,
      paymentIntent,
      stripe,
      supabase,
    });
    if (compensation) {
      const [checkoutReview, approvalExpiry] = await Promise.all([
        supabase
          .from("booking_checkout_sessions")
          .update({
            status: "manual_review",
            claim_token: null,
            claimed_at: null,
            last_error: compensation.detail,
          })
          .eq("booking_id", bookingId)
          .eq("stripe_checkout_session_id", session.id)
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("status", "paid"),
        supabase
          .from("bookings")
          .update({
            pilot_eligibility_status: "expired",
            pilot_eligibility_expires_at: null,
            pilot_eligibility_reason:
              "Custody is blocked because payment compensation requires financial reconciliation.",
          })
          .eq("id", bookingId),
      ]);
      if (checkoutReview.error) throw checkoutReview.error;
      if (approvalExpiry.error) throw approvalExpiry.error;
      return {
        ok: false as const,
        reason:
          compensation.status === "succeeded"
            ? "capture-finalization-refunded" as const
            : "capture-finalization-refund-pending" as const,
        refundId: compensation.refundId,
      };
    }
    const booking = rowToBooking(existing);
    const paidSession = await stripe.checkout.sessions.retrieve(session.id);
    await sendBookingPaymentConfirmation({
      booking,
      session: paidSession,
      confirmedPaymentIntent: paymentIntent,
      siteUrl: getSiteUrl(),
    });
    return { ok: true as const, booking };
  }

  const exactCaptureFinalizationReview = Boolean(
    paymentIntent.status === "succeeded" &&
      checkoutState?.status === "manual_review" &&
      checkoutState.captured_at &&
      checkoutState.stripe_checkout_session_id === session.id &&
      checkoutState.stripe_payment_intent_id === paymentIntent.id &&
      checkoutState.operational_mode === existing.operational_mode &&
      checkoutState.stripe_livemode === expectedLivemode &&
      checkoutState.last_error?.startsWith(
        "Stripe captured an authorized payment, but",
      )
  );
  if (exactCaptureFinalizationReview) {
    const retryReason =
      "Stripe captured an authorized payment, but booking finalization remains unresolved. The exact idempotent full refund must reconcile before any receipt or custody action.";
    const { data: reviewEvent, error: reviewEventError } = await supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: bookingId,
        kind: "manual_adjustment",
        amount_cents: paymentIntent.amount_received,
        currency: paymentIntent.currency,
        reason: retryReason,
        idempotency_key: `capture-finalization:${paymentIntent.id}`,
        status: "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
      })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (reviewEventError || !reviewEvent) {
      throw reviewEventError || new Error(
        "Could not restore the durable capture-finalization review ledger.",
      );
    }

    const refund = await attemptCaptureFinalizationRefund({
      bookingId,
      checkoutSessionId: session.id,
      paymentIntent,
      stripe,
      supabase,
    });
    const { data: reviewState, error: reviewStateError } = await supabase
      .from("booking_checkout_sessions")
      .update({
        status: "manual_review",
        claim_token: null,
        claimed_at: null,
        last_error: `${retryReason} ${refund.detail}`,
      })
      .eq("booking_id", bookingId)
      .eq("stripe_checkout_session_id", session.id)
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .eq("operational_mode", existing.operational_mode)
      .eq("stripe_livemode", expectedLivemode)
      .eq("status", "manual_review")
      .select("booking_id")
      .maybeSingle<{ booking_id: string }>();
    if (reviewStateError || !reviewState) {
      throw reviewStateError || new Error(
        "Capture-finalization refund reconciled, but the exact review state changed.",
      );
    }
    const { error: approvalError } = await supabase
      .from("bookings")
      .update({
        pilot_eligibility_status: "expired",
        pilot_eligibility_expires_at: null,
        pilot_eligibility_reason:
          "Custody is blocked because captured-payment compensation requires financial reconciliation.",
      })
      .eq("id", bookingId)
      .eq("operational_mode", existing.operational_mode);
    if (approvalError) throw approvalError;
    return {
      ok: false as const,
      reason:
        refund.status === "succeeded"
          ? "capture-finalization-refunded" as const
          : "capture-finalization-refund-pending" as const,
      refundId: refund.refundId,
    };
  }

  const configuredMode = configuredOperationalMode();
  if (configuredMode !== existing.operational_mode) {
    if (paymentIntent?.status === "requires_capture") {
      await stripe.paymentIntents.cancel(paymentIntent.id, {}, {
        idempotencyKey: `travelyt-cancel-operations-paused:${bookingId}:${paymentIntent.id}`,
      }).catch((error) => {
        console.error("Stripe paused-operations authorization cancellation failed", error);
      });
    }
    await recordCapturedModeReview(
      "Payment reached Stripe after Travelyt's active operating mode changed. Custody remains blocked; refund/manual review is required.",
      `operations-paused-payment:${session.id}`,
    );
    const { error: pausedStateError } = await supabase
      .from("booking_checkout_sessions")
      .update({
        status:
          paymentIntent?.status === "succeeded" || session.payment_status === "paid"
            ? "manual_review"
            : "expired",
        claim_token: null,
        claimed_at: null,
        last_error: "The booking no longer matches Travelyt's active operating mode.",
      })
      .eq("booking_id", bookingId);
    if (pausedStateError) throw pausedStateError;
    return { ok: false as const, reason: "operations-paused" };
  }

  if (
    checkoutState &&
    (checkoutState.status === "manual_review" ||
      checkoutState.stripe_checkout_session_id !== session.id ||
      checkoutState.operational_mode !== existing.operational_mode ||
      checkoutState.stripe_livemode !== expectedLivemode)
  ) {
    const { error: reviewError } = await supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: bookingId,
        kind: "manual_adjustment",
        amount_cents: session.amount_total,
        currency: session.currency || expectedCurrency,
        reason:
          "Stripe Checkout Session did not match the single mode-bound session recorded for this booking.",
        idempotency_key: `duplicate-checkout:${session.id}`,
        status: "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
        ignoreDuplicates: true,
      });
    if (reviewError) throw reviewError;
    if (checkoutState.status !== "manual_review") {
      const { error: stateError } = await supabase
        .from("booking_checkout_sessions")
        .update({
          status: "manual_review",
          last_error: "A different or cross-mode Checkout Session requires manual review.",
        })
        .eq("booking_id", bookingId);
      if (stateError) throw stateError;
    }
    return { ok: false as const, reason: "checkout-session-mismatch" };
  }

  if (!manualCapture && existing.status === "pending") {
    const { error: legacyEventError } = await supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: bookingId,
        kind: "manual_adjustment",
        amount_cents: session.amount_total,
        currency: session.currency || expectedCurrency,
        reason:
          "Legacy automatic-capture Checkout paid before Travelyt's final identity revalidation. Refund/manual review required; custody remains blocked.",
        idempotency_key: `legacy-auto-capture:${session.id}`,
        status: "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
        ignoreDuplicates: true,
      });
    if (legacyEventError) throw legacyEventError;
    return { ok: false as const, reason: "legacy-automatic-capture" };
  }

  const { data: identityEvidenceCurrent, error: identityEvidenceError } =
    await supabase.rpc("booking_has_current_identity", {
      p_booking_id: bookingId,
    });
  if (identityEvidenceError) throw identityEvidenceError;
  if (identityEvidenceCurrent !== true) {
    if (paymentIntent?.status === "requires_capture") {
      await stripe.paymentIntents.cancel(paymentIntent.id, {}, {
        idempotencyKey: `travelyt-cancel-invalid-identity:${bookingId}:${paymentIntent.id}`,
      }).catch((error) => {
        console.error("Stripe authorization cancellation failed", error);
      });
    }
    const { error: reviewEventError } = await supabase
      .from("booking_financial_events")
      .upsert({
        booking_id: bookingId,
        kind: "manual_adjustment",
        amount_cents: session.amount_total,
        currency: session.currency || expectedCurrency,
        reason:
          "Payment arrived after the identity evidence required for this booking mode became invalid. Do not activate custody; refund/manual review is required.",
        idempotency_key: `identity-invalid-payment:${session.id}`,
        status: "manual_review",
        requested_by: "stripe_reconciliation",
      }, {
        onConflict: "booking_id,idempotency_key",
        ignoreDuplicates: true,
      });
    if (reviewEventError) throw reviewEventError;
    const [checkoutReview, approvalExpiry] = await Promise.all([
      supabase
        .from("booking_checkout_sessions")
        .update({
          status: "manual_review",
          claim_token: null,
          claimed_at: null,
          last_error:
            "Paid session arrived without current complete mode-matched identity evidence.",
        })
        .eq("booking_id", bookingId),
      supabase
        .from("bookings")
        .update({
          pilot_eligibility_status: "expired",
          pilot_eligibility_expires_at: null,
          pilot_eligibility_snapshot: {
            ...(existing.pilot_eligibility_snapshot ?? {}),
            eligibleTraveler: false,
            identityEvidenceMode: "missing_or_nonlive",
            identityEvidenceRevalidatedAt: new Date().toISOString(),
          },
          pilot_eligibility_reason:
            "Payment requires manual review because current complete mode-matched identity evidence is missing.",
        })
        .eq("id", bookingId)
        .eq("status", "pending"),
    ]);
    if (checkoutReview.error) throw checkoutReview.error;
    if (approvalExpiry.error) throw approvalExpiry.error;
    console.error("Paid Stripe session blocked by identity revalidation", {
      bookingId,
      checkoutSessionId: session.id,
    });
    return { ok: false as const, reason: "identity-invalid-at-payment" };
  }

  if (manualCapture && paymentIntent) {
    let capturedIntent = paymentIntent;
    if (capturedIntent.status === "requires_capture") {
      if (configuredOperationalMode() !== existing.operational_mode) {
        await stripe.paymentIntents.cancel(capturedIntent.id, {}, {
          idempotencyKey: `travelyt-cancel-operations-paused:${bookingId}:${capturedIntent.id}`,
        }).catch((error) => {
          console.error("Stripe paused-operations authorization cancellation failed", error);
        });
        const { error: pausedStateError } = await supabase
          .from("booking_checkout_sessions")
          .update({
            status: "expired",
            claim_token: null,
            claimed_at: null,
            last_error: "Card authorization was canceled because the active operating mode changed.",
          })
          .eq("booking_id", bookingId)
          .eq("stripe_checkout_session_id", session.id);
        if (pausedStateError) throw pausedStateError;
        return { ok: false as const, reason: "operations-paused" };
      }
      const { data: captureAuthorized, error: captureAuthorizationError } =
        await supabase.rpc("authorize_booking_payment_capture", {
          p_booking_id: bookingId,
          p_checkout_session_id: session.id,
          p_payment_intent_id: capturedIntent.id,
          p_stripe_livemode: capturedIntent.livemode,
        });
      if (captureAuthorizationError) throw captureAuthorizationError;
      if (captureAuthorized !== true) {
        await stripe.paymentIntents.cancel(capturedIntent.id, {}, {
          idempotencyKey: `travelyt-cancel-unauthorized:${bookingId}:${capturedIntent.id}`,
        }).catch((error) => {
          console.error("Stripe authorization cancellation failed", error);
        });
        const { error: authorizationStateError } = await supabase
          .from("booking_checkout_sessions")
          .update({
            status: "expired",
            claim_token: null,
            claimed_at: null,
            last_error:
              "Card authorization was canceled because current payment gates did not pass.",
          })
          .eq("booking_id", bookingId)
          .eq("stripe_checkout_session_id", session.id);
        if (authorizationStateError) throw authorizationStateError;
        return { ok: false as const, reason: "capture-not-authorized" };
      }
      capturedIntent = await stripe.paymentIntents.capture(
        capturedIntent.id,
        {},
        { idempotencyKey: `travelyt-capture:${bookingId}:${capturedIntent.id}` },
      );
    }
    if (capturedIntent.status !== "succeeded") {
      return { ok: false as const, reason: "not-paid" };
    }
    const { data: finalized, error: finalizeError } = await supabase.rpc(
      "finalize_booking_payment_capture",
      {
        p_booking_id: bookingId,
        p_checkout_session_id: session.id,
        p_payment_intent_id: capturedIntent.id,
        p_stripe_livemode: capturedIntent.livemode,
      },
    );
    let paymentFinalized = !finalizeError && finalized === true;
    if (!paymentFinalized) {
      // A database/network error is not proof the transaction rolled back.
      // Read the exact booking and checkout binding before refunding a charge
      // that may already have finalized successfully.
      const [bookingReadback, checkoutReadback] = await Promise.all([
        supabase
          .from("bookings")
          .select("paid_at, operational_mode")
          .eq("id", bookingId)
          .maybeSingle<{ paid_at: string | null; operational_mode: string | null }>(),
        supabase
          .from("booking_checkout_sessions")
          .select("stripe_checkout_session_id, stripe_payment_intent_id, status, operational_mode, stripe_livemode, captured_at")
          .eq("booking_id", bookingId)
          .maybeSingle<{
            stripe_checkout_session_id: string | null;
            stripe_payment_intent_id: string | null;
            status: string;
            operational_mode: string | null;
            stripe_livemode: boolean | null;
            captured_at: string | null;
          }>(),
      ]);
      paymentFinalized = Boolean(
        !bookingReadback.error &&
          !checkoutReadback.error &&
          bookingReadback.data?.paid_at &&
          bookingReadback.data.operational_mode === existing.operational_mode &&
          checkoutReadback.data?.status === "paid" &&
          checkoutReadback.data.captured_at &&
          checkoutReadback.data.stripe_checkout_session_id === session.id &&
          checkoutReadback.data.stripe_payment_intent_id === capturedIntent.id &&
          checkoutReadback.data.operational_mode === existing.operational_mode &&
          checkoutReadback.data.stripe_livemode === capturedIntent.livemode
      );
    }
    if (!paymentFinalized) {
      const capturedAt = new Date().toISOString();
      const finalizationFailureReason =
        finalizeError
          ? `Stripe captured an authorized payment, but atomic booking finalization errored: ${finalizeError.message}`
          : "Stripe captured an authorized payment, but the atomic booking finalization did not complete.";
      const [checkoutReview, reviewEvent] = await Promise.all([
        supabase
          .from("booking_checkout_sessions")
          .update({
            status: "manual_review",
            captured_at: capturedAt,
            claim_token: null,
            claimed_at: null,
            last_error: finalizationFailureReason,
          })
          .eq("booking_id", bookingId)
          .eq("stripe_checkout_session_id", session.id)
          .eq("stripe_payment_intent_id", capturedIntent.id)
          .eq("status", "capture_authorized")
          .select("booking_id")
          .maybeSingle<{ booking_id: string }>(),
        supabase
          .from("booking_financial_events")
          .upsert({
            booking_id: bookingId,
            kind: "manual_adjustment",
            amount_cents: capturedIntent.amount_received,
            currency: capturedIntent.currency,
            reason: finalizationFailureReason,
            idempotency_key: `capture-finalization:${capturedIntent.id}`,
            status: "manual_review",
            requested_by: "stripe_reconciliation",
          }, {
            onConflict: "booking_id,idempotency_key",
            ignoreDuplicates: true,
          }),
      ]);
      if (checkoutReview.error) {
        console.error("Could not persist captured-payment review state", checkoutReview.error);
      }
      if (reviewEvent.error) {
        console.error("Could not persist captured-payment review event", reviewEvent.error);
      }
      if (!checkoutReview.data) {
        console.error("Captured Stripe payment did not enter manual review via CAS", {
          bookingId,
          checkoutSessionId: session.id,
          paymentIntentId: capturedIntent.id,
        });
      }
      const refund = await attemptCaptureFinalizationRefund({
        bookingId,
        checkoutSessionId: session.id,
        paymentIntent: capturedIntent,
        stripe,
        supabase,
      });
      const { error: refundStateError } = await supabase
        .from("booking_checkout_sessions")
        .update({
          status: "manual_review",
          claim_token: null,
          claimed_at: null,
          last_error: `${finalizationFailureReason} ${refund.detail}`,
        })
        .eq("booking_id", bookingId)
        .eq("stripe_checkout_session_id", session.id)
        .eq("stripe_payment_intent_id", capturedIntent.id);
      if (refundStateError) {
        console.error("Could not persist compensating-refund checkout state", refundStateError);
      }
      return {
        ok: false as const,
        reason:
          refund.status === "succeeded"
            ? "capture-finalization-refunded" as const
            : "capture-finalization-refund-pending" as const,
        refundId: refund.refundId,
      };
    }

    const { data: capturedBooking, error: capturedBookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single<BookingRow>();
    if (capturedBookingError) throw capturedBookingError;
    if (existing.status === "pending") {
      await queueBookingNotification(capturedBooking, "status");
    }
    const booking = rowToBooking(capturedBooking);
    const paidSession = await stripe.checkout.sessions.retrieve(session.id);
    await sendBookingPaymentConfirmation({
      booking,
      session: paidSession,
      siteUrl: getSiteUrl(),
      confirmedPaymentIntent: capturedIntent,
    });
    return { ok: true as const, booking };
  }

  if (!checkoutState) {
    const { error: insertCheckoutError } = await supabase
      .from("booking_checkout_sessions")
      .insert({
        booking_id: bookingId,
        stripe_checkout_session_id: session.id,
        status: "paid",
        operational_mode: existing.operational_mode,
        stripe_livemode: session.livemode,
        attempts: 1,
      });
    if (insertCheckoutError) throw insertCheckoutError;
  } else {
    const { error: updateCheckoutError } = await supabase
      .from("booking_checkout_sessions")
      .update({
        status: "paid",
        operational_mode: existing.operational_mode,
        stripe_livemode: session.livemode,
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
