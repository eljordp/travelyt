import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ApplicationBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  vehicleMakeModel?: string;
  licensePlate?: string;
  driversLicenseState?: string;
  driversLicenseLast4?: string;
  hasCleanRecord?: boolean;
  backgroundCheckConsent?: boolean;
  availability?: string;
  referralSource?: string;
  notes?: string;
};

function required(value: unknown, label: string): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return `${label} is required.`;
  }
  return null;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "driver-applications:post", 5);
  if (limited) return limited;

  try {
    const body = (await request.json()) as ApplicationBody;

    const errors: string[] = [];
    const fullName = body.fullName?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const phone = body.phone?.trim() || "";
    const city = body.city?.trim() || "";
    const state = body.state?.trim().toUpperCase() || "";
    const vehicleMakeModel = body.vehicleMakeModel?.trim() || "";
    const licensePlate = body.licensePlate?.trim().toUpperCase() || "";
    const driversLicenseState = body.driversLicenseState?.trim().toUpperCase() || "";
    const driversLicenseLast4 = body.driversLicenseLast4?.trim() || "";
    const availability = body.availability?.trim() || "";
    const referralSource = body.referralSource?.trim() || null;
    const notes = body.notes?.trim() || null;

    const fieldChecks: Array<[unknown, string]> = [
      [fullName, "Full name"],
      [city, "City"],
      [state, "State"],
      [vehicleMakeModel, "Vehicle make and model"],
      [licensePlate, "License plate"],
      [driversLicenseState, "Driver's license state"],
      [availability, "Availability"],
    ];

    for (const [value, label] of fieldChecks) {
      const err = required(value, label);
      if (err) errors.push(err);
    }

    if (!email || !emailPattern.test(email)) {
      errors.push("Enter a valid email address.");
    }
    if (!/^\d{4}$/.test(driversLicenseLast4)) {
      errors.push("Driver's license last 4 must be 4 digits.");
    }
    if (state.length !== 2) {
      errors.push("State must be a 2-letter code.");
    }
    if (driversLicenseState.length !== 2) {
      errors.push("Driver's license state must be a 2-letter code.");
    }
    if (body.hasCleanRecord !== true) {
      errors.push("Confirm you have a clean driving record to apply.");
    }
    if (body.backgroundCheckConsent !== true) {
      errors.push("Background check consent is required.");
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, error: errors[0], errors },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Driver applications are not configured yet." },
        { status: 503 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "";
    const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null;
    const userAgent = request.headers.get("user-agent") || null;

    const { error } = await supabase.from("driver_applications").insert({
      full_name: fullName,
      email,
      phone: phone || null,
      city,
      state,
      vehicle_make_model: vehicleMakeModel,
      license_plate: licensePlate,
      drivers_license_state: driversLicenseState,
      drivers_license_last4: driversLicenseLast4,
      has_clean_record: true,
      background_check_consent: true,
      availability,
      referral_source: referralSource,
      notes,
      ip_hash: ipHash,
      user_agent: userAgent,
    });

    if (error) {
      console.error("Driver application insert failed", error);
      return NextResponse.json(
        { ok: false, error: "We could not save your application." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We could not save your application." },
      { status: 400 }
    );
  }
}
