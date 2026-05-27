"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  LogOut,
  Mail,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import AppChrome from "@/components/AppChrome";
import {
  formatPrice,
  SERVICE_LABELS,
  STATUS_LABELS,
  type Booking,
} from "@/lib/bookings";

const statusOptions: Array<Booking["status"] | "all"> = [
  "all",
  "pending",
  "paid",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
];

const statusColors: Record<Booking["status"], string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  assigned: "bg-indigo-100 text-indigo-700",
  picked_up: "bg-purple-100 text-purple-700",
  in_transit: "bg-cyan-100 text-cyan-700",
  delivered: "bg-green-100 text-green-700",
};

function formatDate(value?: string) {
  if (!value) return "Not set";
  const parsed = Date.parse(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

function toCsvValue(value: string | number | undefined) {
  const text = `${value ?? ""}`.replaceAll('"', '""');
  return `"${text}"`;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Booking["status"] | "all">("all");
  const [updatingId, setUpdatingId] = useState("");

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
        };

        if (!cancelled && response.ok && data.authenticated && data.email) {
          setAdminEmail(data.email);
          await loadBookings();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not check login.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/bookings", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        bookings?: Booking[];
      };

      if (!response.ok || !data.bookings) {
        throw new Error(data.error || "Could not load bookings.");
      }

      setBookings(data.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bookings.");
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
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        email?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not sign in.");
      }

      setAdminEmail(data.email || email.trim().toLowerCase());
      setPassword("");
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function updateBooking(id: string, patch: Partial<Booking>) {
    if (!adminEmail) return;
    setUpdatingId(id);
    setError("");

    try {
      const response = await fetch("/api/bookings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ id, patch }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        booking?: Booking;
      };

      if (!response.ok || !data.booking) {
        throw new Error(data.error || "Could not update booking.");
      }

      setBookings((rows) =>
        rows.map((booking) => (booking.id === id ? data.booking! : booking))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update booking.");
    } finally {
      setUpdatingId("");
    }
  }

  async function signOut() {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setAdminEmail("");
    setPassword("");
    setBookings([]);
  }

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesStatus = status === "all" || booking.status === status;
      const matchesQuery =
        !clean ||
        [
          booking.id,
          booking.name,
          booking.email,
          booking.phone,
          booking.airport,
          booking.address,
          booking.driverName,
          booking.flight,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(clean));

      return matchesStatus && matchesQuery;
    });
  }, [bookings, query, status]);

  const metrics = useMemo(() => {
    const active = bookings.filter((booking) => booking.status !== "delivered");
    const paid = bookings.filter((booking) => booking.status === "paid");
    const revenueCents = bookings.reduce(
      (sum, booking) => sum + booking.priceCents,
      0
    );
    const bags = bookings.reduce((sum, booking) => sum + booking.bags, 0);

    return [
      { label: "Bookings", value: `${bookings.length}`, icon: BriefcaseBusiness },
      { label: "Active", value: `${active.length}`, icon: Truck },
      { label: "Awaiting driver", value: `${paid.length}`, icon: Package },
      { label: "Pipeline", value: formatPrice(revenueCents), icon: CheckCircle2 },
      { label: "Bags", value: `${bags}`, icon: Users },
    ];
  }, [bookings]);

  function exportCsv() {
    const header = [
      "id",
      "status",
      "service",
      "airport",
      "date",
      "bags",
      "price",
      "name",
      "email",
      "phone",
      "address",
      "driver",
      "created_at",
    ];
    const rows = filtered.map((booking) => [
      booking.id,
      STATUS_LABELS[booking.status],
      SERVICE_LABELS[booking.service],
      booking.airport,
      booking.date,
      booking.bags,
      formatPrice(booking.priceCents),
      booking.name,
      booking.email,
      booking.phone,
      booking.address,
      booking.driverName,
      booking.createdAt,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(toCsvValue).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `travelyt-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!adminEmail) {
    return (
      <AppChrome title="Admin">
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-navy/55">
              Admin portal
            </p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Travelyt Admin</h1>
            <p className="mt-1 text-sm text-navy/65">
              Sign in to view bookings and operations.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void login();
            }}
            className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5 text-navy">
                <ShieldCheck className="h-5 w-5" strokeWidth={2} />
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

            <label
              htmlFor="admin-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy/70"
            >
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10"
            />
            <label
              htmlFor="admin-password"
              className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wider text-navy/70"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-4 w-full rounded-xl bg-[#c41e2a] px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Opening..." : "Open admin"}
            </button>
          </form>
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title="Admin">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-navy/55">
              Admin portal
            </p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Operations</h1>
            <p className="mt-1 text-sm text-navy/65">
              Bookings, revenue, status, and driver assignment.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-navy/45">
              <Mail className="h-3.5 w-3.5" strokeWidth={2} />
              {adminEmail}
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5"
              >
                <Icon className="mb-3 h-5 w-5 text-[#c41e2a]" strokeWidth={2} />
                <div className="truncate text-xl font-bold text-navy">
                  {metric.value}
                </div>
                <div className="mt-1 text-xs text-navy/60">{metric.label}</div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
          <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search id, customer, airport, driver"
                className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10"
              />
            </label>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Booking["status"] | "all")
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-navy outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All status" : STATUS_LABELS[option]}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadBookings()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Refresh
            </button>
            <button
              onClick={exportCsv}
              disabled={!filtered.length}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c41e2a] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              CSV
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {loading && bookings.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-sm text-navy/65 shadow-sm shadow-navy/5">
              Loading bookings...
            </div>
          ) : filtered.length ? (
            filtered.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                disabled={updatingId === booking.id}
                onPatch={(patch) => updateBooking(booking.id, patch)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-navy/15 bg-white/60 p-8 text-center text-sm text-navy/65">
              No bookings match this view.
            </div>
          )}
        </div>
      </div>
    </AppChrome>
  );
}

function BookingCard({
  booking,
  disabled,
  onPatch,
}: {
  booking: Booking;
  disabled: boolean;
  onPatch: (patch: Partial<Booking>) => void | Promise<void>;
}) {
  const [driverName, setDriverName] = useState(booking.driverName ?? "");

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/booking/${booking.id}`}
              className="font-bold text-navy hover:underline"
            >
              {booking.id}
            </Link>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                statusColors[booking.status]
              }`}
            >
              {STATUS_LABELS[booking.status]}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-navy">
            {booking.name}
          </p>
          <p className="mt-0.5 text-xs text-navy/60">
            {booking.email} · {booking.phone}
          </p>
        </div>
        <Link
          href={`/booking/${booking.id}`}
          className="inline-flex items-center gap-1 self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
        >
          View <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-navy/70 sm:grid-cols-2">
        <Info label="Service" value={`${SERVICE_LABELS[booking.service]} · ${booking.bags} bag${booking.bags > 1 ? "s" : ""}`} />
        <Info label="Airport" value={`${booking.airport} · ${formatDate(booking.date)}`} />
        <Info label="Address" value={booking.address} />
        <Info label="Price" value={formatPrice(booking.priceCents)} />
        {booking.flight && <Info label="Flight" value={booking.flight} />}
        {booking.notes && <Info label="Notes" value={booking.notes} />}
      </div>

      <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[180px_1fr_auto]">
        <select
          value={booking.status}
          disabled={disabled}
          onChange={(event) =>
            void onPatch({ status: event.target.value as Booking["status"] })
          }
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-navy outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 disabled:opacity-60"
        >
          {statusOptions
            .filter((option) => option !== "all")
            .map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
        </select>
        <input
          value={driverName}
          onChange={(event) => setDriverName(event.target.value)}
          placeholder="Driver name"
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10"
        />
        <button
          disabled={disabled}
          onClick={() =>
            void onPatch({
              driverName: driverName.trim() || undefined,
              assignedAt: driverName.trim()
                ? booking.assignedAt ?? new Date().toISOString()
                : undefined,
            })
          }
          className="rounded-xl bg-[#c41e2a] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {disabled ? "Saving..." : "Assign"}
        </button>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-navy/45">
        {label}
      </div>
      <div className="mt-0.5 break-words text-navy/75">{value}</div>
    </div>
  );
}
