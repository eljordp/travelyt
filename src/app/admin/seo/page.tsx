"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  RefreshCw,
  Save,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import AppChrome from "@/components/AppChrome";
import type { AdminRole } from "@/lib/admin-auth";
import { GA4_MEASUREMENT_ID } from "@/lib/analytics";

type SeoRanking = {
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
};

type SeoResponse = {
  ok?: boolean;
  error?: string;
  migrationRequired?: boolean;
  migration?: string;
  rankings?: SeoRanking[];
};

type GscRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  variants?: number;
};

type GscResponse = {
  ok?: boolean;
  configured?: boolean;
  error?: string;
  range?: { start: string; end: string };
  rows?: GscRow[];
  grouped?: GscRow[];
};

const pageOpportunities = [
  {
    title: "Airport city pages",
    detail: "Keep JFK, LAX, and ORD focused on real airport pickup and delivery intent.",
    href: "/cities/jfk",
  },
  {
    title: "Core quote path",
    detail: "Use Search Console queries to tighten the quote page around the words travelers use.",
    href: "/quote",
  },
  {
    title: "Airline/partner page",
    detail: "Keep partner language bounded until a real airline or storage partner is active.",
    href: "/airlines",
  },
];

const playbook = [
  "Track query, city, and device separately. Mobile local intent is not the same as desktop organic rank.",
  "Treat local pack presence as its own result. Do not blend map visibility with organic position.",
  "Expand pages only when there is proof: Search Console impressions, real bookings, or real partner demand.",
  "Avoid thin city pages. Airport pages should answer pickup, custody, timing, and delivery questions.",
];

function initialsFromEmail(value: string) {
  const [name] = value.split("@");
  const parts = name.split(/[._-]/).filter(Boolean);
  return (parts[0]?.[0] || "A").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function formatDate(value?: string) {
  if (!value) return "Not checked";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed === 0) return "Not checked";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

function rankSort(rank: number | null) {
  return rank == null ? 9999 : rank;
}

function rankLabel(rank: number | null) {
  if (rank == null) return "Not top 100";
  return `#${rank}`;
}

function rankColor(rank: number | null) {
  if (rank == null) return "text-navy/45";
  if (rank <= 3) return "text-green-600";
  if (rank <= 10) return "text-blue-600";
  if (rank <= 20) return "text-amber-600";
  return "text-navy";
}

export default function AdminSeoPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("admin");
  const [profileOpen, setProfileOpen] = useState(false);
  const [rankings, setRankings] = useState<SeoRanking[]>([]);
  const [gsc, setGsc] = useState<GscResponse | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [migration, setMigration] = useState("020_seo_rankings.sql");
  const [loading, setLoading] = useState(false);
  const [gscLoading, setGscLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/session", {
          credentials: "same-origin",
        });
        const data = (await response.json()) as {
          authenticated?: boolean;
          email?: string;
          role?: AdminRole;
        };

        if (!cancelled && response.ok && data.authenticated && data.email) {
          setAdminEmail(data.email);
          setAdminRole(data.role ?? "admin");
          await loadSeo();
          await loadGsc();
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not check login.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadSeo() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/seo", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as SeoResponse;
      if (!response.ok || !data.rankings) {
        throw new Error(data.error || "Could not load SEO rankings.");
      }
      setRankings(data.rankings);
      setMigrationRequired(Boolean(data.migrationRequired));
      if (data.migration) setMigration(data.migration);
      setDirtyIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load SEO rankings.");
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        email?: string;
        role?: AdminRole;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not sign in.");
      }
      setAdminEmail(data.email || email.trim().toLowerCase());
      setAdminRole(data.role ?? "admin");
      setPassword("");
      await loadSeo();
      await loadGsc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function loadGsc() {
    setGscLoading(true);
    try {
      const response = await fetch("/api/seo/gsc", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as GscResponse;
      if (!response.ok) {
        throw new Error(data.error || "Could not load Search Console.");
      }
      setGsc(data);
    } catch (err) {
      setGsc({
        ok: false,
        configured: false,
        error: err instanceof Error ? err.message : "Could not load Search Console.",
      });
    } finally {
      setGscLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setProfileOpen(false);
    setAdminEmail("");
    setAdminRole("admin");
    setPassword("");
    setRankings([]);
  }

  function updateRanking(id: string, patch: Partial<SeoRanking>) {
    setRankings((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    setDirtyIds((current) => new Set(current).add(id));
    setNotice("");
  }

  async function saveRanking(row: SeoRanking) {
    setSavingId(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/seo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: row.id,
          rank: row.rank,
          rankingUrl: row.ranking_url,
          localPack: row.local_pack,
          notes: row.notes,
        }),
      });
      const data = (await response.json()) as SeoResponse & {
        ranking?: SeoRanking;
      };
      if (!response.ok || !data.ranking) {
        throw new Error(data.error || "Could not save SEO ranking.");
      }
      setRankings((rows) => rows.map((item) => (item.id === row.id ? data.ranking! : item)));
      setDirtyIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
      setNotice("SEO ranking saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save SEO ranking.");
    } finally {
      setSavingId("");
    }
  }

  const sortedRankings = useMemo(
    () => [...rankings].sort((a, b) => rankSort(a.rank) - rankSort(b.rank) || a.sort_order - b.sort_order),
    [rankings]
  );

  const metrics = useMemo(() => {
    const top3 = rankings.filter((row) => row.rank != null && row.rank <= 3).length;
    const top10 = rankings.filter((row) => row.rank != null && row.rank <= 10).length;
    const notRanking = rankings.filter((row) => row.rank == null || row.rank > 20).length;
    const localPack = rankings.filter((row) => row.local_pack).length;
    return [
      { label: "Tracked searches", value: rankings.length, icon: Search },
      { label: "Top 3", value: top3, icon: Target },
      { label: "Top 10", value: top10, icon: TrendingUp },
      { label: "Needs work", value: notRanking, icon: AlertTriangle },
      { label: "Local pack", value: localPack, icon: MapPin },
    ];
  }, [rankings]);

  if (!adminEmail) {
    return (
      <AppChrome
        title="SEO"
        contentWidthClassName="max-w-7xl"
        homeHref="/admin"
        action={null}
        showBottomNav={false}
      >
        <div className="space-y-5">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm font-bold text-navy/60 hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Admin
          </Link>

          <div>
            <p className="text-sm font-semibold text-navy/55">Admin SEO</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Travelyt SEO</h1>
            <p className="mt-1 text-sm text-navy/65">
              Sign in to view rank targets, local-pack checks, and page priorities.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void login();
            }}
            className="max-w-2xl rounded-2xl bg-white p-5 shadow-sm shadow-navy/5"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5 text-navy">
                <Search className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h2 className="font-bold text-navy">Access required</h2>
                <p className="text-xs text-navy/55">Use your admin email and password.</p>
              </div>
            </div>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <label htmlFor="seo-admin-email" className="mb-1.5 block text-xs font-semibold text-navy/70">
              Email
            </label>
            <input
              id="seo-admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
            />
            <label htmlFor="seo-admin-password" className="mb-1.5 mt-4 block text-xs font-semibold text-navy/70">
              Password
            </label>
            <input
              id="seo-admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <Search className="h-4 w-4" strokeWidth={2} />}
              {loading ? "Opening..." : "Open SEO"}
            </button>
          </form>
        </div>
      </AppChrome>
    );
  }

  const canEdit = adminRole === "admin" && !migrationRequired;
  const ga4Configured = Boolean(GA4_MEASUREMENT_ID);
  const gscRows = gsc?.grouped ?? gsc?.rows ?? [];

  return (
    <AppChrome
      title="SEO"
      contentWidthClassName="max-w-7xl"
      homeHref="/admin"
      action={null}
      showBottomNav={false}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-sm font-bold text-navy/60 hover:text-navy"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Admin
            </Link>
            <p className="mt-4 text-sm font-semibold text-navy/55">Admin SEO</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Travelyt SEO</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-navy/65">
              Track the search terms that prove demand for airport luggage pickup,
              delivery, custody, and partner handoff. Keep organic rank, local pack,
              city, and device separate.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-navy/45">
              <Mail className="h-3.5 w-3.5" strokeWidth={2} />
              {adminEmail}
            </p>
          </div>

          <div className="relative self-start">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              className="flex h-11 items-center gap-2 rounded-full bg-white px-2.5 text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {initialsFromEmail(adminEmail)}
              </span>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-20 w-72 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl shadow-navy/10">
                <div className="border-b border-gray-100 p-4">
                  <p className="truncate text-sm font-bold text-navy">
                    {adminRole === "dispatcher" ? "Travelyt Dispatcher" : "Travelyt Admin"}
                  </p>
                  <p className="truncate text-xs text-navy/55">{adminEmail}</p>
                  <span className="mt-3 inline-flex rounded-full bg-[#ff6868]/10 px-2.5 py-1 text-[11px] font-bold text-[#ff6868]">
                    Role: {adminRole}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </p>
        )}
        {migrationRequired && (
          <div className="flex gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-bold">SEO table is not applied yet.</p>
              <p className="mt-1 leading-relaxed">
                Apply Supabase migration <code className="font-bold">{migration}</code> to save
                rank updates. The page is showing seed targets until the table exists.
              </p>
            </div>
          </div>
        )}
        {adminRole !== "admin" && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            Dispatchers can view SEO targets. Only full admin can save ranking updates.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
                <Icon className="mb-3 h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                <div className="text-2xl font-bold text-navy">{metric.value}</div>
                <div className="mt-1 text-xs text-navy/60">{metric.label}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.8fr)]">
          <section className="min-w-0 rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-navy">
                  <Search className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                  Ranking targets
                </h2>
                <p className="mt-1 text-sm text-navy/60">
                  Manual rank checks for Travelyt service and airport-intent searches.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadSeo();
                  void loadGsc();
                }}
                disabled={loading || gscLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading || gscLoading ? "animate-spin" : ""}`} strokeWidth={2} />
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-100">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-[#f8f9fc] text-left text-xs font-bold text-navy/55">
                    <th className="px-4 py-3">Search term</th>
                    <th className="px-4 py-3">City/device</th>
                    <th className="px-4 py-3 text-right">Rank</th>
                    <th className="px-4 py-3">Local pack</th>
                    <th className="px-4 py-3">Ranking URL</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3 text-right">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRankings.map((row) => {
                    const dirty = dirtyIds.has(row.id);
                    const disabled = !canEdit || savingId === row.id;
                    return (
                      <tr key={row.id} className="border-b border-gray-100 align-top last:border-b-0">
                        <td className="px-4 py-3">
                          <div className="font-bold text-navy">{row.query}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-navy/5 px-2 py-0.5 text-xs font-semibold text-navy/55">
                              {row.intent}
                            </span>
                            {row.target_url && (
                              <Link
                                href={row.target_url}
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#ff6868] hover:underline"
                              >
                                Target {row.target_url}
                                <ExternalLink className="h-3 w-3" strokeWidth={2} />
                              </Link>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-navy/45">
                            Checked {formatDate(row.checked_at)} via {row.source}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-navy/65">
                          <div>{row.city || "General"}</div>
                          <span className="mt-1 inline-flex rounded-full bg-[#ff6868]/10 px-2 py-0.5 text-xs font-bold text-[#ff6868]">
                            {row.device}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={row.rank ?? ""}
                            disabled={disabled}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateRanking(row.id, {
                                rank: value ? Number(value) : null,
                              });
                            }}
                            className={`w-20 rounded-xl border border-gray-200 px-3 py-2 text-right text-sm font-bold outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/35 ${rankColor(row.rank)}`}
                            placeholder="-"
                          />
                          <div className={`mt-1 text-xs font-bold ${rankColor(row.rank)}`}>
                            {rankLabel(row.rank)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 rounded-xl bg-navy/[0.03] px-3 py-2 text-xs font-bold text-navy/65">
                            <input
                              type="checkbox"
                              checked={row.local_pack}
                              disabled={disabled}
                              onChange={(event) => updateRanking(row.id, { local_pack: event.target.checked })}
                              className="h-4 w-4 accent-[#ff6868]"
                            />
                            Visible
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={row.ranking_url ?? ""}
                            disabled={disabled}
                            onChange={(event) => updateRanking(row.id, { ranking_url: event.target.value })}
                            placeholder="/cities/jfk or Google result URL"
                            className="w-56 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/35"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <textarea
                            value={row.notes ?? ""}
                            disabled={disabled}
                            onChange={(event) => updateRanking(row.id, { notes: event.target.value })}
                            className="min-h-20 w-72 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/35"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void saveRanking(row)}
                            disabled={disabled || !dirty}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {savingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                            ) : (
                              <Save className="h-3.5 w-3.5" strokeWidth={2} />
                            )}
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
              <h2 className="flex items-center gap-2 font-bold text-navy">
                <Globe2 className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                Search Console
              </h2>
              {gscLoading ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-navy/10 p-4 text-sm text-navy/60">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ff6868]" strokeWidth={2} />
                  Loading Google data...
                </div>
              ) : !gsc ? (
                <p className="mt-2 text-sm leading-relaxed text-navy/60">
                  Search Console has not loaded yet.
                </p>
              ) : !gsc.configured ? (
                <div className="mt-4 rounded-xl border border-dashed border-navy/15 p-4 text-sm leading-relaxed text-navy/60">
                  Not connected yet. Set <code className="font-bold">GSC_SERVICE_ACCOUNT_JSON</code>{" "}
                  and <code className="font-bold">GSC_SITE_URL</code>, then add the
                  service-account email to the Travelyt Search Console property.
                </div>
              ) : gsc.error ? (
                <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm leading-relaxed text-red-700">
                  {gsc.error}
                </div>
              ) : gscRows.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-navy/15 p-4 text-sm leading-relaxed text-navy/60">
                  Connected. No query rows returned for the last 28 days yet.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-gray-100">
                  <div className="border-b border-gray-100 bg-[#f8f9fc] px-3 py-2 text-xs font-bold text-navy/55">
                    Last 28 days
                    {gsc.range ? `: ${gsc.range.start} to ${gsc.range.end}` : ""}
                  </div>
                  <div className="max-h-96 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs font-bold text-navy/45">
                          <th className="px-3 py-2">Query</th>
                          <th className="px-3 py-2 text-right">Clicks</th>
                          <th className="px-3 py-2 text-right">Impr.</th>
                          <th className="px-3 py-2 text-right">Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gscRows.slice(0, 12).map((row) => (
                          <tr key={row.query} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-3 py-2">
                              <span className="font-semibold text-navy">{row.query}</span>
                              {row.variants && row.variants > 1 ? (
                                <span className="ml-1 text-xs text-navy/40">
                                  +{row.variants - 1}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-[#ff6868]">
                              {row.clicks}
                            </td>
                            <td className="px-3 py-2 text-right text-navy/55">
                              {row.impressions}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-navy">
                              {row.position.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
              <h2 className="flex items-center gap-2 font-bold text-navy">
                <BarChart3 className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                GA4
              </h2>
              <div
                className={`mt-4 flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${
                  ga4Configured
                    ? "border-green-100 bg-green-50 text-green-800"
                    : "border-dashed border-navy/15 text-navy/60"
                }`}
              >
                {ga4Configured ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" strokeWidth={2} />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-700" strokeWidth={2} />
                )}
                <div>
                  <p className="font-bold">
                    {ga4Configured ? "Measurement ID is configured." : "Measurement ID is not set."}
                  </p>
                  <p className="mt-1">
                    {ga4Configured
                      ? "Travelyt sends page views, quote clicks, lead captures, booking requests, checkout starts, and purchases."
                      : "Set NEXT_PUBLIC_GA_MEASUREMENT_ID in Vercel to turn on page views and conversion events."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
              <h2 className="flex items-center gap-2 font-bold text-navy">
                <BarChart3 className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                SEO playbook
              </h2>
              <div className="mt-3 space-y-3">
                {playbook.map((item) => (
                  <div key={item} className="flex gap-3 rounded-xl bg-[#f8f9fc] p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" strokeWidth={2} />
                    <p className="text-sm leading-relaxed text-navy/65">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
              <h2 className="flex items-center gap-2 font-bold text-navy">
                <Target className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                Page opportunities
              </h2>
              <div className="mt-3 space-y-3">
                {pageOpportunities.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="block rounded-xl border border-navy/10 p-3 transition-colors hover:border-[#ff6868]/40 hover:bg-[#ff6868]/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-navy">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-navy/60">{item.detail}</p>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-navy/35" strokeWidth={2} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppChrome>
  );
}
