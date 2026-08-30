// Controlled launch operations target a documented terminal handoff three
// hours before departure. Standard mode returns the bags to the traveler; a
// stricter airline or station acceptance requirement always controls.
export const TRAVELYT_HANDOFF_TARGET_MINUTES = 180;

// ORD pilot policy confirmed by Mo on 2026-08-30. Operations are available
// around the clock, but every individual request is still capacity-confirmed
// before checkout; 24/7 availability is not an unlimited-capacity guarantee.
export const ORD_PILOT_AIRPORT = "ORD";
export const ORD_PILOT_ROUTE_BOUNDARY_MILES = 30;
export const ORD_PILOT_MINIMUM_NOTICE_MINUTES = 240;
export const ORD_PILOT_STANDARD_FIELD_HOURS =
  "24 hours daily (Central Time)";
export const ORD_PILOT_STANDARD_FIELD_START_HOUR = 0;
export const ORD_PILOT_STANDARD_FIELD_END_HOUR = 24;
export const ORD_PILOT_CAPACITY_RULE = "Confirmed per booking";
export const ORD_PILOT_DEPARTURE_PICKUP_WINDOW_MINUTES = 60;
export const ORD_PILOT_ARRIVAL_TARGET_MINUTES = 240;
export const ORD_PILOT_ARRIVAL_MAX_MINUTES = 360;
export const ORD_PILOT_STANDARD_ARRIVAL_CUSTODY_CUTOFF_HOUR = 24;

export const ORD_PILOT_DEPARTURE_SLA =
  "Pickup occurs in the confirmed 60-minute window, and sealed bags are returned to the ticketed traveler at the approved public-terminal meeting point at least three hours before departure. Earlier carrier or station rules control.";

export const ORD_PILOT_ARRIVAL_SLA =
  "Where airport release is authorized and baggage is made available normally, delivery is targeted within four to six hours of actual landing. Travelyt's accountable custody clock begins at the custody-accepted scan; release delays outside Travelyt's control are recorded as exceptions, not hidden.";

export const AIRLINE_CUTOFF_COPY =
  "Pickup timing is confirmed from airport distance, traffic, and airline baggage acceptance rules.";

export const AIRLINE_CUTOFF_DETAIL =
  "Controlled launch operations require at least four hours' notice and use a route-aware cutoff. Travelyt targets terminal handoff at least three hours before departure. Standard service returns the bags to the ticketed traveler for airline check-in. Airline- or station-specific earlier requirements always control.";
