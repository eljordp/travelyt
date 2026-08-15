import type { BookingRow } from "@/lib/booking-mappers";
import { validateTravelDateTime } from "@/lib/booking-time";
import { passengerManifestCustodyBlockers } from "@/lib/passengers";

export const DEFAULT_ACCEPTANCE_MINUTES = 10;
export const MIN_ACCEPTANCE_MINUTES = 5;
export const MAX_ACCEPTANCE_MINUTES = 60;

export type AgentReadinessProfileRow = {
  driver_access_id: string;
  status: "pending" | "active" | "suspended";
  identity_evidence_reference: string | null;
  identity_verified_at: string | null;
  identity_expires_at: string | null;
  training_evidence_reference: string | null;
  training_completed_at: string | null;
  training_expires_at: string | null;
  insurance_evidence_reference: string | null;
  insurance_verified_at: string | null;
  insurance_expires_at: string | null;
  vehicle_make_model: string | null;
  license_plate: string | null;
  vehicle_evidence_reference: string | null;
  vehicle_verified_at: string | null;
  vehicle_expires_at: string | null;
  notes: string | null;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type DriverAccessReadinessRow = {
  id: string;
  driver_name: string;
  canonical_driver_name: string;
  driver_email: string | null;
  driver_phone: string | null;
  person_key_hash: string;
  status: "active" | "revoked" | "expired";
  expires_at: string | null;
};

export type AcceptanceChecklist = {
  availabilityConfirmed: boolean;
  deviceReady: boolean;
  sealKitReady: boolean;
  vehicleReady: boolean;
};

export type AgentAssignmentRow = {
  id: string;
  booking_id: string;
  primary_driver_access_id: string;
  backup_driver_access_id: string;
  status: "assigned" | "accepted" | "declined" | "expired" | "superseded" | "revoked";
  assigned_by: string;
  assigned_at: string;
  acceptance_due_at: string;
  accepted_at: string | null;
  accepted_by_driver_access_id: string | null;
  acceptance_checklist: Partial<AcceptanceChecklist> | null;
  decline_reason: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

function validPastOrNow(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && parsed <= now.getTime();
}

function validFuture(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && parsed > now.getTime();
}

function hasReference(value: string | null | undefined) {
  return Boolean(value?.trim() && value.trim().length >= 3);
}

export function agentReadinessBlockers(
  access: DriverAccessReadinessRow | null | undefined,
  profile: AgentReadinessProfileRow | null | undefined,
  now = new Date(),
) {
  const blockers: string[] = [];
  if (!access) return ["Individual agent access record is missing."];
  if (access.status !== "active" || (access.expires_at && !validFuture(access.expires_at, now))) {
    blockers.push("Individual agent access is not active.");
  }
  if (!profile) return [...blockers, "Agent readiness evidence has not been recorded."];
  if (profile.status !== "active") blockers.push("Agent readiness status is not active.");
  if (!hasReference(profile.identity_evidence_reference) ||
      !profile.identity_evidence_reference?.startsWith("stripe_identity:") ||
      !validPastOrNow(profile.identity_verified_at, now) ||
      (Boolean(profile.identity_expires_at) && !validFuture(profile.identity_expires_at, now))) {
    blockers.push("Agent identity evidence is missing or expired.");
  }
  if (!hasReference(profile.training_evidence_reference) ||
      !validPastOrNow(profile.training_completed_at, now) ||
      !validFuture(profile.training_expires_at, now)) {
    blockers.push("Agent training evidence is missing or expired.");
  }
  if (!hasReference(profile.insurance_evidence_reference) ||
      !validPastOrNow(profile.insurance_verified_at, now) ||
      !validFuture(profile.insurance_expires_at, now)) {
    blockers.push("Agent insurance coverage evidence is missing or expired.");
  }
  if (!profile.vehicle_make_model?.trim() || !profile.license_plate?.trim() ||
      !hasReference(profile.vehicle_evidence_reference) ||
      !validPastOrNow(profile.vehicle_verified_at, now) ||
      !validFuture(profile.vehicle_expires_at, now)) {
    blockers.push("Agent vehicle evidence is missing or expired.");
  }
  return blockers;
}

export function bookingAssignmentBlockers(booking: BookingRow, now = new Date()) {
  const blockers: string[] = [];
  if (booking.status !== "paid") blockers.push("Booking must be paid and confirmed before assignment.");
  if (!booking.paid_at) blockers.push("Payment confirmation timestamp is missing.");
  const scheduleError = validateTravelDateTime(
    booking.travel_date,
    booking.flight_time ?? undefined,
    now,
  );
  if (scheduleError) blockers.push(`${scheduleError}.`);
  if (!booking.restricted_items_attested_at) {
    blockers.push("Customer prohibited-item declaration is incomplete.");
  }
  blockers.push(...passengerManifestCustodyBlockers(
    booking.passenger_manifest,
    Boolean(booking.customer_identity_verified_at),
  ));
  return [...new Set(blockers)];
}

function normalizedContact(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9@+.]/g, "") ?? "";
}

export function differentAgentPersonBlockers(
  primary: DriverAccessReadinessRow | null | undefined,
  backup: DriverAccessReadinessRow | null | undefined,
) {
  if (!primary || !backup) return ["Primary and backup person-bound access records are required."];
  const samePersonKey = Boolean(
    primary.person_key_hash && primary.person_key_hash === backup.person_key_hash,
  );
  const sameEmail = Boolean(
    primary.driver_email &&
      normalizedContact(primary.driver_email) === normalizedContact(backup.driver_email),
  );
  const samePhone = Boolean(
    primary.driver_phone &&
      normalizedContact(primary.driver_phone) === normalizedContact(backup.driver_phone),
  );
  const sameCanonicalName = Boolean(
    primary.canonical_driver_name &&
      primary.canonical_driver_name === backup.canonical_driver_name,
  );
  return samePersonKey || sameEmail || samePhone || sameCanonicalName
    ? ["Primary and backup must be different verified people, not duplicate access records."]
    : [];
}

export function normalizeAcceptanceMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_ACCEPTANCE_MINUTES;
  return Math.min(MAX_ACCEPTANCE_MINUTES, Math.max(MIN_ACCEPTANCE_MINUTES, parsed));
}

export function acceptanceChecklistBlockers(value: unknown) {
  const checklist = value && typeof value === "object"
    ? value as Partial<AcceptanceChecklist>
    : {};
  const blockers: string[] = [];
  if (checklist.availabilityConfirmed !== true) blockers.push("Confirm availability for the assigned schedule.");
  if (checklist.deviceReady !== true) blockers.push("Confirm the assigned device is ready.");
  if (checklist.sealKitReady !== true) blockers.push("Confirm the seal kit is ready.");
  if (checklist.vehicleReady !== true) blockers.push("Confirm the approved vehicle is ready.");
  return blockers;
}

export function assignmentAcceptanceBlockers(input: {
  assignment: AgentAssignmentRow;
  driverAccessId?: string;
  checklist: unknown;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const blockers: string[] = [];
  if (input.assignment.status !== "assigned") {
    blockers.push("This assignment is not awaiting acceptance.");
  }
  if (!input.driverAccessId || input.assignment.primary_driver_access_id !== input.driverAccessId) {
    blockers.push("Only the assigned primary agent can accept this job.");
  }
  if (Date.parse(input.assignment.acceptance_due_at) <= now.getTime()) {
    blockers.push("The acceptance deadline has passed; dispatch must reassign the job.");
  }
  blockers.push(...acceptanceChecklistBlockers(input.checklist));
  return blockers;
}
