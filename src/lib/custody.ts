import { randomInt } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export type CustodyEventType =
  | "badge_issued"
  | "picked_up"
  | "in_transit"
  | "security_handoff"
  | "delivered"
  | "exception";

export type ActorRole =
  | "customer"
  | "driver"
  | "employee"
  | "tsa"
  | "airline"
  | "system";

export type VerifiedMethod =
  | "none"
  | "access_code"
  | "id_document"
  | "facial_liveness"
  | "confirmation_code";

export type BagStatus =
  | "issued"
  | "in_custody"
  | "handed_off"
  | "delivered"
  | "exception";

export interface Bag {
  id: string;
  booking_id: string;
  badge_code: string;
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
  badge_issued: "Badge issued",
  picked_up: "Picked up",
  in_transit: "In transit",
  security_handoff: "Security handoff",
  delivered: "Delivered",
  exception: "Exception",
};

export const VERIFIED_METHOD_LABELS: Record<VerifiedMethod, string> = {
  none: "Not verified",
  access_code: "Driver access code",
  id_document: "Government ID",
  facial_liveness: "Facial liveness",
  confirmation_code: "Confirmation code",
};

// Which bag status each event moves the bag into.
const STATUS_FOR_EVENT: Record<CustodyEventType, BagStatus> = {
  badge_issued: "issued",
  picked_up: "in_custody",
  in_transit: "in_custody",
  security_handoff: "handed_off",
  delivered: "delivered",
  exception: "exception",
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
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as Bag[];
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

export interface AppendEventInput {
  bagId: string;
  eventType: CustodyEventType;
  actorRole: ActorRole;
  actorName?: string | null;
  identityVerificationId?: string | null;
  verifiedMethod?: VerifiedMethod;
  photoPath?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
}

export async function appendCustodyEvent(
  input: AppendEventInput
): Promise<CustodyEvent | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const bag = await supabase
    .from("bags")
    .select("id, booking_id, badge_code")
    .eq("id", input.bagId)
    .maybeSingle();
  if (bag.error || !bag.data) return null;

  // seq + prev_hash + event_hash are sealed by the DB trigger.
  const { data, error } = await supabase
    .from("custody_events")
    .insert({
      bag_id: bag.data.id,
      booking_id: bag.data.booking_id,
      badge_code: bag.data.badge_code,
      seq: 0,
      event_type: input.eventType,
      actor_role: input.actorRole,
      actor_name: input.actorName ?? null,
      identity_verification_id: input.identityVerificationId ?? null,
      verified_method: input.verifiedMethod ?? "none",
      photo_path: input.photoPath ?? null,
      location_lat: input.lat ?? null,
      location_lng: input.lng ?? null,
      note: input.note ?? null,
      prev_hash: "",
      event_hash: "",
    })
    .select("*")
    .single();
  if (error || !data) return null;

  await supabase
    .from("bags")
    .update({ status: STATUS_FOR_EVENT[input.eventType] })
    .eq("id", input.bagId);

  return data as CustodyEvent;
}

export interface IssueBagsInput {
  bookingId: string;
  count: number;
  issuedBy?: string | null;
}

// Mint badges for a booking and seal a genesis badge_issued event for each.
export async function issueBags(input: IssueBagsInput): Promise<Bag[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const count = Math.max(1, Math.min(20, Math.floor(input.count)));
  const created: Bag[] = [];

  for (let i = 0; i < count; i += 1) {
    let bag: Bag | null = null;

    // Retry on the rare badge_code collision.
    for (let attempt = 0; attempt < 5 && !bag; attempt += 1) {
      const { data, error } = await supabase
        .from("bags")
        .insert({
          booking_id: input.bookingId,
          badge_code: mintBadgeCode(),
          label: `Bag ${i + 1} of ${count}`,
        })
        .select("*")
        .single();
      if (!error && data) bag = data as Bag;
    }
    if (!bag) continue;

    await appendCustodyEvent({
      bagId: bag.id,
      eventType: "badge_issued",
      actorRole: "employee",
      actorName: input.issuedBy ?? "Travelyt ops",
      verifiedMethod: "access_code",
      note: "Bag registered into chain of custody",
    });

    created.push(bag);
  }

  return created;
}
