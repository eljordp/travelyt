import { NextResponse } from "next/server";
import { isFullAdminSession, getAdminSession } from "@/lib/admin-auth";
import {
  BOOKING_SELECT_COLUMNS,
  rowToBooking,
  type BookingRow,
} from "@/lib/booking-mappers";
import type {
  ArrivalReleaseStatus,
  BookingAuditEntry,
} from "@/lib/bookings";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const statuses: ArrivalReleaseStatus[] = ["pending", "authorized", "revoked"];
const maxFutureClockSkewMs = 5 * 60 * 1000;

type ArrivalReleaseBody = {
  bookingId?: unknown;
  status?: unknown;
  reference?: unknown;
  location?: unknown;
  authorizedAt?: unknown;
  authorizedBy?: unknown;
  reason?: unknown;
};

type BookingRowWithUpdatedAt = BookingRow & { updated_at: string };

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validTransition(
  current: ArrivalReleaseStatus,
  next: ArrivalReleaseStatus,
) {
  if (current === "pending") return next === "authorized";
  if (current === "authorized") return next === "revoked";
  return next === "pending" || next === "authorized";
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "admin:arrival-release", 20);
  if (limited) return limited;
  if (!isFullAdminSession(request)) {
    return bad("Full admin access is required to record airport-release authority.", 403);
  }

  const session = getAdminSession(request);
  const supabase = getSupabaseAdmin();
  if (!session || !supabase) {
    return bad("Arrival-release authority controls are not configured.", 503);
  }

  let body: ArrivalReleaseBody;
  try {
    body = (await request.json()) as ArrivalReleaseBody;
  } catch {
    return bad("A valid JSON request is required.");
  }

  const bookingId = cleanString(body.bookingId);
  const status = cleanString(body.status) as ArrivalReleaseStatus;
  const reason = cleanString(body.reason);
  if (!bookingId) return bad("Booking ID is required.");
  if (bookingId.length > 80) return bad("Booking ID is too long.");
  if (!statuses.includes(status)) return bad("A valid arrival-release status is required.");
  if (reason.length < 12) {
    return bad("An audit reason of at least 12 characters is required.");
  }
  if (reason.length > 600) return bad("Audit reason is too long.");

  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select(`${BOOKING_SELECT_COLUMNS},updated_at`)
    .eq("id", bookingId)
    .maybeSingle<BookingRowWithUpdatedAt>();
  if (loadError) return bad("Could not load the booking.", 500);
  if (!existing) return bad("Booking not found.", 404);
  if (existing.service !== "arrival") {
    return bad("Airport-release authority can only be recorded for an arrival booking.", 409);
  }

  const currentStatus = existing.arrival_release_status ?? "pending";
  if (!validTransition(currentStatus, status)) {
    return bad(
      `Arrival-release status cannot move directly from ${currentStatus} to ${status}.`,
      409,
    );
  }

  let reference = existing.arrival_release_reference;
  let location = existing.arrival_release_location;
  let authorizedAt = existing.arrival_release_authorized_at;
  let authorizedBy = existing.arrival_release_authorized_by;

  if (status === "authorized") {
    reference = cleanString(body.reference);
    location = cleanString(body.location);
    authorizedBy = cleanString(body.authorizedBy);
    const authorizedAtInput = cleanString(body.authorizedAt);
    const parsedAuthorizedAt = Date.parse(authorizedAtInput);
    if (reference.length < 3) return bad("Authority reference is required.");
    if (reference.length > 200) return bad("Authority reference is too long.");
    if (location.length < 5) return bad("Exact airport release location is required.");
    if (location.length > 300) return bad("Airport release location is too long.");
    if (authorizedBy.length < 2) return bad("Authorizing person or organization is required.");
    if (authorizedBy.length > 160) return bad("Authorizing party is too long.");
    if (authorizedAtInput.length > 80) return bad("Authorization time is invalid.");
    if (!authorizedAtInput || Number.isNaN(parsedAuthorizedAt)) {
      return bad("A valid authorization date and time is required.");
    }
    if (parsedAuthorizedAt > Date.now() + maxFutureClockSkewMs) {
      return bad("Authorization time cannot be in the future.");
    }
    authorizedAt = new Date(parsedAuthorizedAt).toISOString();
  }

  const timestamp = new Date().toISOString();
  const auditEntry: BookingAuditEntry = {
    id: crypto.randomUUID(),
    action: "arrival_release_authority",
    actorRole: "admin",
    actorName: session.email,
    reason,
    timestamp,
    arrivalReleaseStatus: status,
    arrivalReleaseReference: reference ?? undefined,
    arrivalReleaseLocation: location ?? undefined,
    arrivalReleaseAuthorizedAt: authorizedAt ?? undefined,
    arrivalReleaseAuthorizedBy: authorizedBy ?? undefined,
  };
  const statusHistory = Array.isArray(existing.status_history)
    ? [...existing.status_history, auditEntry]
    : [auditEntry];

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      arrival_release_status: status,
      arrival_release_reference: reference,
      arrival_release_location: location,
      arrival_release_authorized_at: authorizedAt,
      arrival_release_authorized_by: authorizedBy,
      status_history: statusHistory,
    })
    .eq("id", bookingId)
    .eq("updated_at", existing.updated_at)
    .select(BOOKING_SELECT_COLUMNS)
    .maybeSingle<BookingRow>();

  if (updateError) return bad("Could not record airport-release authority.", 500);
  if (!updated) {
    return bad("Booking changed while authority was being recorded. Refresh and try again.", 409);
  }

  return NextResponse.json({ ok: true, booking: rowToBooking(updated) });
}
