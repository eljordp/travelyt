import { NextResponse } from "next/server";
import { authorizeDriverRequest } from "@/lib/driver-access-server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import {
  bookingAccessTokenMatches,
  getBagByBadge,
  getBagsForBooking,
  getCustodyChain,
  issueBags,
  recordCustodyCheckpoint,
  validateDriverCustodyWrite,
  verifyChain,
  type CustodySealEvidence,
  type ModernCustodyEventType,
} from "@/lib/custody";
import {
  toPublicBagCustodySummary,
  toPublicCustodyChain,
} from "@/lib/public-custody";

const DRIVER_EVENT_TYPES = new Set<ModernCustodyEventType>([
  "custody_accepted",
  "traveler_return",
  "recipient_delivery",
  "carrier_transfer",
]);

const VALID_SEAL_METHODS = new Set(["zipper", "latch_label", "handle"]);
const VALID_SEAL_STATUSES = new Set(["intact", "broken", "replaced"]);
const VALID_SEAL_SERIAL = /^[A-Z0-9][A-Z0-9-]{2,63}$/;

// GET /api/custody?badge=TVT-B-XXXXXX
// Public reads return a privacy-safe status/continuity view. An operations
// session or the owning booking's customer token unlocks the full evidence.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // List all bags for a booking. Allowed for an admin session, or for a
  // customer presenting their own booking access token (powers the admin
  // badges panel and the customer tracking page).
  const bookingId = params.get("bookingId")?.trim() ?? "";
  if (bookingId) {
    if (!(await getVerifiedAdminSession(request))) {
      const token = params.get("token")?.trim() ?? "";
      if (!(await bookingAccessTokenMatches(bookingId, token))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    const bags = await getBagsForBooking(bookingId);
    return NextResponse.json({ bags });
  }

  const badge = params.get("badge")?.trim() ?? "";
  if (!badge) {
    return NextResponse.json({ error: "Missing badge code" }, { status: 400 });
  }

  const bag = await getBagByBadge(badge);
  if (!bag) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 });
  }

  const [chain, verification] = await Promise.all([
    getCustodyChain(bag.id),
    verifyChain(bag.id),
  ]);

  const adminSession = await getVerifiedAdminSession(request);
  const customerToken = params.get("token")?.trim() ?? "";
  const hasCustomerAccess = adminSession
    ? false
    : await bookingAccessTokenMatches(bag.booking_id, customerToken);

  if (adminSession || hasCustomerAccess) {
    return NextResponse.json(
      { visibility: "full", bag, chain, verification },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  return NextResponse.json(
    {
      visibility: "public",
      bag: toPublicBagCustodySummary(bag),
      chain: toPublicCustodyChain(chain),
      verification,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/custody
// action "issue": mint every bag badge in one admin-only transaction.
// action "scan_booking": append one event per bag in one driver-gated transaction.
export async function POST(request: Request) {
  const auth = await authorizeDriverRequest(request);
  const adminSession = await getVerifiedAdminSession(request);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "scan");

  if (action === "issue") {
    if (!adminSession) {
      return NextResponse.json(
        { error: "Only an authenticated Travelyt administrator can issue bag badges." },
        { status: 403 }
      );
    }
    const bookingId = String(body.bookingId ?? "").trim();
    const count = Number(body.count);
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return NextResponse.json(
        { error: "Expected bag count must be an integer between 1 and 20." },
        { status: 400 }
      );
    }
    const result = await issueBags({
      bookingId,
      count,
      issuedBy: adminSession.email,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.code === "PGRST202" ? 503 : 409 }
      );
    }
    return NextResponse.json(
      { bags: result.bags, events: result.events, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201 }
    );
  }

  if (action === "scan_booking") {
    if (
      !auth.ok ||
      !auth.driverAccessId ||
      auth.source === "env" ||
      !auth.driverName
    ) {
      return NextResponse.json(
        { error: "An individual database-backed driver session is required." },
        { status: 401 }
      );
    }
    const bid = String(body.bookingId ?? "").trim();
    const checkpointKey = String(body.checkpointKey ?? "").trim();
    const expectedBagCount = Number(body.expectedBagCount);
    const eventType = String(body.eventType ?? "") as ModernCustodyEventType;
    if (!bid) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }
    if (!checkpointKey) {
      return NextResponse.json({ error: "Missing checkpointKey" }, { status: 400 });
    }
    if (!Number.isInteger(expectedBagCount) || expectedBagCount < 1 || expectedBagCount > 20) {
      return NextResponse.json(
        { error: "Expected bag count must be an integer between 1 and 20." },
        { status: 400 }
      );
    }
    if (!DRIVER_EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
    }
    const custodyGate = await validateDriverCustodyWrite({
      bookingId: bid,
      checkpointKey,
      driverAccessId: auth.driverAccessId,
      eventType,
      expectedBagCount,
    });
    if (!custodyGate.ok) {
      return NextResponse.json(
        { error: custodyGate.error },
        { status: custodyGate.status }
      );
    }

    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const normalPhysicalEvent = eventType !== "exception_opened";
    if (
      normalPhysicalEvent &&
      (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat!) > 90 || Math.abs(lng!) > 180)
    ) {
      return NextResponse.json(
        { error: "A valid GPS checkpoint is required for this custody event." },
        { status: 409 }
      );
    }

    const seals: CustodySealEvidence[] = Array.isArray(body.seals)
      ? body.seals.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const seal = value as Record<string, unknown>;
          const bagIndex = Number(seal.bagIndex);
          const sealId = String(seal.sealId ?? "").trim().toUpperCase();
          const sealMethod = String(seal.sealMethod ?? "");
          const sealStatus = String(seal.sealStatus ?? "");
          const proofCheckpointKey = String(seal.proofCheckpointKey ?? "").trim();
          const proofStoragePath = String(seal.proofStoragePath ?? "").trim();
          if (
            !Number.isInteger(bagIndex) ||
            bagIndex < 1 ||
            bagIndex > expectedBagCount ||
            !VALID_SEAL_SERIAL.test(sealId) ||
            !VALID_SEAL_METHODS.has(sealMethod) ||
            !VALID_SEAL_STATUSES.has(sealStatus) ||
            !/^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$/.test(proofCheckpointKey) ||
            proofStoragePath.length < 3 ||
            proofStoragePath.length > 1_000
          ) return [];
          return [{
            bagIndex,
            sealId,
            sealMethod: sealMethod as CustodySealEvidence["sealMethod"],
            sealStatus: sealStatus as CustodySealEvidence["sealStatus"],
            proofCheckpointKey,
            proofStoragePath,
          }];
        })
      : [];
    if (["custody_accepted", "traveler_return", "recipient_delivery", "carrier_transfer"].includes(eventType)) {
      const indexes = new Set(seals.map((seal) => seal.bagIndex));
      const serials = new Set(seals.map((seal) => seal.sealId));
      if (
        seals.length !== expectedBagCount ||
        indexes.size !== expectedBagCount ||
        serials.size !== expectedBagCount ||
        seals.some((seal) => seal.sealStatus !== "intact")
      ) {
        return NextResponse.json(
          { error: "Every custody acceptance or transfer needs one distinct intact seal serial and attachment method per bag." },
          { status: 409 }
        );
      }
    }

    const result = await recordCustodyCheckpoint({
      bookingId: bid,
      checkpointKey,
      expectedBagCount,
      eventType,
      actorRole: "agent",
      actorName: custodyGate.driverName,
      driverAccessId: auth.driverAccessId,
      verifiedMethod: auth.source === "session" ? "account_session" : "access_code",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      note: typeof body.note === "string" ? body.note : null,
      seals,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.code === "PGRST202" ? 503 : 409 }
      );
    }
    return NextResponse.json(
      {
        events: result.events,
        idempotent: result.idempotent,
        bookingStatus: result.bookingStatus,
      },
      { status: result.idempotent ? 200 : 201 }
    );
  }

  if (action === "scan") {
    return NextResponse.json(
      { error: "Single-bag custody writes are retired. Record one atomic booking checkpoint instead." },
      { status: 410 }
    );
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
