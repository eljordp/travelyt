import { NextResponse } from "next/server";
import { getRequestUser, getSupabaseAdmin } from "@/lib/supabase-server";
import {
  destroyIdentityOriginals,
  requestIdentityProviderRedaction,
  type IdentityRetentionRow,
} from "@/lib/identity-retention";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("Account backend is not configured.", 503);

  const user = await getRequestUser(request);
  if (!user) return bad("Sign in again before deleting your account.", 401);

  const { data: claim, error: claimError } = await supabase.rpc(
    "claim_account_deletion",
    { p_user_id: user.id },
  );
  if (claimError) {
    console.error("Could not safely claim account deletion", claimError);
    return bad("Could not start protected account deletion.", 500);
  }
  const deletionClaim = claim as {
    ok?: boolean;
    reason?:
      | "claimed"
      | "account_not_found"
      | "legal_hold"
      | "active_service"
      | "identity_archive_in_progress"
      | "identity_destruction_in_progress"
      | "provider_session_creation_in_progress"
      | "provider_session_creation_outcome_unknown"
      | "provider_redaction_in_progress"
      | "retained_record_review";
    identity_ids?: unknown;
  } | null;
  if (!deletionClaim?.ok) {
    if (deletionClaim?.reason === "active_service") {
      return bad(
        "Account deletion is paused while a paid, assigned, or in-custody booking is active. Close or cancel the service first.",
        409,
      );
    }
    if (deletionClaim?.reason === "legal_hold") {
      return bad(
        "Account deletion requires privacy review because an identity record is under legal hold.",
        409,
      );
    }
    if (deletionClaim?.reason === "retained_record_review") {
      return bad(
        "Your deletion request was recorded for privacy review because this account has driver, payment, partner, or completed-custody records with separate retention duties.",
        409,
      );
    }
    if (
      deletionClaim?.reason === "identity_archive_in_progress" ||
      deletionClaim?.reason === "identity_destruction_in_progress" ||
      deletionClaim?.reason === "provider_session_creation_in_progress" ||
      deletionClaim?.reason === "provider_session_creation_outcome_unknown" ||
      deletionClaim?.reason === "provider_redaction_in_progress"
    ) {
      return bad(
        "Account deletion is paused while protected identity-image work finishes. Wait a moment and try again.",
        409,
      );
    }
    return bad("The account could not be claimed for deletion.", 409);
  }

  const claimedIdentityIds = Array.isArray(deletionClaim.identity_ids)
    ? deletionClaim.identity_ids.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];

  const identityResult = claimedIdentityIds.length
    ? await supabase
        .from("identity_verifications")
        .select("id, provider_session_id, provider_session_livemode, provider_redaction_status, provider_redaction_claim_token, provider_redaction_claimed_at, raw_document_paths, raw_retention_until, raw_purpose_ended_at, raw_legal_hold_at, raw_deletion_status, metadata")
        .in("id", claimedIdentityIds)
    : { data: [], error: null };
  const { data: identityRows, error: identityError } = identityResult;
  if (identityError) {
    console.error("Could not load identity originals before account deletion", identityError);
    return bad("Could not verify identity-record deletion readiness.", 500);
  }
  const rows = (identityRows ?? []) as IdentityRetentionRow[];
  if (rows.some((row) => row.raw_legal_hold_at)) {
    return bad("Account deletion requires privacy review because an identity record is under legal hold.", 409);
  }
  for (const row of rows) {
    if (row.raw_deletion_status === "destroyed") {
      const providerRedaction = await requestIdentityProviderRedaction({
        supabase,
        row,
        reason: "account_deleted",
      });
      if (!providerRedaction.ok) {
        console.error("Identity provider redaction failed before account deletion", providerRedaction.error);
        return bad("Could not delete the account because identity-provider redaction did not start.", 502);
      }
    } else {
      const destruction = await destroyIdentityOriginals({
        supabase,
        row,
        reason: "account_deleted",
      });
      if (!destruction.ok) {
        console.error("Identity original destruction failed before account deletion", destruction.error);
        return bad("Could not delete the account because stored identity images were not destroyed.", 502);
      }
    }
  }

  const remainingResult = claimedIdentityIds.length
    ? await supabase
        .from("identity_verifications")
        .select("id", { count: "exact", head: true })
        .in("id", claimedIdentityIds)
        .neq("raw_deletion_status", "destroyed")
    : { count: 0, error: null };
  const { count: remainingIdentityCount, error: remainingIdentityError } = remainingResult;
  if (remainingIdentityError || (remainingIdentityCount ?? 0) > 0) {
    console.error(
      "Account deletion stopped because identity destruction is incomplete",
      remainingIdentityError,
    );
    return bad("Could not delete the account because identity destruction is incomplete.", 502);
  }

  const { data: detached, error: detachError } = await supabase.rpc(
    "finalize_account_deletion_identity_detachment",
    { p_user_id: user.id },
  );
  if (detachError || detached !== true) {
    console.error("Account identity audit detachment failed", detachError);
    return bad("Could not finalize privacy-safe account deletion.", 502);
  }

  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Supabase account deletion failed", error);
    return bad("Could not delete account.", 500);
  }

  return NextResponse.json({ ok: true });
}
