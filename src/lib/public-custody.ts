import type {
  ActorRole,
  Bag,
  BagStatus,
  CustodyEvent,
  CustodyEventType,
  VerifiedMethod,
} from "./custody";

// Public badge scans prove bag status and ledger continuity without exposing
// customer/agent identity, exact location, notes, proof media, or database IDs.
// The full Bag and CustodyEvent records remain available only through an
// authorized customer booking token or an operations session.
export interface PublicBagCustodySummary {
  badge_code: string;
  label: string | null;
  status: BagStatus;
}

export interface PublicCustodyEvent {
  seq: number;
  event_type: CustodyEventType;
  actor_role: ActorRole;
  verified_method: VerifiedMethod;
  created_at: string;
}

export function toPublicBagCustodySummary(
  bag: Bag
): PublicBagCustodySummary {
  return {
    badge_code: bag.badge_code,
    label: bag.label,
    status: bag.status,
  };
}

export function toPublicCustodyChain(
  chain: CustodyEvent[]
): PublicCustodyEvent[] {
  return chain.map((event) => ({
    seq: event.seq,
    event_type: event.event_type,
    actor_role: event.actor_role,
    verified_method: event.verified_method,
    created_at: event.created_at,
  }));
}
