import { NextResponse } from "next/server";
import {
  bookingPatchToRowPatch,
  bookingToInsert,
  rowToBooking,
  type BookingRow,
} from "@/lib/booking-mappers";
import { queueBookingNotification } from "@/lib/push-notifications-server";
import { rateLimit } from "@/lib/rate-limit";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import type { Booking, ServiceType } from "@/lib/bookings";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s().-]{6,}$/;
const serviceTypes = ["departure", "arrival", "both"] as const;

const resendApiKey = process.env.RESEND_API_KEY;
const leadNotifyEmail = process.env.LEAD_NOTIFY_EMAIL;
const leadFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <onboarding@resend.dev>";

const serviceLabels: Record<ServiceType, string> = {
  departure: "Departure Pickup",
  arrival: "Arrival Delivery",
  both: "Both Ways",
};

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function calcPriceCents(bags: number, service: ServiceType): number {
  const base = service === "both" ? 9000 : 5500;
  const perBag = 2500;
  return base + perBag * bags;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function newAccessToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().slice(0, 8);
}

function driverAuthorized(request: Request) {
  const expected = process.env.TRAVELYT_DRIVER_ACCESS_CODE;
  if (!expected) return true;
  return request.headers.get("x-travelyt-driver-code") === expected;
}

function tokenMatches(row: BookingRow, token?: string | null) {
  return Boolean(token && row.customer_access_token && token === row.customer_access_token);
}

function userOwns(row: BookingRow, userId?: string | null) {
  return Boolean(userId && row.customer_user_id && row.customer_user_id === userId);
}

function canReadBooking(
  request: Request,
  row: BookingRow,
  userId?: string | null,
  token?: string | null
) {
  return driverAuthorized(request) || userOwns(row, userId) || tokenMatches(row, token);
}

function responseBooking(row: BookingRow, includeAccessToken: boolean) {
  const booking = rowToBooking(row);
  if (!includeAccessToken) delete booking.customerAccessToken;
  return booking;
}

function validateBooking(body: Partial<Booking> & { source?: string }) {
  const service = body.service?.trim() as ServiceType | undefined;
  const airport = body.airport?.trim();
  const address = body.address?.trim();
  const date = body.date?.trim();
  const flight = body.flight?.trim() || undefined;
  const bags = typeof body.bags === "number" ? body.bags : 0;
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim();
  const notes = body.notes?.trim() || undefined;

  if (!service || !serviceTypes.includes(service)) return "Pick a service.";
  if (!airport) return "Airport is required.";
  if (!address) return "Address is required.";
  if (!date) return "Trip date is required.";
  if (!bags || bags < 1) return "Need at least one bag.";
  if (!name) return "Name is required.";
  if (!email || !emailPattern.test(email)) return "Enter a valid email address.";
  if (!phone || !phonePattern.test(phone)) return "Enter a valid phone number.";

  const booking: Booking = {
    id: body.id?.trim() || `TVT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    service,
    airport,
    address,
    date,
    flight,
    bags,
    name,
    email,
    phone,
    notes,
    status: body.status ?? "pending",
    priceCents:
      typeof body.priceCents === "number"
        ? body.priceCents
        : calcPriceCents(bags, service),
    createdAt: body.createdAt ?? new Date().toISOString(),
    paidAt: body.paidAt,
    assignedAt: body.assignedAt,
    driverName: body.driverName,
    pickedUpAt: body.pickedUpAt,
    deliveredAt: body.deliveredAt,
    proofs: Array.isArray(body.proofs) ? body.proofs : [],
  };

  return booking;
}

async function sendBookingEmail(booking: Booking, source: string) {
  if (!resendApiKey || !leadNotifyEmail) return;

  const lines = [
    "New Travelyt booking",
    "",
    `ID:       ${booking.id}`,
    `Service:  ${serviceLabels[booking.service]}`,
    `Airport:  ${booking.airport}`,
    `Address:  ${booking.address}`,
    `Date:     ${booking.date}`,
    `Flight:   ${booking.flight || "(none)"}`,
    `Bags:     ${booking.bags}`,
    `Price:    ${formatPrice(booking.priceCents)}`,
    "",
    `Name:     ${booking.name}`,
    `Email:    ${booking.email}`,
    `Phone:    ${booking.phone}`,
    `Notes:    ${booking.notes || "(none)"}`,
    "",
    `Source:   ${source}`,
    `Created:  ${booking.createdAt}`,
  ].join("\n");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: leadFromEmail,
      to: leadNotifyEmail,
      subject: `New Travelyt booking: ${booking.id} (${booking.name})`,
      reply_to: booking.email,
      text: lines,
    }),
  });

  if (!resendResponse.ok) {
    const message = await resendResponse.text();
    console.error("Resend booking notification failed", message);
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "bookings:get", 120);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const accessToken =
    searchParams.get("accessToken") ||
    request.headers.get("x-travelyt-booking-token");
  const user = await getRequestUser(request);

  if (id) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle<BookingRow>();

    if (error) return bad("Could not load booking.", 500);
    if (data && !canReadBooking(request, data, user?.id, accessToken)) {
      return bad("You do not have access to this booking.", 403);
    }
    const includeAccessToken =
      data ? userOwns(data, user?.id) || tokenMatches(data, accessToken) : false;
    return NextResponse.json({
      ok: true,
      booking: data ? responseBooking(data, includeAccessToken) : null,
    });
  }

  let query = supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!driverAuthorized(request)) {
    if (!user) return bad("Sign in or provide driver access.", 401);
    query = query.eq("customer_user_id", user.id);
  }

  const { data, error } = await query;

  if (error) return bad("Could not load bookings.", 500);
  return NextResponse.json({
    ok: true,
    bookings: ((data ?? []) as BookingRow[]).map((row) =>
      responseBooking(row, userOwns(row, user?.id))
    ),
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "bookings:post", 12);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as Partial<Booking> & { source?: string };
    const validated = validateBooking(body);
    if (typeof validated === "string") return bad(validated);

    const user = await getRequestUser(request);
    validated.customerAccessToken = validated.customerAccessToken || newAccessToken();
    validated.customerUserId = user?.id;

    const source = body.source?.trim() || "quote-form";
    const { data, error } = await supabase
      .from("bookings")
      .insert(bookingToInsert(validated, source))
      .select("*")
      .single<BookingRow>();

    if (error) {
      console.error("Supabase booking insert failed", error);
      return bad("Could not save booking.", 500);
    }

    await sendBookingEmail(validated, source);
    return NextResponse.json({ ok: true, booking: responseBooking(data, true) });
  } catch {
    return bad("We could not save that booking.");
  }
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "bookings:patch", 60);
  if (limited) return limited;

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Booking backend is not configured.", 503);

  try {
    const body = (await request.json()) as {
      id?: string;
      patch?: Partial<Booking>;
      proof?: Booking["proofs"][number];
      accessToken?: string;
    };
    const id = body.id?.trim();
    if (!id) return bad("Missing booking ID.");
    const user = await getRequestUser(request);

    const { data: existing, error: loadError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle<BookingRow>();

    if (loadError) return bad("Could not load booking.", 500);
    if (!existing) return bad("Booking not found.", 404);

    const patch = body.patch ?? {};
    const driverStatus = ["assigned", "picked_up", "in_transit", "delivered"];
    const requiresDriver =
      Boolean(body.proof) ||
      Boolean(patch.driverName || patch.driverUserId || patch.assignedAt) ||
      Boolean(patch.status && driverStatus.includes(patch.status));

    if (requiresDriver) {
      if (!driverAuthorized(request)) {
        return bad("Driver access is required for this update.", 403);
      }
    } else if (!canReadBooking(request, existing, user?.id, body.accessToken)) {
      return bad("You do not have access to this booking.", 403);
    }

    const rowPatch = bookingPatchToRowPatch(body.patch ?? {});
    if (body.proof) {
      rowPatch.proofs = [...(existing.proofs ?? []), body.proof];
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(rowPatch)
      .eq("id", id)
      .select("*")
      .single<BookingRow>();

    if (error) {
      console.error("Supabase booking update failed", error);
      return bad("Could not update booking.", 500);
    }

    const statusChanged = body.patch?.status && body.patch.status !== existing.status;
    if (statusChanged || body.proof) {
      await queueBookingNotification(data, body.proof ? "proof" : "status");
    }

    const includeAccessToken =
      userOwns(data, user?.id) || tokenMatches(data, body.accessToken);
    return NextResponse.json({
      ok: true,
      booking: responseBooking(data, includeAccessToken),
    });
  } catch {
    return bad("We could not update that booking.");
  }
}
