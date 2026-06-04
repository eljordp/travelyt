"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Settings,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import AppChrome from "@/components/AppChrome";
import type { AdminRole } from "@/lib/admin-auth";
import { DRIVER_OPTIONS } from "@/lib/drivers";
import {
  formatPrice,
  getBookingStatusLabel,
  ISSUE_TYPE_LABELS,
  SERVICE_LABELS,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  type BookingIssueType,
  type Booking,
} from "@/lib/bookings";
import { getSlaAlerts, latestLocationEvent } from "@/lib/ops-rules";

interface OpsException {
  id: string;
  booking_id: string | null;
  severity: "info" | "warning" | "critical";
  code: string;
  status: "open" | "acknowledged" | "resolved";
  message: string;
  created_at: string;
  resolved_at?: string | null;
}

interface DriverAccessCode {
  id: string;
  driverName: string;
  driverEmail?: string;
  driverPhone?: string;
  role: string;
  codePreview: string;
  status: "active" | "revoked" | "expired";
  createdAt: string;
  createdBy?: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  revokedBy?: string;
}

const statusOptions: Array<Booking["status"] | "all"> = [
  "all",
  "pending",
  "paid",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
  "delivered",
  "closed",
  "cancelled",
  "issue",
];

const statusColors: Record<Booking["status"], string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  assigned: "bg-indigo-100 text-indigo-700",
  accepted: "bg-sky-100 text-sky-700",
  en_route: "bg-cyan-100 text-cyan-700",
  arrived: "bg-teal-100 text-teal-700",
  picked_up: "bg-purple-100 text-purple-700",
  in_transit: "bg-blue-100 text-blue-700",
  delivery_pending: "bg-orange-100 text-orange-700",
  delivered: "bg-green-100 text-green-700",
  closed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-700",
  issue: "bg-red-100 text-red-700",
};

const issueOptions = Object.keys(ISSUE_TYPE_LABELS) as BookingIssueType[];

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

function isStalePending(booking: Booking) {
  if (booking.status !== "pending") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsed = Date.parse(`${booking.date}T00:00:00`);
  return !Number.isNaN(parsed) && parsed < today.getTime();
}

function toCsvValue(value: string | number | null | undefined) {
  const text = `${value ?? ""}`.replaceAll('"', '""');
  return `"${text}"`;
}

function initialsFromEmail(value: string) {
  const [name] = value.split("@");
  const parts = name.split(/[._-]/).filter(Boolean);
  return (parts[0]?.[0] || "A").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function custodyBlockers(booking: Booking) {
  const blockers: string[] = [];
  if (!booking.customerIdentityVerifiedAt) {
    blockers.push("Customer ID review is not complete.");
  }
  if (!booking.driverIdentityVerifiedAt) {
    blockers.push("Driver ID review is not complete.");
  }
  if (!booking.restrictedItemsAttestedAt) {
    blockers.push("Manual ID/bag review is not complete.");
  }
  return blockers;
}

function latestProof(booking: Booking, kind: Booking["proofs"][number]["kind"]) {
  return [...booking.proofs].reverse().find((proof) => proof.kind === kind);
}

function workflowBlockers(booking: Booking) {
  const blockers: string[] = [];

  if (booking.archivedAt) {
    return ["Archived from active operations. Restore it before resuming work."];
  }

  if (booking.status === "pending") {
    blockers.push("Payment or manual confirmation is not complete.");
  }
  if (booking.status === "paid" && !booking.driverName) {
    blockers.push("No driver is assigned.");
  }
  if (booking.status === "assigned") {
    blockers.push("Driver has not accepted the assigned job.");
  }
  if (booking.status === "accepted") {
    blockers.push("Driver has not started route.");
  }
  if (booking.status === "en_route") {
    blockers.push("Driver has not marked arrival.");
  }
  if (booking.status === "arrived") {
    blockers.push(...custodyBlockers(booking));
  }
  if (
    booking.service !== "arrival" &&
    booking.status === "picked_up" &&
    !latestProof(booking, "seal")?.approvedAt
  ) {
    blockers.push("Customer seal approval is still pending.");
  }
  if (booking.status === "delivery_pending") {
    blockers.push("Customer delivery confirmation is still pending.");
  }
  if (booking.status === "issue") {
    blockers.push("Booking is marked Issue / Failed and needs ops resolution.");
  }

  return blockers;
}

function adminStatusPatch(
  booking: Booking,
  nextStatus: Booking["status"]
): Partial<Booking> {
  const now = new Date().toISOString();
  const patch: Partial<Booking> = { status: nextStatus };

  if (nextStatus === "paid") patch.paidAt = booking.paidAt ?? now;
  if (nextStatus === "assigned") patch.assignedAt = booking.assignedAt ?? now;
  if (nextStatus === "accepted") patch.acceptedAt = booking.acceptedAt ?? now;
  if (nextStatus === "en_route") patch.enRouteAt = booking.enRouteAt ?? now;
  if (nextStatus === "arrived") patch.arrivedAt = booking.arrivedAt ?? now;
  if (nextStatus === "picked_up") patch.pickedUpAt = booking.pickedUpAt ?? now;
  if (nextStatus === "delivery_pending") {
    patch.deliveryPendingAt = booking.deliveryPendingAt ?? now;
  }
  if (nextStatus === "delivered") patch.deliveredAt = booking.deliveredAt ?? now;
  if (nextStatus === "closed") {
    patch.closedAt = booking.closedAt ?? now;
    patch.customerConfirmedAt = booking.customerConfirmedAt ?? now;
  }

  return patch;
}

function formatAuditTime(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function auditTitle(entry: NonNullable<Booking["statusHistory"]>[number]) {
  const actor = entry.actorName || entry.actorRole;
  if (entry.action === "manual_review_override") {
    return `${actor} completed manual ID/bag review`;
  }
  if (entry.action === "proof_added") {
    return `${actor} added custody proof`;
  }
  if (entry.action === "archive_toggle") {
    return `${actor} updated archive visibility`;
  }
  const from = entry.fromStatus ? STATUS_LABELS[entry.fromStatus] : "Unknown";
  const to = entry.toStatus ? STATUS_LABELS[entry.toStatus] : "Unknown";
  return `${actor} changed status from ${from} to ${to}`;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("admin");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [exceptions, setExceptions] = useState<OpsException[]>([]);
  const [driverCodes, setDriverCodes] = useState<DriverAccessCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Booking["status"] | "all">("all");
  const [archiveView, setArchiveView] = useState<"active" | "archived" | "all">(
    "active"
  );
  const [updatingId, setUpdatingId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverEmail, setNewDriverEmail] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [generatedDriverCode, setGeneratedDriverCode] = useState("");
  const [creatingDriverCode, setCreatingDriverCode] = useState(false);

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
          await loadBookings();
          await loadExceptions();
          await loadDriverCodes();
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
      const response = await fetch("/api/bookings?includeArchived=1", {
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

  async function loadExceptions() {
    try {
      const response = await fetch("/api/ops-exceptions", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        exceptions?: OpsException[];
      };
      if (response.ok && data.exceptions) setExceptions(data.exceptions);
    } catch {}
  }

  async function updateException(
    id: string,
    nextStatus: OpsException["status"]
  ) {
    setError("");
    try {
      const response = await fetch("/api/ops-exceptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, status: nextStatus }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        exception?: OpsException;
      };
      if (!response.ok || !data.exception) {
        throw new Error(data.error || "Could not update ops exception.");
      }
      setExceptions((rows) =>
        nextStatus === "resolved"
          ? rows.filter((row) => row.id !== id)
          : rows.map((row) => (row.id === id ? data.exception! : row))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update ops exception."
      );
    }
  }

  async function loadDriverCodes() {
    try {
      const response = await fetch("/api/drivers/access-codes", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        accessCodes?: DriverAccessCode[];
      };
      if (response.ok && data.accessCodes) setDriverCodes(data.accessCodes);
    } catch {}
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
        role?: AdminRole;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not sign in.");
      }

      setAdminEmail(data.email || email.trim().toLowerCase());
      setAdminRole(data.role ?? "admin");
      setPassword("");
      await loadBookings();
      await loadExceptions();
      await loadDriverCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function updateBooking(
    id: string,
    patch: Partial<Booking>,
    reason?: string
  ) {
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
        body: JSON.stringify({ id, patch, reason }),
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
    setProfileOpen(false);
    setAdminEmail("");
    setAdminRole("admin");
    setPassword("");
    setBookings([]);
    setExceptions([]);
    setDriverCodes([]);
    setGeneratedDriverCode("");
  }

  async function createDriverCode() {
    if (!newDriverName.trim()) {
      setError("Enter a driver name before creating an access code.");
      return;
    }
    setCreatingDriverCode(true);
    setError("");
    setGeneratedDriverCode("");

    try {
      const response = await fetch("/api/drivers/access-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          driverName: newDriverName,
          driverEmail: newDriverEmail,
          driverPhone: newDriverPhone,
          role: "driver",
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        accessCode?: DriverAccessCode;
        oneTimeCode?: string;
      };
      if (!response.ok || !data.accessCode || !data.oneTimeCode) {
        throw new Error(data.error || "Could not create driver access code.");
      }
      setGeneratedDriverCode(data.oneTimeCode);
      setDriverCodes((rows) => [data.accessCode!, ...rows]);
      setNewDriverName("");
      setNewDriverEmail("");
      setNewDriverPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create driver access code.");
    } finally {
      setCreatingDriverCode(false);
    }
  }

  async function revokeDriverCode(id: string) {
    setError("");
    try {
      const response = await fetch("/api/drivers/access-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, action: "revoke" }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        accessCode?: DriverAccessCode;
      };
      if (!response.ok || !data.accessCode) {
        throw new Error(data.error || "Could not revoke driver access code.");
      }
      setDriverCodes((rows) =>
        rows.map((row) => (row.id === id ? data.accessCode! : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke driver access code.");
    }
  }

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      const archived = Boolean(booking.archivedAt);
      if (archiveView === "active" && archived) return false;
      if (archiveView === "archived" && !archived) return false;
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
  }, [archiveView, bookings, query, status]);

  const metrics = useMemo(() => {
    const operationalBookings = bookings.filter((booking) => !booking.archivedAt);
    const active = operationalBookings.filter(
      (booking) => !TERMINAL_STATUSES.includes(booking.status)
    );
    const paid = operationalBookings.filter((booking) => booking.status === "paid");
    const revenueCents = operationalBookings.reduce(
      (sum, booking) => sum + booking.priceCents,
      0
    );
    const bags = operationalBookings.reduce((sum, booking) => sum + booking.bags, 0);
    const slaRisk = operationalBookings.filter((booking) => getSlaAlerts(booking).length > 0);

    return [
      { label: "Live bookings", value: `${operationalBookings.length}`, icon: BriefcaseBusiness },
      { label: "Active", value: `${active.length}`, icon: Truck },
      { label: "Awaiting driver", value: `${paid.length}`, icon: Package },
      { label: "Pipeline", value: formatPrice(revenueCents), icon: CheckCircle2 },
      { label: "SLA risk", value: `${slaRisk.length}`, icon: Clock3 },
      { label: "Bags", value: `${bags}`, icon: Users },
    ];
  }, [bookings]);

  const archivedCount = useMemo(
    () => bookings.filter((booking) => booking.archivedAt).length,
    [bookings]
  );

  const stalePending = useMemo(
    () => bookings.filter((booking) => isStalePending(booking)),
    [bookings]
  );

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
      "archived_at",
    ];
    const rows = filtered.map((booking) => [
      booking.id,
      getBookingStatusLabel(booking),
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
      booking.archivedAt,
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
      <AppChrome
        title="Admin"
        contentWidthClassName="max-w-7xl"
        hideBottomNavOnDesktop
      >
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
            className="max-w-2xl rounded-2xl bg-white p-5 shadow-sm shadow-navy/5"
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
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
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
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-4 w-full rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Opening..." : "Open admin"}
            </button>
          </form>
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      title="Admin"
      contentWidthClassName="max-w-7xl"
      hideBottomNavOnDesktop
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-navy/55">
              Admin portal
            </p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Operations</h1>
            <p className="mt-1 text-sm text-navy/65">
              Bookings, revenue, status, driver assignment, and SLA risk.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-navy/45">
              <Mail className="h-3.5 w-3.5" strokeWidth={2} />
              {adminEmail}
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setProfileOpen((open) => !open)}
              className="flex h-11 items-center gap-2 rounded-full bg-white px-2.5 text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {initialsFromEmail(adminEmail)}
              </span>
              <ChevronDown className="h-4 w-4 text-navy/55" strokeWidth={2} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-20 w-72 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl shadow-navy/10">
                <div className="border-b border-gray-100 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                      {initialsFromEmail(adminEmail)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy">
                        {adminRole === "dispatcher" ? "Travelyt Dispatcher" : "Travelyt Admin"}
                      </p>
                      <p className="truncate text-xs text-navy/55">{adminEmail}</p>
                    </div>
                  </div>
                  <span className="mt-3 inline-flex rounded-full bg-[#ff6868]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#ff6868]">
                    Role: {adminRole}
                  </span>
                </div>
                <Link
                  href="/profile"
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-navy transition-colors hover:bg-navy/5"
                >
                  <UserRound className="h-4 w-4" strokeWidth={2} />
                  Account details
                </Link>
                <div className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-navy">
                  <Settings className="h-4 w-4" strokeWidth={2} />
                  <span>
                    Admin settings
                    <span className="block text-xs font-normal text-navy/50">
                      Password and access codes are managed by ops.
                    </span>
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5"
              >
                <Icon className="mb-3 h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                <div className="truncate text-xl font-bold text-navy">
                  {metric.value}
                </div>
                <div className="mt-1 text-xs text-navy/60">{metric.label}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          <aside className="space-y-4 xl:sticky xl:top-24">

        {stalePending.length > 0 && (
          <div className="flex gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-bold">
                {stalePending.length} stale pending booking
                {stalePending.length === 1 ? "" : "s"} need cleanup.
              </p>
              <p className="mt-1 leading-relaxed">
                They are hidden from the driver board now. Update the travel
                date, mark confirmed, or remove test records in Supabase before
                sending drivers into production.
              </p>
            </div>
          </div>
        )}

        {exceptions.length > 0 && (
          <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm shadow-navy/5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
              <h2 className="font-bold text-navy">Ops exceptions</h2>
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {exceptions.length} needs review
              </span>
            </div>
            <div className="space-y-2">
              {exceptions.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-100 bg-[#f8f9fc] p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                      item.severity === "critical"
                        ? "bg-red-100 text-red-700"
                        : item.severity === "warning"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-700"
                    }`}>
                      {item.severity}
                    </span>
                    <span className="font-semibold text-navy">{item.code}</span>
                    {item.booking_id && (
                      <Link
                        href={`/booking/${item.booking_id}`}
                        className="text-xs font-semibold text-[#ff6868] underline"
                      >
                        {item.booking_id}
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-navy/70">{item.message}</p>
                  <p className="mt-1 text-xs text-navy/45">
                    {formatDate(item.created_at)} · {item.status}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === "open" && (
                      <button
                        type="button"
                        onClick={() => void updateException(item.id, "acknowledged")}
                        className="rounded-lg bg-navy/5 px-2.5 py-1.5 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
                      >
                        Acknowledge
                      </button>
                    )}
                    {item.status === "acknowledged" && (
                      <button
                        type="button"
                        onClick={() => void updateException(item.id, "open")}
                        className="rounded-lg bg-navy/5 px-2.5 py-1.5 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void updateException(item.id, "resolved")}
                      className="rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

          <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                <h2 className="font-bold text-navy">Driver access codes</h2>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-navy/55">
                Create one code per courier. The full code is shown once; after
                that only the last characters are visible.
              </p>
            </div>
            <button
              onClick={() => void loadDriverCodes()}
              className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
            >
              Refresh codes
            </button>
          </div>

          {generatedDriverCode && (
            <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-green-700">
                One-time driver code
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm font-bold text-navy">
                  {generatedDriverCode}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(generatedDriverCode)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-700 px-3 py-2 text-xs font-bold text-white"
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-green-800">
                Send this to the driver privately. If they lose it, revoke this
                row and create a new code.
              </p>
            </div>
          )}

          <div className="grid gap-3">
            <input
              value={newDriverName}
              onChange={(event) => setNewDriverName(event.target.value)}
              placeholder="Driver name"
              disabled={adminRole !== "admin"}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/40"
            />
            <input
              value={newDriverEmail}
              onChange={(event) => setNewDriverEmail(event.target.value)}
              placeholder="Email optional"
              disabled={adminRole !== "admin"}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/40"
            />
            <input
              value={newDriverPhone}
              onChange={(event) => setNewDriverPhone(event.target.value)}
              placeholder="Phone"
              disabled={adminRole !== "admin"}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/40"
            />
            <button
              type="button"
              onClick={() => void createDriverCode()}
              disabled={adminRole !== "admin" || creatingDriverCode}
              className="rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {creatingDriverCode ? "Creating..." : "Create code"}
            </button>
          </div>
          {adminRole !== "admin" && (
            <p className="mt-2 text-xs text-navy/50">
              Dispatchers can view code status. Only admin can create or revoke
              driver codes.
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100">
            {driverCodes.length ? (
              driverCodes.slice(0, 6).map((code) => (
                <div
                  key={code.id}
                  className="grid gap-2 border-b border-gray-100 px-4 py-3 text-sm last:border-b-0"
                >
                  <div>
                    <div className="font-semibold text-navy">
                      {code.driverName}
                    </div>
                    <div className="text-xs text-navy/50">
                      {code.driverEmail || "No email"}{code.driverPhone ? ` · ${code.driverPhone}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-navy/55">
                    Created {formatDate(code.createdAt)}
                    {code.lastUsedAt ? (
                      <span className="block">Used {formatDate(code.lastUsedAt)}</span>
                    ) : (
                      <span className="block">Never used</span>
                    )}
                  </div>
                  <code className="self-start rounded-full bg-navy/5 px-2.5 py-1 text-xs font-bold text-navy">
                    {code.codePreview}
                  </code>
                  <span
                    className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${
                      code.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {code.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => void revokeDriverCode(code.id)}
                    disabled={adminRole !== "admin" || code.status !== "active"}
                    className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <div className="p-5 text-center text-sm text-navy/55">
                No database-backed driver codes yet.
              </div>
            )}
          </div>
        </div>

          </aside>

          <section className="min-w-0 space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">
                  Dispatch queue
                </p>
                <h2 className="text-xl font-bold text-navy">Bookings to manage</h2>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold text-navy/45">
                  Showing {filtered.length} {archiveView} booking
                  {filtered.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-navy/40">
                  {archivedCount} archived trial/closed record
                  {archivedCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
          <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-navy/[0.03] p-1 text-xs font-bold text-navy">
            {([
              ["active", "Active"],
              ["archived", "Archived"],
              ["all", "All"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setArchiveView(value)}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  archiveView === value
                    ? "bg-white text-navy shadow-sm shadow-navy/5"
                    : "text-navy/55 hover:bg-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto_auto]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search id, customer, airport, driver"
                className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
              />
            </label>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Booking["status"] | "all")
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-navy outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All status" : STATUS_LABELS[option]}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                void loadBookings();
                void loadExceptions();
                void loadDriverCodes();
              }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Refresh
            </button>
            <button
              onClick={exportCsv}
              disabled={!filtered.length}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
                onPatch={(patch, reason) => updateBooking(booking.id, patch, reason)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-navy/15 bg-white/60 p-8 text-center text-sm text-navy/65">
              No bookings match this view.
            </div>
          )}
        </div>
          </section>
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
  onPatch: (patch: Partial<Booking>, reason?: string) => void | Promise<void>;
}) {
  const [driverName, setDriverName] = useState(booking.driverName ?? "");
  const [auditReason, setAuditReason] = useState("");
  const [issueType, setIssueType] = useState<BookingIssueType | "">(
    booking.issueType ?? ""
  );
  const [issueNotes, setIssueNotes] = useState(booking.issueNotes ?? "");
  const [issueResolution, setIssueResolution] = useState(
    booking.issueResolution ?? ""
  );
  const stale = isStalePending(booking);
  const identityReady = Boolean(
    booking.customerIdentityVerifiedAt && booking.driverIdentityVerifiedAt
  );
  const restrictedReady = Boolean(booking.restrictedItemsAttestedAt);
  const custodyReady = identityReady && restrictedReady;
  const blockers = custodyBlockers(booking);
  const workflowIssues = workflowBlockers(booking);
  const archived = Boolean(booking.archivedAt);
  const slaAlerts = archived ? [] : getSlaAlerts(booking);
  const lastLocation = latestLocationEvent(booking);

  return (
    <article
      className={`rounded-2xl bg-white p-4 shadow-sm shadow-navy/5 ${
        archived ? "border border-dashed border-navy/15 opacity-80" : ""
      }`}
    >
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
              {getBookingStatusLabel(booking)}
            </span>
            {stale && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                Past date
              </span>
            )}
            {slaAlerts.length > 0 && (
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">
                SLA {slaAlerts[0].severity}
              </span>
            )}
            {booking.issueType && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                {ISSUE_TYPE_LABELS[booking.issueType]}
              </span>
            )}
            {archived && (
              <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy/60">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-navy">
            {booking.name}
          </p>
          <p className="mt-0.5 text-xs text-navy/60">
            {booking.email} · {booking.phone}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const nextArchivedAt = archived ? null : new Date().toISOString();
              const reason =
                auditReason.trim() ||
                (archived
                  ? "Admin restored booking to active operations queue."
                  : "Admin archived old trial or inactive booking.");
              void onPatch({ archivedAt: nextArchivedAt }, reason);
              setAuditReason("");
            }}
            className={`inline-flex items-center gap-1 self-start rounded-xl px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              archived
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : "bg-navy/5 text-navy hover:bg-navy/10"
            }`}
          >
            {archived ? (
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <Archive className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {archived ? "Restore" : "Archive"}
          </button>
          <Link
            href={`/booking/${booking.id}`}
            className="inline-flex items-center gap-1 self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
          >
            View <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-navy/70 sm:grid-cols-2">
        <Info label="Service" value={`${SERVICE_LABELS[booking.service]} · ${booking.bags} bag${booking.bags > 1 ? "s" : ""}`} />
        <Info label="Airport" value={`${booking.airport} · ${formatDate(booking.date)}`} />
        {booking.flightTime && <Info label="Flight time" value={booking.flightTime} />}
        <Info label="Address" value={booking.address} />
        <Info label="Price" value={formatPrice(booking.priceCents)} />
        {booking.deliveryConfirmationCode && (
          <Info label="Customer confirmation code" value={booking.deliveryConfirmationCode} />
        )}
        <Info
          label="Coverage"
          value={
            booking.declaredValueCents
              ? `Declared ${formatPrice(booking.declaredValueCents)}`
              : "Standard"
          }
        />
        {booking.flight && <Info label="Flight" value={booking.flight} />}
        {booking.notes && <Info label="Notes" value={booking.notes} />}
        {booking.archivedAt && (
          <Info
            label="Archived"
            value={`${formatAuditTime(booking.archivedAt)}${booking.archivedBy ? ` by ${booking.archivedBy}` : ""}`}
          />
        )}
        {booking.issueType && (
          <Info
            label="Issue"
            value={`${ISSUE_TYPE_LABELS[booking.issueType]}${booking.issueNotes ? ` · ${booking.issueNotes}` : ""}`}
          />
        )}
        {lastLocation && (
          <Info
            label="Last GPS"
            value={`${lastLocation.label} · ${lastLocation.latitude}, ${lastLocation.longitude}`}
          />
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle
            className={`h-4 w-4 ${
              workflowIssues.length ? "text-[#ff6868]" : "text-green-600"
            }`}
            strokeWidth={2}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-navy/60">
            Why stuck / next action
          </span>
        </div>
        {workflowIssues.length ? (
          <ul className="space-y-1 text-xs leading-relaxed text-navy/70">
            {workflowIssues.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs font-semibold text-green-700">
            No active workflow blocker detected.
          </p>
        )}
      </div>

      {slaAlerts.length > 0 && (
        <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-orange-700" strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-900/70">
              SLA timers
            </span>
          </div>
          <div className="space-y-2">
            {slaAlerts.map((alert) => (
              <div key={alert.code} className="rounded-xl bg-white/70 px-3 py-2 text-xs leading-relaxed text-orange-950">
                <div className="font-bold">
                  {alert.label} · {alert.minutesLate} min late
                </div>
                <div>{alert.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastLocation && (
        <div className="mt-4 rounded-2xl border border-navy/10 bg-navy/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-wider text-navy/60">
              Last known driver location
            </span>
          </div>
          <p className="text-xs leading-relaxed text-navy/70">
            {lastLocation.label}
            {lastLocation.actorName ? ` · ${lastLocation.actorName}` : ""} ·{" "}
            {formatAuditTime(lastLocation.capturedAt)}
          </p>
          <a
            href={`https://maps.google.com/?q=${lastLocation.latitude},${lastLocation.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-bold text-[#ff6868] underline"
          >
            Open in Google Maps
          </a>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-navy/10 bg-navy/[0.03] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-navy/60">
            Custody readiness
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            identityReady ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"
          }`}>
            {identityReady ? "IDs verified" : "IDs needed"}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            restrictedReady ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"
          }`}>
            {restrictedReady ? "Bag attested" : "Bag attestation needed"}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            custodyReady ? "bg-green-100 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {custodyReady ? "Driver can start custody" : "Driver blocked from custody"}
          </span>
        </div>
        {blockers.length ? (
          <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800">
            <p className="font-bold">
              Driver cannot start because manual ID/bag review is not complete.
            </p>
            <ul className="mt-2 space-y-1">
              {blockers.map((blocker) => (
                <li key={blocker}>- {blocker}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mb-3 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-xs font-semibold text-green-800">
            Custody gate clear. Driver can begin pickup or airport release.
          </p>
        )}
        <button
          disabled={disabled || custodyReady}
          onClick={() => {
            const now = new Date().toISOString();
            const reason =
              auditReason.trim() ||
              "Admin marked manual ID/bag review complete.";
            void onPatch({
              customerIdentityVerifiedAt:
                booking.customerIdentityVerifiedAt ?? now,
              driverIdentityVerifiedAt:
                booking.driverIdentityVerifiedAt ?? now,
              restrictedItemsAttestedAt:
                booking.restrictedItemsAttestedAt ?? now,
            }, reason);
            setAuditReason("");
          }}
          className="rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {custodyReady ? "Custody ready" : "Admin override: mark review complete"}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-700" strokeWidth={2} />
          <span className="text-xs font-semibold uppercase tracking-wider text-red-900/70">
            Issue management
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[190px_1fr]">
          <select
            value={issueType}
            onChange={(event) =>
              setIssueType(event.target.value as BookingIssueType | "")
            }
            className="rounded-xl border border-red-100 bg-white px-3 py-2.5 text-sm text-navy outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
          >
            <option value="">Select issue type</option>
            {issueOptions.map((option) => (
              <option key={option} value={option}>
                {ISSUE_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
          <input
            value={issueNotes}
            onChange={(event) => setIssueNotes(event.target.value)}
            placeholder="What happened? Example: customer unreachable at hotel"
            className="rounded-xl border border-red-100 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
          />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            disabled={disabled || !issueType}
            onClick={() => {
              if (!issueType) return;
              const now = new Date().toISOString();
              const cleanNotes = issueNotes.trim();
              void onPatch(
                {
                  status: "issue",
                  issueType,
                  issueNotes: cleanNotes || undefined,
                  issueOpenedAt: booking.issueOpenedAt ?? now,
                },
                cleanNotes ||
                  `Operations marked issue: ${ISSUE_TYPE_LABELS[issueType]}.`
              );
            }}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Mark issue
          </button>
          {booking.status === "issue" && (
            <>
              <input
                value={issueResolution}
                onChange={(event) => setIssueResolution(event.target.value)}
                placeholder="Resolution note"
                className="min-w-0 flex-1 rounded-xl border border-red-100 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
              />
              <button
                disabled={disabled || !issueResolution.trim()}
                onClick={() => {
                  const nextStatus = booking.driverName ? "assigned" : "paid";
                  const resolution = issueResolution.trim();
                  void onPatch(
                    {
                      status: nextStatus,
                      issueResolvedAt: new Date().toISOString(),
                      issueResolution: resolution,
                    },
                    resolution
                  );
                }}
                className="rounded-xl bg-navy px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Resolve and resume
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <label
          htmlFor={`audit-reason-${booking.id}`}
          className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-navy/45"
        >
          Override / audit reason
        </label>
        <input
          id={`audit-reason-${booking.id}`}
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          placeholder="Example: Driver called support; airline accepted bags manually"
          className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
        />
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
        <select
          value={booking.status}
          disabled={disabled}
          onChange={(event) => {
            const nextStatus = event.target.value as Booking["status"];
            const reason =
              auditReason.trim() ||
              `Admin changed status to ${STATUS_LABELS[nextStatus]}.`;
            void onPatch(
              adminStatusPatch(
                booking,
                nextStatus
              ),
              reason
            );
            setAuditReason("");
          }}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-navy outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:opacity-60"
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
          list={`driver-options-${booking.id}`}
          placeholder="Driver name"
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
        />
        <datalist id={`driver-options-${booking.id}`}>
          {DRIVER_OPTIONS.map((profile) => (
            <option key={profile.name} value={profile.name} />
          ))}
        </datalist>
        <button
          disabled={disabled}
          onClick={() => {
            const nextStatus = driverName.trim() ? "assigned" : "paid";
            const reason =
              auditReason.trim() ||
              (driverName.trim()
                ? `Admin assigned driver ${driverName.trim()}.`
                : "Admin cleared driver assignment.");
            void onPatch({
              driverName: driverName.trim() || undefined,
              status: nextStatus,
              assignedAt: driverName.trim()
                ? booking.assignedAt ?? new Date().toISOString()
                : undefined,
            }, reason);
            setAuditReason("");
          }}
          className="rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {disabled ? "Saving..." : "Assign"}
        </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-navy/50">
        Admin status override is allowed for operations cleanup. Driver custody
        actions still require proof unless this portal marks the manual review
        complete.
      </p>
      {booking.statusHistory?.length ? (
        <details className="mt-4 rounded-2xl border border-navy/10 bg-navy/[0.02] p-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-navy/60">
            Status history / audit log
          </summary>
          <div className="mt-3 space-y-3">
            {[...booking.statusHistory].reverse().slice(0, 8).map((entry) => (
              <div key={entry.id} className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm shadow-navy/5">
                <div className="font-semibold text-navy">{auditTitle(entry)}</div>
                <div className="mt-0.5 text-navy/55">
                  {formatAuditTime(entry.timestamp)}
                  {entry.actorRole ? ` · ${entry.actorRole}` : ""}
                </div>
                {entry.reason && (
                  <div className="mt-1 leading-relaxed text-navy/70">
                    Reason: {entry.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}
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
