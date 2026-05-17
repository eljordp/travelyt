import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d][\d\s().-]{6,}$/;
const serviceTypes = ["departure", "arrival", "both"] as const;
type ServiceType = (typeof serviceTypes)[number];

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      service?: string;
      airport?: string;
      address?: string;
      date?: string;
      flight?: string;
      bags?: number;
      name?: string;
      email?: string;
      phone?: string;
      notes?: string;
      priceCents?: number;
      source?: string;
    };

    const id = body.id?.trim();
    const service = body.service?.trim() as ServiceType | undefined;
    const airport = body.airport?.trim();
    const address = body.address?.trim();
    const date = body.date?.trim();
    const flight = body.flight?.trim() || "";
    const bags = typeof body.bags === "number" ? body.bags : 0;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();
    const notes = body.notes?.trim() || "";
    const priceCents =
      typeof body.priceCents === "number" ? body.priceCents : 0;
    const source = body.source?.trim() || "quote-form";

    if (!service || !serviceTypes.includes(service)) {
      return NextResponse.json(
        { ok: false, error: "Pick a service." },
        { status: 400 }
      );
    }
    if (!airport) {
      return NextResponse.json(
        { ok: false, error: "Airport is required." },
        { status: 400 }
      );
    }
    if (!address) {
      return NextResponse.json(
        { ok: false, error: "Address is required." },
        { status: 400 }
      );
    }
    if (!date) {
      return NextResponse.json(
        { ok: false, error: "Trip date is required." },
        { status: 400 }
      );
    }
    if (!bags || bags < 1) {
      return NextResponse.json(
        { ok: false, error: "Need at least one bag." },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Name is required." },
        { status: 400 }
      );
    }
    if (!email || !emailPattern.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    if (!phone || !phonePattern.test(phone)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid phone number." },
        { status: 400 }
      );
    }

    const booking = {
      id,
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
      priceCents,
      source,
      createdAt: new Date().toISOString(),
    };

    if (!resendApiKey || !leadNotifyEmail) {
      console.warn("Travelyt booking captured without email provider", booking);
      return NextResponse.json(
        {
          ok: false,
          error:
            "Booking notifications are not configured. Set RESEND_API_KEY and LEAD_NOTIFY_EMAIL.",
        },
        { status: 503 }
      );
    }

    const lines = [
      "New Travelyt booking",
      "",
      `ID:       ${id || "(none)"}`,
      `Service:  ${serviceLabels[service]}`,
      `Airport:  ${airport}`,
      `Address:  ${address}`,
      `Date:     ${date}`,
      `Flight:   ${flight || "(none)"}`,
      `Bags:     ${bags}`,
      `Price:    ${formatPrice(priceCents)}`,
      "",
      `Name:     ${name}`,
      `Email:    ${email}`,
      `Phone:    ${phone}`,
      `Notes:    ${notes || "(none)"}`,
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
        subject: `New Travelyt booking${id ? `: ${id}` : ""} (${name})`,
        reply_to: email,
        text: lines,
      }),
    });

    if (!resendResponse.ok) {
      const message = await resendResponse.text();
      console.error("Resend booking notification failed", message);
      return NextResponse.json(
        { ok: false, error: "Booking notification failed." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We could not save that booking." },
      { status: 400 }
    );
  }
}
