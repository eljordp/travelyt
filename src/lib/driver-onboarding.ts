import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";
export {
  AGENT_EVIDENCE_BUCKET,
  AGENT_EVIDENCE_TYPES,
  type AgentEvidenceType,
} from "@/lib/driver-onboarding-shared";

export const AGENT_ONBOARDING_TTL_HOURS = 72;

export function hashOnboardingToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function generateOnboardingToken() {
  return randomBytes(32).toString("base64url");
}

export async function getActiveOnboardingInvite(token: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !token.trim()) return null;
  const { data, error } = await supabase
    .from("agent_onboarding_invites")
    .select("id, driver_access_id, status, expires_at, first_opened_at")
    .eq("token_hash", hashOnboardingToken(token))
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<{
      id: string;
      driver_access_id: string;
      status: "active";
      expires_at: string;
      first_opened_at: string | null;
    }>();
  if (error || !data) return null;
  if (!data.first_opened_at) {
    await supabase
      .from("agent_onboarding_invites")
      .update({ first_opened_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("first_opened_at", null);
  }
  return data;
}

export function safeEvidenceExtension(contentType: string) {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/jpeg") return "jpg";
  return null;
}

export function evidenceMagicMatches(bytes: Uint8Array, contentType: string) {
  if (contentType === "application/pdf") {
    return bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}
