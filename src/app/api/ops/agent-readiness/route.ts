import { NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-auth";
import type { AgentReadinessProfileRow } from "@/lib/agent-assignment";
import { agentReadinessBlockers } from "@/lib/agent-assignment";
import type { DriverAccessCodeRow } from "@/lib/driver-access-server";
import { rateLimit } from "@/lib/rate-limit";
import { DRIVER_TRAINING_VERSION } from "@/lib/driver-training";
import {
  accountHolderNameMatchesVerifiedIdentity,
  STRIPE_IDENTITY_PROVIDER,
} from "@/lib/stripe-identity";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function bad(error: string, status = 400, migrationRequired = false) {
  return NextResponse.json({ ok: false, error, migrationRequired }, { status });
}

function tableMissing(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42P01" || /agent_readiness_profiles/i.test(error.message ?? "")
  ));
}

function cleanText(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

function cleanTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function publicProfile(
  access: DriverAccessCodeRow,
  profile?: AgentReadinessProfileRow,
) {
  const blockers = agentReadinessBlockers(access, profile);
  return {
    driverAccessId: access.id,
    driverName: access.driver_name,
    driverEmail: access.driver_email ?? undefined,
    accessStatus: access.status,
    accessExpiresAt: access.expires_at ?? undefined,
    status: profile?.status ?? "pending",
    identityEvidenceReference: profile?.identity_evidence_reference ?? undefined,
    identityVerifiedAt: profile?.identity_verified_at ?? undefined,
    identityExpiresAt: profile?.identity_expires_at ?? undefined,
    trainingEvidenceReference: profile?.training_evidence_reference ?? undefined,
    trainingCompletedAt: profile?.training_completed_at ?? undefined,
    trainingExpiresAt: profile?.training_expires_at ?? undefined,
    insuranceEvidenceReference: profile?.insurance_evidence_reference ?? undefined,
    insuranceVerifiedAt: profile?.insurance_verified_at ?? undefined,
    insuranceExpiresAt: profile?.insurance_expires_at ?? undefined,
    vehicleMakeModel: profile?.vehicle_make_model ?? undefined,
    licensePlate: profile?.license_plate ?? undefined,
    vehicleEvidenceReference: profile?.vehicle_evidence_reference ?? undefined,
    vehicleVerifiedAt: profile?.vehicle_verified_at ?? undefined,
    vehicleExpiresAt: profile?.vehicle_expires_at ?? undefined,
    notes: profile?.notes ?? undefined,
    updatedBy: profile?.updated_by,
    updatedAt: profile?.updated_at,
    ready: blockers.length === 0,
    blockers,
  };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "ops:agent-readiness:get", 60);
  if (limited) return limited;
  if (!(await getVerifiedAdminSession(request))) return bad("Operations access is required.", 401);
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Agent readiness backend is not configured.", 503);

  const [{ data: accessRows, error: accessError }, { data: profiles, error: profileError }] =
    await Promise.all([
      supabase.from("driver_access_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("agent_readiness_profiles").select("*").order("updated_at", { ascending: false }),
    ]);
  if (accessError) return bad("Could not load individual agent access records.", 500);
  if (profileError) {
    if (tableMissing(profileError)) {
      return bad("Apply migration 030 before recording agent readiness.", 409, true);
    }
    return bad("Could not load agent readiness evidence.", 500);
  }
  const byAccessId = new Map(
    ((profiles ?? []) as AgentReadinessProfileRow[]).map((row) => [row.driver_access_id, row]),
  );
  return NextResponse.json({
    ok: true,
    profiles: ((accessRows ?? []) as DriverAccessCodeRow[]).map((row) =>
      publicProfile(row, byAccessId.get(row.id)),
    ),
  });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "ops:agent-readiness:patch", 30);
  if (limited) return limited;
  const session = await getVerifiedAdminSession(request);
  if (!session) return bad("Operations access is required.", 401);
  if (session.role !== "admin") {
    return bad("Only full admin can certify agent readiness evidence.", 403);
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Agent readiness backend is not configured.", 503);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const driverAccessId = cleanText(body.driverAccessId, 80);
  if (!driverAccessId || !/^[0-9a-f-]{36}$/i.test(driverAccessId)) {
    return bad("Select an individual agent access record.");
  }
  const status = body.status;
  if (status !== "pending" && status !== "active" && status !== "suspended") {
    return bad("Select a valid readiness status.");
  }
  const timestampFields = [
    "trainingExpiresAt", "insuranceExpiresAt", "vehicleExpiresAt",
  ] as const;
  const timestamps = Object.fromEntries(
    timestampFields.map((field) => [field, cleanTimestamp(body[field])]),
  ) as Record<(typeof timestampFields)[number], string | null | undefined>;
  if (Object.values(timestamps).some((value) => value === undefined)) {
    return bad("Readiness dates must be valid dates and times.");
  }

  const { data: access, error: accessError } = await supabase
    .from("driver_access_codes")
    .select("id, driver_name, driver_email")
    .eq("id", driverAccessId)
    .maybeSingle<{ id: string; driver_name: string; driver_email: string | null }>();
  if (accessError || !access) return bad("Individual agent access record was not found.", 404);
  if (!access.driver_email) {
    return bad("Add the agent's email to the individual access record before certifying readiness.", 409);
  }
  const [
    { data: identity, error: identityError },
    { data: training, error: trainingError },
    { data: evidenceUploads, error: evidenceError },
  ] = await Promise.all([
    supabase
      .from("identity_verifications")
      .select("id, verified_at, expires_at, metadata, raw_document_paths")
      .eq("email", access.driver_email.trim().toLowerCase())
      .in("role", ["driver", "employee"])
      .eq("provider", STRIPE_IDENTITY_PROVIDER)
      .eq("status", "verified")
      .contains("metadata", { driver_access_id: driverAccessId })
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        verified_at: string | null;
        expires_at: string | null;
        metadata: Record<string, unknown> | null;
        raw_document_paths: unknown;
      }>(),
    supabase
      .from("agent_training_completions")
      .select("id, completed_at, reviewed_at")
      .eq("driver_access_id", driverAccessId)
      .eq("training_version", DRIVER_TRAINING_VERSION)
      .eq("passed", true)
      .eq("review_status", "accepted")
      .maybeSingle<{ id: string; completed_at: string; reviewed_at: string | null }>(),
    supabase
      .from("agent_evidence_uploads")
      .select("id, evidence_type, reviewed_at, uploaded_at")
      .eq("driver_access_id", driverAccessId)
      .eq("review_status", "accepted")
      .order("uploaded_at", { ascending: false })
      .returns<Array<{ id: string; evidence_type: string; reviewed_at: string | null; uploaded_at: string }>>(),
  ]);
  if (identityError) return bad("Could not verify the agent's provider-backed identity.", 500);
  if (trainingError || evidenceError) return bad("Could not load accepted readiness evidence.", 500);
  const identityPaths = Array.isArray(identity?.raw_document_paths)
    ? identity.raw_document_paths
    : [];
  const identityHasDocument = identityPaths.some((item) =>
    Boolean(item && typeof item === "object" && "kind" in item && item.kind === "document")
  );
  const identityHasSelfie = identityPaths.some((item) =>
    Boolean(item && typeof item === "object" && "kind" in item && item.kind === "selfie")
  );
  const identityNameMatches = Boolean(identity && accountHolderNameMatchesVerifiedIdentity({
    accountHolderName: access.driver_name,
    verifiedFirstName: typeof identity.metadata?.verified_first_name === "string"
      ? identity.metadata.verified_first_name
      : undefined,
    verifiedLastName: typeof identity.metadata?.verified_last_name === "string"
      ? identity.metadata.verified_last_name
      : undefined,
  }));
  const identityCurrent = Boolean(
    identity?.verified_at &&
      (!identity.expires_at || Date.parse(identity.expires_at) > Date.now()) &&
      identityHasDocument && identityHasSelfie && identityNameMatches,
  );
  const latestEvidence = (type: string) =>
    (evidenceUploads ?? []).find((item) => item.evidence_type === type && item.reviewed_at);
  const insuranceEvidence = latestEvidence("insurance");
  const vehicleRegistrationEvidence = latestEvidence("vehicle_registration");
  const vehiclePhotoEvidence = latestEvidence("vehicle_photo");
  const activeEvidenceComplete = Boolean(
    identityCurrent && training?.reviewed_at && insuranceEvidence &&
      vehicleRegistrationEvidence && vehiclePhotoEvidence
  );
  if (status === "active" && !activeEvidenceComplete) {
    return bad("Accepted current identity, training, insurance, vehicle registration, and vehicle photo evidence are required before activation.", 409);
  }
  if (status === "active" && Object.values(timestamps).some((value) => !value || Date.parse(value) <= Date.now())) {
    return bad("Training, insurance, and vehicle expiration dates must all be in the future before activation.", 409);
  }

  const values = {
    driver_access_id: driverAccessId,
    status,
    identity_evidence_reference: identityCurrent ? `${STRIPE_IDENTITY_PROVIDER}:${identity!.id}` : null,
    identity_verified_at: identityCurrent ? identity!.verified_at : null,
    identity_expires_at: identityCurrent ? identity!.expires_at : null,
    training_evidence_reference: training ? `training:${training.id}` : null,
    training_completed_at: training?.completed_at ?? null,
    training_expires_at: timestamps.trainingExpiresAt,
    insurance_evidence_reference: insuranceEvidence ? `agent_evidence:${insuranceEvidence.id}` : null,
    insurance_verified_at: insuranceEvidence?.reviewed_at ?? null,
    insurance_expires_at: timestamps.insuranceExpiresAt,
    vehicle_make_model: cleanText(body.vehicleMakeModel, 120),
    license_plate: cleanText(body.licensePlate, 30)?.toUpperCase() ?? null,
    vehicle_evidence_reference: vehicleRegistrationEvidence && vehiclePhotoEvidence
      ? `agent_evidence:${vehicleRegistrationEvidence.id},agent_evidence:${vehiclePhotoEvidence.id}`
      : null,
    vehicle_verified_at: vehicleRegistrationEvidence && vehiclePhotoEvidence
      ? new Date(Math.max(
          Date.parse(vehicleRegistrationEvidence.reviewed_at!),
          Date.parse(vehiclePhotoEvidence.reviewed_at!),
        )).toISOString()
      : null,
    vehicle_expires_at: timestamps.vehicleExpiresAt,
    notes: cleanText(body.notes, 1000),
    updated_by: session.email,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("agent_readiness_profiles")
    .upsert(values, { onConflict: "driver_access_id" });
  if (error) {
    if (tableMissing(error)) return bad("Apply migration 030 before recording agent readiness.", 409, true);
    console.error("Agent readiness upsert failed", error);
    return bad("Could not save agent readiness evidence.", 500);
  }
  return GET(request);
}
