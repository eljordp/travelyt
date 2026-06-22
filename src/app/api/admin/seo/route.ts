import { NextResponse } from "next/server";
import { getAdminSession, isFullAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const MIGRATION = "020_seo_rankings.sql";
const MAX_NOTES_LENGTH = 600;
const MAX_URL_LENGTH = 240;

type SeoRankingRow = {
  id: string;
  query: string;
  city: string | null;
  device: "desktop" | "mobile";
  intent: "service" | "city" | "airport" | "partner" | "brand";
  target_url: string | null;
  rank: number | null;
  ranking_url: string | null;
  local_pack: boolean;
  serp_feature: string | null;
  source: "seed" | "baseline" | "manual" | "monitor" | "gsc";
  notes: string | null;
  checked_at: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

const fallbackRankings: SeoRankingRow[] = [
  {
    id: "jfk-luggage-pickup-delivery",
    query: "JFK luggage pickup and delivery",
    city: "New York",
    device: "desktop",
    intent: "airport",
    target_url: "/cities/jfk",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Primary JFK service-intent term. Track organic rank and map pack separately.",
    checked_at: new Date(0).toISOString(),
    sort_order: 10,
  },
  {
    id: "jfk-luggage-delivery-hotel",
    query: "luggage delivery to hotel NYC",
    city: "New York",
    device: "mobile",
    intent: "city",
    target_url: "/cities/jfk",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Mobile local-intent query for travelers already near the airport or hotel.",
    checked_at: new Date(0).toISOString(),
    sort_order: 20,
  },
  {
    id: "lax-luggage-delivery",
    query: "LAX luggage delivery service",
    city: "Los Angeles",
    device: "desktop",
    intent: "airport",
    target_url: "/cities/lax",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Track when the LAX city page starts earning airport-specific impressions.",
    checked_at: new Date(0).toISOString(),
    sort_order: 30,
  },
  {
    id: "ord-luggage-delivery",
    query: "ORD luggage delivery service",
    city: "Chicago",
    device: "desktop",
    intent: "airport",
    target_url: "/cities/ord",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Track Chicago airport demand before expanding ORD content further.",
    checked_at: new Date(0).toISOString(),
    sort_order: 40,
  },
  {
    id: "airport-luggage-delivery-service",
    query: "airport luggage delivery service",
    city: null,
    device: "desktop",
    intent: "service",
    target_url: "/quote",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "General service term. Good for measuring whether the core offer is legible.",
    checked_at: new Date(0).toISOString(),
    sort_order: 50,
  },
  {
    id: "airport-baggage-courier",
    query: "airport baggage courier service",
    city: null,
    device: "desktop",
    intent: "service",
    target_url: "/quote",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Courier language may convert better for business and official travel contexts.",
    checked_at: new Date(0).toISOString(),
    sort_order: 60,
  },
  {
    id: "luggage-pickup-near-me",
    query: "luggage pickup near me",
    city: null,
    device: "mobile",
    intent: "service",
    target_url: "/quote",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Local-pack-sensitive query. Only call a win if Travelyt appears in the actual local pack.",
    checked_at: new Date(0).toISOString(),
    sort_order: 70,
  },
  {
    id: "airline-luggage-handoff",
    query: "airline luggage handoff service",
    city: null,
    device: "desktop",
    intent: "partner",
    target_url: "/airlines",
    rank: null,
    ranking_url: null,
    local_pack: false,
    serp_feature: null,
    source: "seed",
    notes: "Partner-adjacent term. Keep claims bounded unless an airline relationship is real.",
    checked_at: new Date(0).toISOString(),
    sort_order: 80,
  },
];

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

function isMissingSeoTable(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "");
  return /seo_rankings|does not exist|schema cache/i.test(message);
}

function cleanOptionalText(value: unknown, label: string, maxLength: number) {
  if (value == null) return { value: null as string | null };
  if (typeof value !== "string") return { error: `${label} must be text.` };
  const text = value.trim();
  if (!text) return { value: null as string | null };
  if (text.length > maxLength) {
    return { error: `${label} must be ${maxLength} characters or less.` };
  }
  return { value: text };
}

function cleanRank(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { value: null as number | null };
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { error: "Rank must be a whole number." };
  }
  if (value < 1 || value > 100) {
    return { error: "Rank must be between 1 and 100." };
  }
  return { value };
}

function cleanUrl(value: unknown, label: string) {
  const cleaned = cleanOptionalText(value, label, MAX_URL_LENGTH);
  if (cleaned.error || !cleaned.value) return cleaned;
  if (!/^\/[^\s]*$/.test(cleaned.value) && !/^https?:\/\/[^\s]+$/i.test(cleaned.value)) {
    return { error: `${label} must be a site path or http URL.` };
  }
  return cleaned;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin-seo:get", 60);
  if (limited) return limited;
  if (!getAdminSession(request)) return bad("Admin access is required.", 401);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("SEO backend is not configured.", 503);

  const { data, error } = await supabase
    .from("seo_rankings")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("query", { ascending: true });

  if (error) {
    if (isMissingSeoTable(error)) {
      return NextResponse.json({
        ok: true,
        migrationRequired: true,
        migration: MIGRATION,
        rankings: fallbackRankings,
      });
    }
    return bad("Could not load SEO rankings.", 500);
  }

  return NextResponse.json({
    ok: true,
    migrationRequired: false,
    migration: MIGRATION,
    rankings: (data ?? []) as SeoRankingRow[],
  });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "admin-seo:patch", 40);
  if (limited) return limited;
  if (!isFullAdminSession(request)) return bad("Full admin access is required.", 403);

  const supabase = getSupabaseAdmin();
  if (!supabase) return bad("SEO backend is not configured.", 503);

  const body = (await request.json()) as {
    id?: unknown;
    rank?: unknown;
    rankingUrl?: unknown;
    localPack?: unknown;
    notes?: unknown;
  };

  if (typeof body.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,80}$/i.test(body.id)) {
    return bad("Ranking id is invalid.");
  }

  const rank = cleanRank(body.rank);
  if (rank.error) return bad(rank.error);

  const rankingUrl = cleanUrl(body.rankingUrl, "Ranking URL");
  if (rankingUrl.error) return bad(rankingUrl.error);

  const notes = cleanOptionalText(body.notes, "Notes", MAX_NOTES_LENGTH);
  if (notes.error) return bad(notes.error);

  if (typeof body.localPack !== "boolean") {
    return bad("Local pack must be true or false.");
  }

  const { data, error } = await supabase
    .from("seo_rankings")
    .update({
      rank: rank.value,
      ranking_url: rankingUrl.value,
      local_pack: body.localPack,
      notes: notes.value,
      source: "manual",
      checked_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("*")
    .maybeSingle<SeoRankingRow>();

  if (error) {
    if (isMissingSeoTable(error)) {
      return bad(
        `Apply migration ${MIGRATION} before saving SEO rankings.`,
        409,
        { migrationRequired: true, migration: MIGRATION }
      );
    }
    return bad("Could not save SEO ranking.", 500);
  }

  if (!data) return bad("SEO ranking was not found.", 404);

  return NextResponse.json({ ok: true, ranking: data });
}
