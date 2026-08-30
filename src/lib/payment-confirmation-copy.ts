export interface PaymentConfirmationBooking {
  id: string;
  service: "departure" | "arrival";
  airport: string;
  bags: number;
  email: string;
}

export function buildPaymentConfirmationEmail(
  input: {
    booking: PaymentConfirmationBooking;
    amountCents: number;
    currency: string;
    livemode: boolean;
  },
  siteUrl: string
) {
  const { booking } = input;
  const baseUrl = siteUrl.replace(/\/$/, "");
  const accountUrl = `${baseUrl}/profile`;
  const service =
    booking.service === "departure" ? "Departure Pickup" : "Arrival Delivery";
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: input.currency.toUpperCase(),
  }).format(input.amountCents / 100);

  return {
    subject: `Payment confirmed — ${booking.id}`,
    text: [
      ...(input.livemode
        ? []
        : ["TEST — no real charge. Stripe Sandbox; no real money was charged.", ""]),
      "Your Travelyt payment is confirmed.",
      "",
      `Booking ID: ${booking.id}`,
      `Service: ${service}`,
      `Airport: ${booking.airport}`,
      `Bags: ${booking.bags}`,
      `Amount paid: ${amount}`,
      "",
      `View your account and booking: ${accountUrl}`,
      "",
      "Airline baggage fees are separate and must be paid directly to the airline at check-in.",
    ].join("\n"),
  };
}
