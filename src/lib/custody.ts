import { randomInt } from "crypto";
import {
  agentReadinessBlockers,
  type AgentReadinessProfileRow,
  type DriverAccessReadinessRow,
} from "@/lib/agent-assignment";
import { passengerManifestCustodyBlockers } from "@/lib/passengers";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export type CustodyEventType =
  | "bag_registered"
  | "custody_accepted"
  | "route_checkpoint"
  | "traveler_return"
  | "recipient_delivery"
  | "recipient_confirmed"
  | "operations_close_override"
  | "carrier_transfer"
  | "exception_opened"
  // Legacy event names remain readable for previously sealed records.
  | "badge_issued"
  | "picked_up"
  | "in_transit"
  | "security_handoff"
  | "delivered"
  | "exception";

export type ActorRole =
  | "traveler"
  | "agent"
  | "operations"
  | "recipient"
  | "carrier"
  // Legacy actor names remain readable for previously sealed records.
  | "customer"
  | "driver"
  | "employee"
  | "tsa"
  | "airline"
  | "system";

export type VerifiedMethod =
  | "none"
  | "access_code"
  | "account_session"
  | "manual_record"
  | "employee_credential"
  | "provider_assertion"
  | "id_document"
  | "facial_liveness"
  | "confirmation_code";

export type BagStatus =
  | "issued"
  | "in_custody"
  | "handed_off"
  | "delivered"
  | "exception";

export type ModernCustodyEventType =
  | "bag_registered"
  | "custody_accepted"
  | "route_checkpoint"
  | "traveler_return"
  | "recipient_delivery"
  | "recipient_confirmed"
  | "operations_close_override"
  | "carrier_transfer"
  | "exception_opened";

export interface Bag {
  id: string;
  booking_id: string;
  badge_code: string;
  bag_number: number;
  label: string | null;
  description: string | null;
  weight_grams: number | null;
  declared_value_cents: number | null;
  status: BagStatus;
  created_at: string;
  updated_at: string;
}

export interface CustodyEvent {
  id: string;
  bag_id: string;
  booking_id: string;
  badge_code: string;
  seq: number;
  event_type: CustodyEventType;
  actor_role: ActorRole;
  actor_name: string | null;
  identity_verification_id: string | null;
  verified_method: VerifiedMethod;
  photo_path: string | null;
  location_lat: number | null;
  location_lng: number | null;
  note: string | null;
  prev_hash: string;
  event_hash: string;
  created_at: string;
}

export interface ChainVerification {
  ok: boolean;
  broken_seq: number | null;
  total: number;
}

export const EVENT_LABELS: Record<CustodyEventType, string> = {
  bag_registered: "Bag registered",
  custody_accepted: "Custody accepted",
  route_checkpoint: "Route checkpoint",
  traveler_return: "Returned to traveler",
  recipient_delivery: "Delivered to recipient",
  recipient_confirmed: "Recipient confirmed",
  operations_close_override: "Operations close override",
  carrier_transfer: "Authorized carrier transfer",
  exception_opened: "Exception opened",
  badge_issued: "Badge issued",
  picked_up: "Picked up",
  in_transit: "In transit",
  security_handoff: "Legacy carrier transfer",
  delivered: "Delivered",
  exception: "Exception",
};

export const VERIFIED_METHOD_LABELS: Record<VerifiedMethod, string> = {
  none: "Not verified",
  access_code: "Driver access code",
  account_session: "Verified account session",
  manual_record: "Approved manual record",
  employee_credential: "Receiving-party credential",
  provider_assertion: "Approved provider assertion",
  id_document: "Government ID",
  facial_liveness: "Facial liveness",
  confirmation_code: "Confirmation code",
};

// Unambiguous alphabet (no I, O, 0, 1) so codes are easy to read off a label.
const BADGE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function mintBadgeCode(): string {
  let s = "";
  for (let i = 0; i < 6; i += 1) {
    s += BADGE_ALPHABET[randomInt(BADGE_ALPHABET.length)];
  }
  return `TVT-B-${s}`;
}

export async function getBagByBadge(badgeCode: string): Promise<Bag | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("bags")
    .select("*")
    .eq("badge_code", badgeCode)
    .maybeSingle();
  if (error || !data) return null;
  return data as Bag;
}

export async function getBagsForBooking(bookingId: string): Promise<Bag[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("bags")
    .select("*")
    .eq("booking_id", bookingId)
    .order("bag_number", { ascending: true });
  if (error || !data) return [];
  return data as Bag[];
}

export async function bookingAccessTokenMatches(
  bookingId: string,
  token: string
): Promise<boolean> {
  const cleanToken = token.trim();
  const supabase = getSupabaseAdmin();
  if (!bookingId || !cleanToken || !supabase) return false;

  const { data, error } = await supabase
    .from("bookings")
    .select("customer_access_token")
    .eq("id", bookingId)
    .maybeSingle();

  return Boolean(
    !error &&
      data?.customer_access_token &&
      data.customer_access_token === cleanToken
  );
}

export async function getCustodyChain(bagId: string): Promise<CustodyEvent[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("custody_events")
    .select("*")
    .eq("bag_id", bagId)
    .order("seq", { ascending: true });
  if (error || !data) return [];
  return data as CustodyEvent[];
}

export async function verifyChain(bagId: string): Promise<ChainVerification> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, broken_seq: null, total: 0 };
  const { data, error } = await supabase.rpc("verify_custody_chain", {
    p_bag_id: bagId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { ok: false, broken_seq: null, total: 0 };
  return {
    ok: Boolean(row.ok),
    broken_seq: row.broken_seq ?? null,
    total: row.total ?? 0,
  };
}

export interface CustodySealEvidence {
  bagIndex: number;
  sealId: string;
  sealMethod: "zipper" | "latch_label" | "handle";
  sealStatus: "intact" | "broken" | "replaced";
  proofCheckpointKey: string;
  proofStoragePath: string;
}

export interface RecordCustodyCheckpointInput {
  bookingId: string;
  checkpointKey: string;
  expectedBagCount: number;
  eventType: ModernCustodyEventType;
  actorRole: ActorRole;
  actorName?: string | null;
  driverAccessId?: string | null;
  identityVerificationId?: string | null;
  verifiedMethod: VerifiedMethod;
  photoPath?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
  seals?: CustodySealEvidence[];
}

export type RecordCustodyCheckpointResult =
  | { ok: true; events: CustodyEvent[]; idempotent: boolean; bookingStatus: string }
  | { ok: false; error: string; code?: string };

const RECORDABLE_CHECKPOINT_EVENT_TYPES = new Set<ModernCustodyEventType>([
  "custody_accepted",
  "traveler_return",
  "recipient_delivery",
  "recipient_confirmed",
  "operations_close_override",
  "carrier_transfer",
]);

type CustodyGateBooking = {
  id: string;
  service: "departure" | "arrival";
  status: string;
  bags: number;
  paid_at: string | null;
  customer_identity_verified_at: string | null;
  driver_identity_verified_at: string | null;
  restricted_items_attested_at: string | null;
  passenger_manifest: unknown;
  proofs: Array<Record<string, unknown>> | null;
  pilot_eligibility_status: string;
  pilot_eligibility_expires_at: string | null;
  external_provider: string | null;
  external_reference: string | null;
  external_status: string | null;
  arrival_release_status: string | null;
  arrival_release_reference: string | null;
  arrival_release_location: string | null;
  arrival_release_authorized_at: string | null;
  arrival_release_authorized_by: string | null;
};

export type DriverCustodyGateResult =
  | { ok: true; driverName: string; booking: CustodyGateBooking; idempotent: boolean }
  | { ok: false; error: string; status: number };

export async function validateDriverCustodyWrite(input: {
  bookingId: string;
  checkpointKey: string;
  driverAccessId: string;
  eventType: ModernCustodyEventType;
  expectedBagCount: number;
}): Promise<DriverCustodyGateResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Custody backend is not configured.", status: 503 };

  const [
    { data: booking, error: bookingError },
    { data: access, error: accessError },
    { data: readiness, error: readinessError },
    { data: assignment, error: assignmentError },
    { data: prior, error: priorError },
  ] =
    await Promise.all([
      supabase.from("bookings").select([
        "id", "service", "status", "bags", "paid_at", "customer_identity_verified_at",
        "driver_identity_verified_at", "restricted_items_attested_at", "passenger_manifest",
        "proofs",
        "pilot_eligibility_status", "pilot_eligibility_expires_at", "external_provider",
        "external_reference", "external_status", "arrival_release_status",
        "arrival_release_reference", "arrival_release_location", "arrival_release_authorized_at",
        "arrival_release_authorized_by",
      ].join(",")).eq("id", input.bookingId).maybeSingle<CustodyGateBooking>(),
      supabase.from("driver_access_codes")
        .select("id, driver_name, canonical_driver_name, driver_email, driver_phone, person_key_hash, status, expires_at")
        .eq("id", input.driverAccessId).maybeSingle<DriverAccessReadinessRow>(),
      supabase.from("agent_readiness_profiles").select("*")
        .eq("driver_access_id", input.driverAccessId)
        .maybeSingle<AgentReadinessProfileRow>(),
      supabase.from("booking_agent_assignments")
        .select("id, status, primary_driver_access_id, accepted_by_driver_access_id")
        .eq("booking_id", input.bookingId).eq("status", "accepted")
        .eq("primary_driver_access_id", input.driverAccessId)
        .eq("accepted_by_driver_access_id", input.driverAccessId)
        .limit(1).maybeSingle(),
      supabase.from("custody_checkpoints").select("checkpoint_key")
        .eq("booking_id", input.bookingId).eq("checkpoint_key", input.checkpointKey)
        .maybeSingle<{ checkpoint_key: string }>(),
    ]);
  if (bookingError || accessError || readinessError || assignmentError || priorError) {
    return { ok: false, error: "Custody authorization could not be verified.", status: 500 };
  }
  if (!booking) return { ok: false, error: "Booking not found.", status: 404 };
  if (!access) {
    return { ok: false, error: "Individual agent access record is missing.", status: 403 };
  }
  const readinessBlockers = agentReadinessBlockers(access, readiness);
  if (readinessBlockers.length > 0) {
    return { ok: false, error: readinessBlockers[0], status: 403 };
  }
  if (!assignment) {
    return { ok: false, error: "Only the accepted primary driver may write custody.", status: 403 };
  }
  if (booking.bags !== input.expectedBagCount) {
    return { ok: false, error: "Booking bag count does not match the checkpoint.", status: 409 };
  }
  if (prior) return { ok: true, driverName: access.driver_name, booking, idempotent: true };
  if (
    booking.pilot_eligibility_status !== "approved" ||
    !booking.pilot_eligibility_expires_at ||
    !booking.paid_at ||
    Date.parse(booking.paid_at) > Date.parse(booking.pilot_eligibility_expires_at)
  ) {
    return { ok: false, error: "Pilot eligibility was not used for payment before its deadline.", status: 409 };
  }
  if (!booking.customer_identity_verified_at || !booking.driver_identity_verified_at || !booking.restricted_items_attested_at) {
    return { ok: false, error: "Identity and prohibited-item declaration gates are incomplete.", status: 409 };
  }
  if (!Array.isArray(booking.passenger_manifest) || booking.passenger_manifest.length === 0) {
    return { ok: false, error: "An explicit verified traveler manifest is required.", status: 409 };
  }
  const manifestBlockers = passengerManifestCustodyBlockers(
    booking.passenger_manifest,
    Boolean(booking.customer_identity_verified_at),
  );
  if (manifestBlockers.length) {
    return { ok: false, error: manifestBlockers[0], status: 409 };
  }

  const expectedStatus = input.eventType === "custody_accepted"
    ? "arrived"
    : input.eventType === "traveler_return" || input.eventType === "carrier_transfer"
      ? "picked_up"
      : input.eventType === "recipient_delivery"
        ? "in_transit"
        : booking.status;
  if (booking.status !== expectedStatus) {
    return { ok: false, error: `Booking status ${booking.status} cannot record ${input.eventType}.`, status: 409 };
  }
  const proofKind = input.eventType === "custody_accepted"
    ? "seal"
    : input.eventType === "traveler_return"
      ? "customer_handoff"
      : input.eventType === "carrier_transfer"
        ? "airline_handoff"
        : input.eventType === "recipient_delivery"
          ? "delivery"
          : "";
  const proofs = Array.isArray(booking.proofs) ? booking.proofs : [];
  const checkpointProof = proofs.find(
    (proof) =>
      proof.kind === proofKind &&
      proof.custodyCheckpointKey === input.checkpointKey &&
      typeof proof.storagePath === "string" &&
      proof.storagePath.length > 0 &&
      proof.location && typeof proof.location === "object",
  );
  if (!checkpointProof) {
    return { ok: false, error: "Checkpoint key is not bound to stored photo and GPS evidence.", status: 409 };
  }
  const storedSealIndexes = new Set(proofs
    .filter((proof) =>
      proof.kind === "seal" &&
      Number.isInteger(proof.bagIndex) &&
      typeof proof.custodyCheckpointKey === "string" &&
      proof.custodyCheckpointKey.length > 0 &&
      typeof proof.storagePath === "string" &&
      proof.storagePath.length > 0 &&
      proof.location && typeof proof.location === "object" &&
      (input.eventType !== "custody_accepted" ||
        proof.custodyCheckpointKey === input.checkpointKey)
    )
    .map((proof) => Number(proof.bagIndex)));
  if (storedSealIndexes.size !== input.expectedBagCount) {
    return { ok: false, error: "Stored per-bag seal evidence is incomplete.", status: 409 };
  }
  if (input.eventType === "carrier_transfer" && !(
    booking.external_provider?.trim() && booking.external_reference?.trim() &&
    ["carrier_handoff_authorized", "handoff_ready"].includes(booking.external_status?.toLowerCase() ?? "")
  )) return { ok: false, error: "Carrier and station authorization is not recorded.", status: 403 };
  if (booking.service === "arrival" && ["custody_accepted", "recipient_delivery"].includes(input.eventType) && !(
    booking.arrival_release_status === "authorized" &&
    booking.arrival_release_reference?.trim() && booking.arrival_release_location?.trim() &&
    booking.arrival_release_authorized_at && booking.arrival_release_authorized_by?.trim()
  )) return { ok: false, error: "Airport-release authority is not recorded for this arrival.", status: 403 };

  return { ok: true, driverName: access.driver_name, booking, idempotent: false };
}

function validCheckpointKey(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$/.test(value);
}

export async function recordCustodyCheckpoint(
  input: RecordCustodyCheckpointInput
): Promise<RecordCustodyCheckpointResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Custody backend is not configured." };
  }
  const bookingId = input.bookingId.trim();
  const checkpointKey = input.checkpointKey.trim();
  if (!bookingId) return { ok: false, error: "Booking ID is required." };
  if (!validCheckpointKey(checkpointKey)) {
    return { ok: false, error: "Checkpoint key is missing or invalid." };
  }
  if (!Number.isInteger(input.expectedBagCount) || input.expectedBagCount < 1 || input.expectedBagCount > 20) {
    return { ok: false, error: "Expected bag count must be between 1 and 20." };
  }
  if (!RECORDABLE_CHECKPOINT_EVENT_TYPES.has(input.eventType)) {
    return { ok: false, error: "This custody event cannot be written through a route checkpoint." };
  }

  const { data, error } = await supabase.rpc("record_custody_checkpoint", {
    p_booking_id: bookingId,
    p_checkpoint_key: checkpointKey,
    p_expected_bag_count: input.expectedBagCount,
    p_event_type: input.eventType,
    p_actor_role: input.actorRole,
    p_actor_name: input.actorName?.trim() || null,
    p_verified_method: input.verifiedMethod,
    p_driver_access_id: input.driverAccessId ?? null,
    p_identity_verification_id: input.identityVerificationId ?? null,
    p_photo_path: input.photoPath ?? null,
    p_location_lat: Number.isFinite(input.lat) ? input.lat : null,
    p_location_lng: Number.isFinite(input.lng) ? input.lng : null,
    p_note: input.note?.slice(0, 2_000) ?? null,
    p_seals: input.seals ?? [],
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "Custody checkpoint could not be recorded.",
      code: error.code,
    };
  }

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const events = Array.isArray(result?.events)
    ? result.events as CustodyEvent[]
    : [];
  const uniqueBagIds = new Set(events.map((event) => event.bag_id));
  const bookingStatus = typeof result?.bookingStatus === "string"
    ? result.bookingStatus
    : "";
  if (
    result?.ok !== true ||
    events.length !== input.expectedBagCount ||
    uniqueBagIds.size !== input.expectedBagCount ||
    !bookingStatus ||
    events.some(
      (event) =>
        event.booking_id !== bookingId || event.event_type !== input.eventType
    )
  ) {
    return {
      ok: false,
      error: "Custody checkpoint did not return one matching event per expected bag.",
      code: "CUSTODY_CHECKPOINT_INCOMPLETE",
    };
  }

  return {
    ok: true,
    events,
    idempotent: result.idempotent === true,
    bookingStatus,
  };
}

export interface IssueBagsInput {
  bookingId: string;
  count: number;
  issuedBy?: string | null;
}

export type IssueBagsResult =
  | { ok: true; bags: Bag[]; events: CustodyEvent[]; idempotent: boolean }
  | { ok: false; error: string; code?: string };

// Mint every badge for a booking and seal every genesis event in one database
// transaction. Repeating the same issuance checkpoint returns the first result.
export async function issueBags(input: IssueBagsInput): Promise<IssueBagsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Custody backend is not configured." };

  const count = Math.max(1, Math.min(20, Math.floor(input.count)));
  // Recover the server-generated badge codes after a committed response is
  // lost. That makes a reload/retry reproduce the original RPC fingerprint
  // instead of generating a different set under the same checkpoint key.
  const { data: existingBags, error: existingBagsError } = await supabase
    .from("bags")
    .select("badge_code, bag_number")
    .eq("booking_id", input.bookingId.trim())
    .order("bag_number", { ascending: true });
  if (existingBagsError) {
    return {
      ok: false,
      error: existingBagsError.message || "Existing badge issuance could not be checked.",
      code: existingBagsError.code,
    };
  }
  if (existingBags && existingBags.length !== 0 && existingBags.length !== count) {
    return {
      ok: false,
      error: "Existing bag records do not match the booking's expected bag count.",
      code: "BADGE_ISSUANCE_CONFLICT",
    };
  }
  const badgeCodes = existingBags?.length === count
    ? existingBags.map((bag) => String(bag.badge_code))
    : Array.from({ length: count }, () => mintBadgeCode());
  const { data, error } = await supabase.rpc("issue_custody_bags", {
    p_booking_id: input.bookingId.trim(),
    p_expected_bag_count: count,
    p_badge_codes: badgeCodes,
    p_actor_name: input.issuedBy?.trim() || "Travelyt ops",
    p_checkpoint_key: "badge-issuance:v1",
  });
  if (error) {
    return { ok: false, error: error.message || "Badges could not be issued.", code: error.code };
  }

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const bags = Array.isArray(result?.bags) ? result.bags as Bag[] : [];
  const events = Array.isArray(result?.events) ? result.events as CustodyEvent[] : [];
  if (
    result?.ok !== true ||
    bags.length !== count ||
    events.length !== count ||
    new Set(bags.map((bag) => bag.id)).size !== count ||
    new Set(events.map((event) => event.bag_id)).size !== count
  ) {
    return {
      ok: false,
      error: "Badge issuance did not return one bag and genesis event per expected bag.",
      code: "BADGE_ISSUANCE_INCOMPLETE",
    };
  }

  return { ok: true, bags, events, idempotent: result.idempotent === true };
}
