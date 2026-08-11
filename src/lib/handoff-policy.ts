export type DepartureHandoffMode =
  | "passenger_present"
  | "carrier_authorized";

type HandoffBooking = {
  externalProvider?: string | null;
  externalReference?: string | null;
  externalStatus?: string | null;
};

const AUTHORIZED_CARRIER_HANDOFF_STATES = new Set([
  "carrier_handoff_authorized",
  "handoff_ready",
]);

// The aircraft operator controls checked-baggage acceptance. Travelyt therefore
// defaults to returning sealed bags to the ticketed traveler at the terminal.
// Passenger-absent airline tender needs an explicit provider authorization.
export function departureHandoffMode(
  booking: HandoffBooking
): DepartureHandoffMode {
  const provider = booking.externalProvider?.trim();
  const reference = booking.externalReference?.trim();
  const status = booking.externalStatus?.trim().toLowerCase();
  return provider && reference && status && AUTHORIZED_CARRIER_HANDOFF_STATES.has(status)
    ? "carrier_authorized"
    : "passenger_present";
}

export function carrierHandoffAuthorized(booking: HandoffBooking) {
  return departureHandoffMode(booking) === "carrier_authorized";
}
