import { getSupabaseAdmin } from "@/lib/supabase-server";

export type AuthActivityEventType = "customer_login" | "admin_login";

export async function recordAuthActivity(input: {
  userId: string;
  email: string | null;
  eventType: AuthActivityEventType;
  authLevel: "aal1" | "aal2";
  role: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false as const, error: "backend_unavailable" };

  const { error } = await supabase.from("auth_activity_events").insert({
    user_id: input.userId,
    user_email: input.email?.trim().toLowerCase() || null,
    event_type: input.eventType,
    auth_level: input.authLevel,
    user_role: input.role,
  });

  if (error) {
    console.error("Could not record authentication activity", error.message);
    return { ok: false as const, error: "insert_failed" };
  }

  return { ok: true as const };
}
