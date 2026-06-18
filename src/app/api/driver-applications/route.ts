import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getAdminSession, isFullAdminSession } from "@/lib/admin-auth";
import { createDriverAccessCode } from "@/lib/driver-access-server";

const APPLICATION_COLUMNS =
  "id, full_name, email, phone, city, state, vehicle_make_model, license_plate, drivers_license_state, drivers_license_last4, availability, referral_source, notes, status, reviewed_at, reviewed_by, created_at";

const resendApiKey = process.env.RESEND_API_KEY;
const driverNotifyEmail =
  process.env.DRIVER_NOTIFY_EMAIL ||
  process.env.NOTIFY_EMAIL ||
  process.env.LEAD_NOTIFY_EMAIL;
const notifyFromEmail =
  process.env.LEAD_FROM_EMAIL || "Travelyt <info@travelyt.us>";

async function sendApplicationNotification(application: {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  vehicleMakeModel: string;
  availability: string;
}) {
  if (!resendApiKey || !driverNotifyEmail) return;

  const text = [
    "New Travelyt driver application",
    "",
    `Name:         ${application.fullName}`,
    `Email:        ${application.email}`,
    `Phone:        ${application.phone || "(none)"}`,
    `Location:     ${application.city}, ${application.state}`,
    `Vehicle:      ${application.vehicleMakeModel}`,
    `Availability: ${application.availability}`,
    "",
    "Review and approve in the admin portal:",
    "https://travelyt.us/admin",
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: notifyFromEmail,
        to: driverNotifyEmail
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
        subject: `New Travelyt driver application: ${application.fullName}`,
        reply_to: application.email,
        text,
      }),
    });
    if (!response.ok) {
      console.error(
        "Resend driver application notification failed",
        await response.text()
      );
    }
  } catch (error) {
    console.error("Resend driver application notification error", error);
  }
}

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

    await sendApplicationNotification({
      fullName,
      email,
      phone,
      city,
      state,
      vehicleMakeModel,
      availability,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We could not save your application." },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "driver-applications:get", 60);
  if (limited) return limited;

  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Admin access is required." },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Driver applications backend is not configured." },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("driver_applications")
    .select(APPLICATION_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load driver applications", error);
    return NextResponse.json(
      { ok: false, error: "Could not load driver applications." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, applications: data ?? [] });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "driver-applications:patch", 20);
  if (limited) return limited;

  const session = getAdminSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Admin access is required." },
      { status: 401 }
    );
  }
  if (!isFullAdminSession(request)) {
    return NextResponse.json(
      { ok: false, error: "Only admin can review driver applications." },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Driver applications backend is not configured." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      action?: "approve" | "reject" | "reviewing";
    };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing application ID." },
        { status: 400 }
      );
    }
    const statusMap = {
      approve: "approved",
      reject: "rejected",
      reviewing: "reviewing",
    } as const;
    if (!body.action || !(body.action in statusMap)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported review action." },
        { status: 400 }
      );
    }

    const { data: application, error: loadError } = await supabase
      .from("driver_applications")
      .select("*")
      .eq("id", id)
      .single();
    if (loadError || !application) {
      return NextResponse.json(
        { ok: false, error: "Application not found." },
        { status: 404 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("driver_applications")
      .update({
        status: statusMap[body.action],
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.email ?? null,
      })
      .eq("id", id)
      .select(APPLICATION_COLUMNS)
      .single();
    if (updateError) {
      console.error("Could not update driver application", updateError);
      return NextResponse.json(
        { ok: false, error: "Could not update application." },
        { status: 500 }
      );
    }

    let oneTimeCode: string | undefined;
    if (body.action === "approve") {
      const created = await createDriverAccessCode({
        driverName: application.full_name,
        driverEmail: application.email,
        driverPhone: application.phone ?? undefined,
        role: "driver",
        createdBy: session.email,
      });
      oneTimeCode = created.code;
    }

    return NextResponse.json({ ok: true, application: updated, oneTimeCode });
  } catch (error) {
    console.error("Could not review driver application", error);
    return NextResponse.json(
      { ok: false, error: "Could not review application." },
      { status: 500 }
    );
  }
}
