import { NextResponse } from "next/server";
import { authorizeDriverRequest } from "@/lib/driver-access-server";
import { getAdminSession } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  appendCustodyEvent,
  getBagByBadge,
  getBagsForBooking,
  getCustodyChain,
  issueBags,
  verifyChain,
  type ActorRole,
  type CustodyEventType,
  type VerifiedMethod,
} from "@/lib/custody";

const EVENT_TYPES: CustodyEventType[] = [
  "badge_issued",
  "picked_up",
  "in_transit",
  "security_handoff",
  "delivered",
  "exception",
];

const VERIFIED_METHODS: VerifiedMethod[] = [
  "none",
  "access_code",
  "id_document",
  "facial_liveness",
  "confirmation_code",
];

// GET /api/custody?badge=TVT-B-XXXXXX
// Public read: returns the bag, its full custody chain, and a live integrity
// check. This is the verifiable record a customer, airline, or TSA can pull.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // List all bags for a booking. Allowed for an admin session, or for a
  // customer presenting their own booking access token (powers the admin
  // badges panel and the customer tracking page).
  const bookingId = params.get("bookingId")?.trim() ?? "";
  if (bookingId) {
    if (!getAdminSession(request)) {
      const token = params.get("token")?.trim() ?? "";
      const supabase = getSupabaseAdmin();
      if (!token || !supabase) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const { data: bk } = await supabase
        .from("bookings")
        .select("customer_access_token")
        .eq("id", bookingId)
        .maybeSingle();
      if (!bk || bk.customer_access_token !== token) {
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

  return NextResponse.json({ bag, chain, verification });
}

// POST /api/custody
// action "issue": mint N badges for a booking (driver/employee gated).
// action "scan":  append a custody event for a scanned badge (driver gated).
export async function POST(request: Request) {
  const auth = await authorizeDriverRequest(request);
  const adminSession = getAdminSession(request);
  if (!auth.ok && !adminSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "scan");

  if (action === "issue") {
    const bookingId = String(body.bookingId ?? "").trim();
    const count = Number(body.count ?? 1);
    if (!bookingId) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }
    const bags = await issueBags({
      bookingId,
      count: Number.isFinite(count) ? count : 1,
      issuedBy: auth.driverName ?? adminSession?.email ?? "Travelyt ops",
    });
    if (!bags.length) {
      return NextResponse.json(
        { error: "Could not issue badges (check bookingId)" },
        { status: 422 }
      );
    }
    return NextResponse.json({ bags }, { status: 201 });
  }

  // Log one custody event across every bag of a booking in a single call, so
  // the driver workflow can seal a handoff without scanning each badge.
  if (action === "scan_booking") {
    const bid = String(body.bookingId ?? "").trim();
    const eventType = String(body.eventType ?? "") as CustodyEventType;
    if (!bid) {
      return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
    }
    if (!EVENT_TYPES.includes(eventType)) {
      return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
    }

    const bags = await getBagsForBooking(bid);
    if (!bags.length) {
      return NextResponse.json({ events: [], skipped: true });
    }

    const actorRole = ["driver", "employee", "tsa", "airline"].includes(
      String(body.actorRole)
    )
      ? (body.actorRole as ActorRole)
      : "driver";
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;

    const events = [];
    for (const bag of bags) {
      const event = await appendCustodyEvent({
        bagId: bag.id,
        eventType,
        actorRole,
        actorName: auth.driverName ?? adminSession?.email ?? null,
        verifiedMethod: "access_code",
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        note: typeof body.note === "string" ? body.note : null,
      });
      if (event) events.push(event);
    }
    return NextResponse.json({ events }, { status: 201 });
  }

  if (action === "scan") {
    const badge = String(body.badge ?? "").trim();
    const eventType = String(body.eventType ?? "") as CustodyEventType;
    if (!badge) {
      return NextResponse.json({ error: "Missing badge code" }, { status: 400 });
    }
    if (!EVENT_TYPES.includes(eventType)) {
      return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
    }

    const bag = await getBagByBadge(badge);
    if (!bag) {
      return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    }

    const verifiedMethod = VERIFIED_METHODS.includes(
      body.verifiedMethod as VerifiedMethod
    )
      ? (body.verifiedMethod as VerifiedMethod)
      : "access_code";

    const actorRole = ["driver", "employee", "tsa", "airline"].includes(
      String(body.actorRole)
    )
      ? (body.actorRole as ActorRole)
      : "driver";

    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;

    const event = await appendCustodyEvent({
      bagId: bag.id,
      eventType,
      actorRole,
      actorName: auth.driverName ?? adminSession?.email ?? null,
      identityVerificationId:
        typeof body.identityVerificationId === "string"
          ? body.identityVerificationId
          : null,
      verifiedMethod,
      photoPath: typeof body.photoPath === "string" ? body.photoPath : null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      note: typeof body.note === "string" ? body.note : null,
    });

    if (!event) {
      return NextResponse.json({ error: "Could not log event" }, { status: 500 });
    }

    const verification = await verifyChain(bag.id);
    return NextResponse.json({ event, verification }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
