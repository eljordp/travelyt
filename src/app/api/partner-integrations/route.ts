import { NextResponse } from "next/server";
import { getAdminSession, isFullAdminSession } from "@/lib/admin-auth";
import {
  arePartnerIntegrationsEnabled,
  partnerIntegrations,
  type PartnerEnvironment,
} from "@/lib/partner-integrations";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type PartnerIntegrationRow = {
  id: string;
  name: string;
  kind: string;
  environment: PartnerEnvironment;
  capabilities: string[];
  auth_type: string;
  active: boolean;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

type PartnerEventRow = {
  id: string;
  provider_id: string;
  booking_id: string | null;
  external_reference: string | null;
  direction: "inbound" | "outbound";
  event_type: string;
  status: string;
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
};

type ValidationResult<T> =
  | { value: T; error?: never }
  | { value?: never; error: string };

const MAX_PAYLOAD_BYTES = 10_000;
const MAX_NOTE_LENGTH = 1_000;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const BOOKING_ID_PATTERN = /^[a-z0-9_-]{1,80}$/i;
const EVENT_TYPE_PATTERN = /^[a-z0-9_.:-]{1,80}$/i;
const STATUS_PATTERN = /^[a-z0-9_.:-]{1,80}$/i;

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function disabled() {
  return bad("Partner integrations are not enabled.", 404);
}

function fallbackIntegrations(): PartnerIntegrationRow[] {
  return partnerIntegrations.map((integration) => ({
    id: integration.id,
    name: integration.name,
    kind: integration.kind,
    environment: integration.environment,
    capabilities: integration.capabilities,
    auth_type: integration.auth.type,
    active: false,
    notes: integration.notes,
  }));
}

function isMissingPartnerTable(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "");
  return /partner_integrations|partner_events|does not exist|schema cache/i.test(message);
}

function adminAuthorized(request: Request) {
  return Boolean(getAdminSession(request));
}

function textField(
  value: unknown,
  label: string,
  maxLength: number,
  options: { required?: boolean; pattern?: RegExp } = {}
): ValidationResult<string | null> {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return options.required
      ? { error: `${label} is required.` }
      : { value: null };
  }
  if (text.length > maxLength) {
    return { error: `${label} must be ${maxLength} characters or less.` };
  }
  if (options.pattern && !options.pattern.test(text)) {
    return { error: `${label} has invalid characters.` };
  }
  return { value: text };
}

function payloadObject(
  value: unknown,
  recordedBy: string
): ValidationResult<Record<string, unknown>> {
  const source = value ?? {};
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { error: "Payload must be a JSON object." };
  }

  const payload: Record<string, unknown> = {
    ...(source as Record<string, unknown>),
    recordedBy,
  };

  const note = payload.note;
  if (typeof note === "string") {
    payload.note = note.trim().slice(0, MAX_NOTE_LENGTH);
  }

  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return { error: "Payload must be serializable JSON." };
  }

  if (new TextEncoder().encode(serialized).length > MAX_PAYLOAD_BYTES) {
    return { error: "Payload is too large." };
  }

  return { value: payload };
}

async function requireProvider(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  providerId: string
) {
  const { data, error } = await supabase
    .from("partner_integrations")
    .select("id")
    .eq("id", providerId)
    .maybeSingle<{ id: string }>();

  if (error) {
    if (isMissingPartnerTable(error)) {
      return {
        response: bad(
          "Apply migration 018_partner_integration_layer.sql before recording partner events.",
          409,
          {
            migrationRequired: true,
            migration: "018_partner_integration_layer.sql",
          }
        ),
      };
    }
    return { response: bad("Could not verify partner provider.", 500) };
  }

  if (!data) {
    return { response: bad("Unknown partner provider.", 404) };
  }

  return { response: null };
}

async function requireBookingIfPresent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  bookingId: string | null
) {
  if (!bookingId) return { response: null };

  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle<{ id: string }>();

  if (error) return { response: bad("Could not verify booking.", 500) };
  if (!data) return { response: bad("Booking was not found.", 404) };
  return { response: null };
}

export async function GET(request: Request) {
  if (!arePartnerIntegrationsEnabled()) return disabled();

  const limited = rateLimit(request, "partner-integrations:get", 60);
  if (limited) return limited;
  if (!adminAuthorized(request)) return bad("Admin access is required.", 401);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return bad("Partner backend is not configured.", 503);
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from("partner_integrations")
    .select("*")
    .order("name", { ascending: true });

  if (integrationsError) {
    if (isMissingPartnerTable(integrationsError)) {
      return NextResponse.json({
        ok: true,
        migrationRequired: true,
        migration: "018_partner_integration_layer.sql",
        integrations: fallbackIntegrations(),
        events: [],
      });
    }
    return bad("Could not load partner integrations.", 500);
  }

  const { data: events, error: eventsError } = await supabase
    .from("partner_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (eventsError) {
    if (isMissingPartnerTable(eventsError)) {
      return NextResponse.json({
        ok: true,
        migrationRequired: true,
        migration: "018_partner_integration_layer.sql",
        integrations: (integrations ?? []) as PartnerIntegrationRow[],
        events: [],
      });
    }
    return bad("Could not load partner events.", 500);
  }

  return NextResponse.json({
    ok: true,
    migrationRequired: false,
    integrations: ((integrations ?? []) as PartnerIntegrationRow[]).length
      ? integrations
      : fallbackIntegrations(),
    events: (events ?? []) as PartnerEventRow[],
  });
}

export async function POST(request: Request) {
  if (!arePartnerIntegrationsEnabled()) return disabled();

  const limited = rateLimit(request, "partner-integrations:post", 20);
  if (limited) return limited;
  const session = getAdminSession(request);
  if (!session) return bad("Admin access is required.", 401);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Partner backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    providerId?: string;
    bookingId?: string;
    externalReference?: string;
    direction?: "inbound" | "outbound";
    eventType?: string;
    status?: string;
    payload?: Record<string, unknown>;
    errorMessage?: string;
  };

  const provider = textField(body.providerId, "Provider", 64, {
    required: true,
    pattern: PROVIDER_ID_PATTERN,
  });
  if (provider.error) return bad(provider.error);

  const booking = textField(body.bookingId, "Booking ID", 80, {
    pattern: BOOKING_ID_PATTERN,
  });
  if (booking.error) return bad(booking.error);

  const externalReference = textField(
    body.externalReference,
    "External reference",
    160
  );
  if (externalReference.error) return bad(externalReference.error);

  const eventType = textField(body.eventType, "Event type", 80, {
    required: true,
    pattern: EVENT_TYPE_PATTERN,
  });
  if (eventType.error) return bad(eventType.error);

  const status = textField(body.status, "Status", 80, {
    pattern: STATUS_PATTERN,
  });
  if (status.error) return bad(status.error);

  const errorMessage = textField(body.errorMessage, "Error message", 1_000);
  if (errorMessage.error) return bad(errorMessage.error);

  const payload = payloadObject(body.payload, session.email);
  if (payload.error) return bad(payload.error);

  if (!provider.value || !eventType.value) {
    return bad("Provider and event type are required.");
  }

  const providerId = provider.value;
  const bookingId = booking.value ?? null;
  const externalReferenceValue = externalReference.value ?? null;
  const statusValue = status.value ?? "manual";
  const errorMessageValue = errorMessage.value ?? null;

  const providerCheck = await requireProvider(supabase, providerId);
  if (providerCheck.response) return providerCheck.response;

  const bookingCheck = await requireBookingIfPresent(supabase, bookingId);
  if (bookingCheck.response) return bookingCheck.response;

  const { data, error } = await supabase
    .from("partner_events")
    .insert({
      provider_id: providerId,
      booking_id: bookingId,
      external_reference: externalReferenceValue,
      direction: body.direction === "inbound" ? "inbound" : "outbound",
      event_type: eventType.value,
      status: statusValue,
      payload: payload.value,
      error_message: errorMessageValue,
    })
    .select("*")
    .single<PartnerEventRow>();

  if (error) {
    if (isMissingPartnerTable(error)) {
      return bad("Apply migration 018_partner_integration_layer.sql before recording partner events.", 409, {
        migrationRequired: true,
        migration: "018_partner_integration_layer.sql",
      });
    }
    return bad("Could not record partner event.", 500);
  }

  return NextResponse.json({ ok: true, event: data });
}

export async function PATCH(request: Request) {
  if (!arePartnerIntegrationsEnabled()) return disabled();

  const limited = rateLimit(request, "partner-integrations:patch", 20);
  if (limited) return limited;
  if (!isFullAdminSession(request)) {
    return bad("Only admin can change partner integration settings.", 403);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Partner backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    active?: boolean;
    environment?: PartnerEnvironment;
    notes?: string;
  };
  const id = textField(body.id, "Integration ID", 64, {
    required: true,
    pattern: PROVIDER_ID_PATTERN,
  });
  if (id.error) return bad(id.error);
  if (!id.value) return bad("Integration ID is required.");
  const integrationId = id.value;

  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.environment && ["manual", "sandbox", "production"].includes(body.environment)) {
    patch.environment = body.environment;
  }
  if (body.notes !== undefined) {
    const notes = textField(body.notes, "Notes", 1_000);
    if (notes.error) return bad(notes.error);
    patch.notes = notes.value;
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("partner_integrations")
    .update(patch)
    .eq("id", integrationId)
    .select("*")
    .single<PartnerIntegrationRow>();

  if (error) {
    if (isMissingPartnerTable(error)) {
      return bad("Apply migration 018_partner_integration_layer.sql before editing partner integrations.", 409, {
        migrationRequired: true,
        migration: "018_partner_integration_layer.sql",
      });
    }
    return bad("Could not update partner integration.", 500);
  }

  return NextResponse.json({ ok: true, integration: data });
}
