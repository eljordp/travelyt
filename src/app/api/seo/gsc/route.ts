import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  getAccessToken,
  gscConfig,
  isoDate,
  querySearchAnalytics,
} from "@/lib/gsc-api";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type GscRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function groupByWordSet(rows: GscRow[]) {
  const groups = new Map<
    string,
    {
      best: GscRow;
      variants: number;
      clicks: number;
      impressions: number;
      posWeighted: number;
    }
  >();

  for (const row of rows) {
    const key = row.query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
    if (!key) continue;

    const group =
      groups.get(key) ?? {
        best: row,
        variants: 0,
        clicks: 0,
        impressions: 0,
        posWeighted: 0,
      };
    if (row.impressions > group.best.impressions) group.best = row;
    group.variants += 1;
    group.clicks += row.clicks;
    group.impressions += row.impressions;
    group.posWeighted += row.position * row.impressions;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      query: group.best.query,
      variants: group.variants,
      clicks: group.clicks,
      impressions: group.impressions,
      ctr: group.impressions ? group.clicks / group.impressions : 0,
      position: group.impressions ? group.posWeighted / group.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 25);
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "seo-gsc:get", 60);
  if (limited) return limited;
  if (!getAdminSession(request)) return json({ ok: false, error: "Admin access is required." }, 401);

  const config = gscConfig();
  if (!config) return json({ ok: true, configured: false });

  try {
    const token = await getAccessToken(config);
    const start = isoDate(28);
    const end = isoDate(1);
    const data = await querySearchAnalytics(token, config.siteUrl, {
      startDate: start,
      endDate: end,
      dimensions: ["query"],
      rowLimit: 250,
      orderBy: [{ field: "clicks", descending: true }],
    });

    const rows = ((data.rows ?? []) as Array<{
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>).map((row) => ({
      query: row.keys?.[0] || "",
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }));

    return json({
      ok: true,
      configured: true,
      range: { start, end },
      grouped: groupByWordSet(rows),
      rows: rows.slice(0, 25),
    });
  } catch (error) {
    return json({
      ok: true,
      configured: true,
      error: error instanceof Error ? error.message : "Search Console request failed",
    });
  }
}
