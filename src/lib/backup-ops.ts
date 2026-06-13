import type { Booking, BookingStatus } from "@/lib/bookings";

export const BACKUP_ACTIVE_STATUSES: BookingStatus[] = [
  "paid",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
  "issue",
];

export const BACKUP_STATUS_OPTIONS: BookingStatus[] = [
  "paid",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
  "delivered",
  "closed",
  "cancelled",
  "issue",
];

export const BACKUP_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Quote request received",
  paid: "Paid - ready for dispatch",
  assigned: "Driver assigned",
  accepted: "Driver accepted",
  en_route: "Driver en route",
  arrived: "Driver arrived",
  picked_up: "Bags picked up",
  in_transit: "In transit / airline accepted",
  delivery_pending: "Delivery pending customer confirmation",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
  issue: "Issue / failed",
};

export const BACKUP_SERVICE_LABELS: Record<Booking["service"], string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};

export const BACKUP_LOG_CATEGORIES = [
  { value: "note", label: "General note" },
  { value: "status", label: "Manual status step" },
  { value: "proof", label: "Proof received outside app" },
  { value: "customer", label: "Customer contact" },
  { value: "driver", label: "Driver contact" },
  { value: "payment", label: "Payment fallback" },
] as const;

export type BackupLogCategory = (typeof BACKUP_LOG_CATEGORIES)[number]["value"];

export const FAILURE_PLAYBOOKS = [
  {
    title: "Customer app or tracking link down",
    owner: "Admin / dispatcher",
    firstCheck: "Confirm the booking is visible in Backup Ops and copy the customer phone/email.",
    steps: [
      "Text or call the customer with the current booking status.",
      "Send proof photos manually if the customer cannot open tracking.",
      "Record customer approval or dispute in the emergency log.",
      "Keep the driver moving only when custody approval is clear.",
    ],
  },
  {
    title: "Driver portal down",
    owner: "Dispatcher",
    firstCheck: "Open the booking run sheet and confirm driver assignment, pickup address, flight, and customer phone.",
    steps: [
      "Send the driver the run sheet details by text.",
      "Ask for live location share or GPS screenshot at route start and arrival.",
      "Ask for bag/seal and handoff photos by text.",
      "Record each received proof in the emergency log with time and seal ID.",
    ],
  },
  {
    title: "Admin portal down",
    owner: "Backup ops lead",
    firstCheck: "Use Backup Ops as the command surface and export active bookings.",
    steps: [
      "Open the active booking list and sort by travel time.",
      "Work one run sheet at a time.",
      "Use emergency log entries instead of normal admin status controls.",
      "Export the CSV after major updates so a copy exists outside the browser.",
    ],
  },
  {
    title: "Stripe checkout or payment uncertainty",
    owner: "Finance / admin",
    firstCheck: "Check Stripe dashboard for payment intent, checkout session, refund, or failed payment status.",
    steps: [
      "Do not begin custody if payment is unknown unless admin approves manual exception.",
      "Send a manual Stripe payment link if app checkout fails.",
      "Record payment status and Stripe reference in Backup Ops.",
      "Refund or cancel from Stripe if service cannot be performed.",
    ],
  },
  {
    title: "GPS or photo upload fails",
    owner: "Driver plus dispatcher",
    firstCheck: "Confirm the driver can send text photos and a location screenshot.",
    steps: [
      "Driver sends bag/seal photo by text.",
      "Driver sends current map location or live location share.",
      "Dispatcher records the fallback proof in emergency log.",
      "When the normal app returns, admin reconciles proof into the booking record.",
    ],
  },
  {
    title: "Database or hosting issue",
    owner: "Technical admin",
    firstCheck: "Use the latest exported run sheets and CSV while diagnosing Vercel/Supabase.",
    steps: [
      "Freeze nonessential changes until the data path is known.",
      "Operate active jobs by phone/text from the latest export.",
      "Record new updates in a local shared note until the database returns.",
      "Reconcile every manual update back into Backup Ops once service is restored.",
    ],
  },
  {
    title: "Airline or airport refuses handoff",
    owner: "Dispatcher",
    firstCheck: "Collect the receiving party name, organization, counter, and reason for refusal.",
    steps: [
      "Driver stays with bags until dispatcher gives instructions.",
      "Record refusal details and any badge/reference in emergency log.",
      "Call customer with options: wait, redirect, cancel, or return bags.",
      "Escalate refund/claim decision if custody cannot continue.",
    ],
  },
];

export function formatBackupMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatBackupTime(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export function backupTrackingUrl(booking: Booking) {
  return booking.customerAccessToken
    ? `https://travelyt.us/track/${booking.id}?token=${booking.customerAccessToken}`
    : `https://travelyt.us/track/${booking.id}`;
}

export function latestSealId(booking: Booking) {
  return [...booking.proofs].reverse().find((proof) => proof.sealId)?.sealId;
}

export function latestProofSummary(booking: Booking) {
  const latest = [...booking.proofs].reverse()[0];
  if (!latest) return "No app proof on file";
  const name = latest.kind.replaceAll("_", " ");
  return `${name} proof at ${formatBackupTime(latest.timestamp)}`;
}

export function isBackupActiveBooking(booking: Booking) {
  return !booking.archivedAt && BACKUP_ACTIVE_STATUSES.includes(booking.status);
}

export function backupNextAction(booking: Booking) {
  if (booking.status === "paid") return "Assign a driver or confirm manual fallback.";
  if (booking.status === "assigned") return "Driver must accept the assigned job.";
  if (booking.status === "accepted") return "Driver starts route and records GPS.";
  if (booking.status === "en_route") return "Driver marks arrival with GPS.";
  if (booking.status === "arrived") return "Capture seal/proof and confirm custody.";
  if (booking.status === "picked_up") {
    return booking.service === "departure"
      ? "Customer approves seal, then driver records airline handoff."
      : "Move bags to delivery or next custody step.";
  }
  if (booking.status === "in_transit") return "Complete delivery or final handoff proof.";
  if (booking.status === "delivery_pending") return "Customer confirms receipt.";
  if (booking.status === "issue") return "Keep job frozen until admin records resolution.";
  return "No active next action.";
}

export function csvCell(value: unknown) {
  const clean = String(value ?? "").replaceAll('"', '""');
  return `"${clean}"`;
}
