import { NextResponse } from "next/server";
import { isVerifiedFullAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type AccountStatus =
  | "active"
  | "confirmed_never_signed_in"
  | "unconfirmed"
  | "banned";

type AuthEventRow = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_username: string | null;
  created_at: string;
  ip_address: string | null;
};

function accountStatus(input: {
  confirmedAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
}): AccountStatus {
  if (input.bannedUntil && Date.parse(input.bannedUntil) > Date.now()) return "banned";
  if (!input.confirmedAt) return "unconfirmed";
  if (!input.lastSignInAt) return "confirmed_never_signed_in";
  return "active";
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin:accounts", 30);
  if (limited) return limited;
  if (!(await isVerifiedFullAdminSession(request))) {
    return NextResponse.json({ ok: false, error: "Full admin access required." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Account backend is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load authentication accounts." }, { status: 500 });
  }

  const accounts = data.users
    .map((user) => {
      const confirmedAt =
        user.email_confirmed_at ?? user.phone_confirmed_at ?? null;
      const role =
        typeof user.app_metadata?.role === "string"
          ? user.app_metadata.role
          : "customer";
      const fullNameSource =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : "";
      return {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        fullName: fullNameSource.trim() || null,
        role,
        status: accountStatus({
          confirmedAt,
          lastSignInAt: user.last_sign_in_at ?? null,
          bannedUntil: user.banned_until ?? null,
        }),
        createdAt: user.created_at,
        confirmedAt,
        lastSignInAt: user.last_sign_in_at ?? null,
        bannedUntil: user.banned_until ?? null,
        providers: Array.isArray(user.app_metadata?.providers)
          ? user.app_metadata.providers.filter(
              (provider): provider is string => typeof provider === "string",
            )
          : [],
      };
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  const { data: authEvents, error: authEventsError } = await supabase.rpc(
    "travelyt_admin_auth_events",
    { p_limit: 200 },
  );
  const events = authEventsError
    ? []
    : ((authEvents ?? []) as AuthEventRow[]).map((event) => ({
        id: event.id,
        action: event.action,
        userId: event.actor_id,
        email: event.actor_username,
        createdAt: event.created_at,
        ipAddress: event.ip_address,
      }));

  return NextResponse.json({
    ok: true,
    accounts,
    events,
    activityMigrationRequired: Boolean(authEventsError),
    counts: {
      total: accounts.length,
      active: accounts.filter((account) => account.status === "active").length,
      unconfirmed: accounts.filter((account) => account.status === "unconfirmed").length,
      neverSignedIn: accounts.filter(
        (account) => account.status === "confirmed_never_signed_in",
      ).length,
      banned: accounts.filter((account) => account.status === "banned").length,
    },
  });
}
