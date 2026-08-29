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
import { roleRequiresMfa, trustedUserRole } from "@/lib/auth-policy";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import {
  formatPrice,
  getBookingServiceLabel,
  getBookingStatusLabel,
  ISSUE_TYPE_LABELS,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  type BookingIssueType,
  type Booking,
  type PilotEligibilityStatus,
} from "@/lib/bookings";
import { getSlaAlerts, latestLocationEvent } from "@/lib/ops-rules";
import { passengerManifestCustodyBlockers } from "@/lib/passengers";
import { PILOT_ELIGIBILITY_LABELS } from "@/lib/pilot-eligibility";

type DataView = "production" | "demo" | "all";

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
  codeRotatedAt?: string;
  codeRotatedBy?: string;
  codeRotationCount: number;
}

interface DriverEvidenceItem {
  id: string;
  evidenceType: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  reviewStatus: "pending" | "accepted" | "rejected";
  uploadedAt: string;
  downloadUrl: string | null;
}

interface DriverTrainingCompletion {
  version: string;
  signatureName: string;
  score: number;
  passed: boolean;
  reviewStatus: "pending" | "accepted" | "rejected";
  completedAt: string;
}

interface AgentReadinessProfile {
  driverAccessId: string;
  driverName: string;
  driverEmail?: string;
  accessStatus: DriverAccessCode["status"];
  status: "pending" | "active" | "suspended";
  identityEvidenceReference?: string;
  identityVerifiedAt?: string;
  identityExpiresAt?: string;
  trainingEvidenceReference?: string;
  trainingCompletedAt?: string;
  trainingExpiresAt?: string;
  insuranceEvidenceReference?: string;
  insuranceVerifiedAt?: string;
  insuranceExpiresAt?: string;
  vehicleMakeModel?: string;
  licensePlate?: string;
  vehicleEvidenceReference?: string;
  vehicleVerifiedAt?: string;
  vehicleExpiresAt?: string;
  notes?: string;
  ready: boolean;
  blockers: string[];
}

interface AgentAssignment {
  id: string;
  bookingId: string;
  primaryDriverAccessId: string;
  primaryDriverName: string;
  backupDriverAccessId: string;
  backupDriverName: string;
  status: "assigned" | "accepted" | "declined" | "expired" | "superseded" | "revoked";
  assignedBy: string;
  assignedAt: string;
  acceptanceDueAt: string;
  acceptedAt?: string;
  declineReason?: string;
}

interface BookingBag {
  id: string;
  booking_id: string;
  badge_code: string;
  label: string | null;
  status: "issued" | "in_custody" | "handed_off" | "delivered" | "exception";
  created_at: string;
}

interface DriverApplication {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  city: string;
  state: string;
  vehicle_make_model: string;
  license_plate: string;
  drivers_license_state: string;
  drivers_license_last4: string;
  availability: string;
  referral_source?: string | null;
  notes?: string | null;
  status: "pending" | "reviewing" | "approved" | "rejected" | "withdrawn";
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at: string;
}

type AuthAccountStatus =
  | "active"
  | "confirmed_never_signed_in"
  | "unconfirmed"
  | "banned";

interface AuthAccount {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: string;
  status: AuthAccountStatus;
  createdAt: string;
  confirmedAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  providers: string[];
}

interface AuthEvent {
  id: string;
  action: string;
  userId: string | null;
  email: string | null;
  createdAt: string;
  ipAddress: string | null;
}

interface AuthAccountCounts {
  total: number;
  active: number;
  unconfirmed: number;
  neverSignedIn: number;
  banned: number;
}

interface PartnerIntegration {
  id: string;
  name: string;
  kind: string;
  environment: "manual" | "sandbox" | "production";
  capabilities: string[];
  auth_type: string;
  active: boolean;
  notes?: string | null;
}

interface PartnerEvent {
  id: string;
  provider_id: string;
  booking_id?: string | null;
  external_reference?: string | null;
  direction: "inbound" | "outbound";
  event_type: string;
  status: string;
  payload?: Record<string, unknown>;
  error_message?: string | null;
  created_at: string;
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
const PRELAUNCH_DEMO_CREATED_BEFORE = Date.parse("2026-06-12T08:30:00.000Z");
const PRELAUNCH_DEMO_LABEL = "Jun 12, 2026 1:30 AM PT";
const PARTNER_INTEGRATIONS_ENABLED =
  process.env.NEXT_PUBLIC_PARTNER_INTEGRATIONS_ENABLED === "true";

const demoTextPatterns = [
  /\bdemo\b/i,
  /\btest\b/i,
  /\btesting\b/i,
  /\bsample\b/i,
  /\bsandbox\b/i,
  /\breview\b/i,
  /\btraining\b/i,
  /\bqa\b/i,
  /\bgps\b/i,
  /\bsticker\s*smith\b/i,
  /\bstickersmith\b/i,
  /\bapp store\b/i,
  /\bapple review\b/i,
];

function bookingSearchText(booking: Booking) {
  return [
    booking.id,
    booking.name,
    booking.email,
    booking.phone,
    booking.airport,
    booking.address,
    booking.driverName,
    booking.flight,
    booking.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isDemoBooking(booking: Booking) {
  const created = Date.parse(booking.createdAt);
  if (!Number.isNaN(created) && created < PRELAUNCH_DEMO_CREATED_BEFORE) {
    return true;
  }

  const email = booking.email.toLowerCase();
  if (/@(?:travelyt\.us|travelyt\.app)$/.test(email)) return true;

  const text = bookingSearchText(booking);
  return demoTextPatterns.some((pattern) => pattern.test(text));
}

function matchesDataView(booking: Booking, view: DataView) {
  if (view === "all") return true;
  const demo = isDemoBooking(booking);
  return view === "demo" ? demo : !demo;
}

function dataViewLabel(view: DataView) {
  if (view === "demo") return "demo/test";
  if (view === "all") return "all";
  return "production";
}

function isArchivedDriverCode(code: DriverAccessCode) {
  return code.status !== "active";
}

function driverCodeStatusLabel(code: DriverAccessCode) {
  if (code.status === "active") return "active";
  return code.status === "expired" ? "archived: expired" : "archived: revoked";
}

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
    blockers.push("Identity and customer declaration review is not complete.");
  }
  blockers.push(
    ...passengerManifestCustodyBlockers(
      booking.passengers,
      Boolean(booking.customerIdentityVerifiedAt)
    )
  );
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

const ACCOUNT_STATUS_LABELS: Record<AuthAccountStatus, string> = {
  active: "Active",
  confirmed_never_signed_in: "Confirmed · no login",
  unconfirmed: "Incomplete · unconfirmed",
  banned: "Banned",
};

const ACCOUNT_STATUS_STYLES: Record<AuthAccountStatus, string> = {
  active: "bg-green-100 text-green-800",
  confirmed_never_signed_in: "bg-blue-100 text-blue-800",
  unconfirmed: "bg-amber-100 text-amber-900",
  banned: "bg-red-100 text-red-800",
};

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
  if (entry.action === "backup_note") {
    return `${actor} added backup ops note`;
  }
  if (entry.action === "backup_status") {
    return `${actor} logged backup status`;
  }
  if (entry.action === "backup_proof") {
    return `${actor} logged fallback proof`;
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
  const [agentReadiness, setAgentReadiness] = useState<AgentReadinessProfile[]>([]);
  const [agentAssignments, setAgentAssignments] = useState<AgentAssignment[]>([]);
  const [agentMigrationRequired, setAgentMigrationRequired] = useState(false);
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [authEvents, setAuthEvents] = useState<AuthEvent[]>([]);
  const [accountCounts, setAccountCounts] = useState<AuthAccountCounts>({
    total: 0,
    active: 0,
    unconfirmed: 0,
    neverSignedIn: 0,
    banned: 0,
  });
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountActivityMigrationRequired, setAccountActivityMigrationRequired] = useState(false);
  const [appBusyId, setAppBusyId] = useState<string | null>(null);
  const [appCode, setAppCode] = useState<{ id: string; code: string } | null>(null);
  const [partnerIntegrations, setPartnerIntegrations] = useState<PartnerIntegration[]>([]);
  const [partnerEvents, setPartnerEvents] = useState<PartnerEvent[]>([]);
  const [partnerMigrationRequired, setPartnerMigrationRequired] = useState(false);
  const [partnerEventProvider, setPartnerEventProvider] = useState("stasher");
  const [partnerEventBooking, setPartnerEventBooking] = useState("");
  const [partnerEventReference, setPartnerEventReference] = useState("");
  const [partnerEventType, setPartnerEventType] = useState("manual_note");
  const [partnerEventStatus, setPartnerEventStatus] = useState("manual");
  const [partnerEventNote, setPartnerEventNote] = useState("");
  const [savingPartnerEvent, setSavingPartnerEvent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Booking["status"] | "all">("all");
  const [dataView, setDataView] = useState<DataView>("production");
  const [archiveView, setArchiveView] = useState<"active" | "archived" | "all">(
    "active"
  );
  const [cleanupOnly, setCleanupOnly] = useState(false);
  const [driverCodeView, setDriverCodeView] = useState<
    "active" | "archived" | "all"
  >("active");
  const [updatingId, setUpdatingId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverEmail, setNewDriverEmail] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [generatedDriverCode, setGeneratedDriverCode] = useState("");
  const [driverOnboardingLink, setDriverOnboardingLink] = useState<{
    driverName: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [driverEvidencePanel, setDriverEvidencePanel] = useState<{
    driverName: string;
    items: DriverEvidenceItem[];
    training: DriverTrainingCompletion | null;
  } | null>(null);
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
          await loadAgentOperations();
          await loadApplications();
          if ((data.role ?? "admin") === "admin") await loadAccounts();
          if (PARTNER_INTEGRATIONS_ENABLED) await loadPartnerIntegrations();
          return;
        }

        const supabase = getSupabaseBrowser();
        const accessToken = supabase
          ? (await supabase.auth.getSession()).data.session?.access_token
          : null;
        if (!cancelled && accessToken) {
          const exchange = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ accessToken }),
          });
          const exchanged = (await exchange.json()) as {
            ok?: boolean;
            email?: string;
            role?: AdminRole;
          };
          if (exchange.ok && exchanged.ok && exchanged.email) {
            setAdminEmail(exchanged.email);
            setAdminRole(exchanged.role ?? "admin");
            await loadBookings();
            await loadExceptions();
            await loadDriverCodes();
            await loadAgentOperations();
            await loadApplications();
            if ((exchanged.role ?? "admin") === "admin") await loadAccounts();
            if (PARTNER_INTEGRATIONS_ENABLED) await loadPartnerIntegrations();
          }
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

  async function loadAgentOperations() {
    try {
      const [readinessResponse, assignmentsResponse] = await Promise.all([
        fetch("/api/ops/agent-readiness", { credentials: "same-origin" }),
        fetch("/api/ops/agent-assignments", { credentials: "same-origin" }),
      ]);
      const readinessData = (await readinessResponse.json()) as {
        ok?: boolean;
        profiles?: AgentReadinessProfile[];
        migrationRequired?: boolean;
      };
      const assignmentData = (await assignmentsResponse.json()) as {
        ok?: boolean;
        assignments?: AgentAssignment[];
      };
      if (readinessResponse.ok && readinessData.profiles) {
        setAgentReadiness(readinessData.profiles);
        setAgentMigrationRequired(false);
      } else if (readinessData.migrationRequired) {
        setAgentMigrationRequired(true);
      }
      if (assignmentsResponse.ok && assignmentData.assignments) {
        setAgentAssignments(assignmentData.assignments);
      }
    } catch {}
  }

  async function saveAgentReadiness(input: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/ops/agent-readiness", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      profiles?: AgentReadinessProfile[];
      migrationRequired?: boolean;
    };
    if (!response.ok || !data.profiles) {
      if (data.migrationRequired) setAgentMigrationRequired(true);
      throw new Error(data.error || "Could not save agent readiness evidence.");
    }
    setAgentReadiness(data.profiles);
  }

  async function assignAgents(input: {
    bookingId: string;
    primaryDriverAccessId: string;
    backupDriverAccessId: string;
    reason?: string;
  }) {
    setUpdatingId(input.bookingId);
    setError("");
    try {
      const response = await fetch("/api/ops/agent-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...input, acceptanceMinutes: 10 }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        details?: string[];
        booking?: Booking;
        assignment?: AgentAssignment;
      };
      if (!response.ok || !data.booking || !data.assignment) {
        throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(" ") || "Could not assign agents.");
      }
      setBookings((rows) => rows.map((row) => row.id === data.booking!.id ? data.booking! : row));
      setAgentAssignments((rows) => [data.assignment!, ...rows.filter((row) => row.bookingId !== input.bookingId || !["assigned", "accepted"].includes(row.status))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign agents.");
    } finally {
      setUpdatingId("");
    }
  }

  async function decidePilotEligibility(input: {
    bookingId: string;
    decision: Exclude<PilotEligibilityStatus, "pending" | "expired">;
    reason: string;
  }) {
    setUpdatingId(input.bookingId);
    setError("");
    try {
      const response = await fetch("/api/ops/pilot-eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...input,
          snapshot: input.decision === "approved"
            ? {
                eligibleFlight: true,
                eligibleTraveler: true,
                routeWithinPilotArea: true,
                noticeSatisfied: true,
                capacityConfirmed: true,
              }
            : {},
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        booking?: Booking;
      };
      if (!response.ok || !data.booking) {
        throw new Error(data.error || "Could not save pilot eligibility.");
      }
      setBookings((rows) => rows.map((row) =>
        row.id === data.booking!.id ? data.booking! : row
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pilot eligibility.");
      throw err;
    } finally {
      setUpdatingId("");
    }
  }

  async function loadApplications() {
    try {
      const response = await fetch("/api/driver-applications", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        applications?: DriverApplication[];
      };
      if (response.ok && data.applications) setApplications(data.applications);
    } catch {}
  }

  async function loadAccounts() {
    setAccountLoading(true);
    try {
      const response = await fetch("/api/admin/accounts", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        accounts?: AuthAccount[];
        events?: AuthEvent[];
        counts?: AuthAccountCounts;
        activityMigrationRequired?: boolean;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not load customer accounts.");
      }
      setAccounts(data.accounts ?? []);
      setAuthEvents(data.events ?? []);
      setAccountCounts(
        data.counts ?? {
          total: 0,
          active: 0,
          unconfirmed: 0,
          neverSignedIn: 0,
          banned: 0,
        },
      );
      setAccountActivityMigrationRequired(
        Boolean(data.activityMigrationRequired),
      );
    } catch (accountError) {
      setError(
        accountError instanceof Error
          ? accountError.message
          : "Could not load customer accounts.",
      );
    } finally {
      setAccountLoading(false);
    }
  }

  async function reviewApplication(id: string, action: "approve" | "reject") {
    setAppBusyId(id);
    setError("");
    try {
      const response = await fetch("/api/driver-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, action }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        oneTimeCode?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not update application.");
      }
      if (data.oneTimeCode) {
        setAppCode({ id, code: data.oneTimeCode });
        await loadDriverCodes();
        await loadAgentOperations();
      }
      await loadApplications();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update application."
      );
    } finally {
      setAppBusyId(null);
    }
  }

  async function loadPartnerIntegrations() {
    if (!PARTNER_INTEGRATIONS_ENABLED) return;

    try {
      const response = await fetch("/api/partner-integrations", {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        migrationRequired?: boolean;
        integrations?: PartnerIntegration[];
        events?: PartnerEvent[];
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not load partner integrations.");
      }
      setPartnerIntegrations(data.integrations ?? []);
      setPartnerEvents(data.events ?? []);
      setPartnerMigrationRequired(Boolean(data.migrationRequired));
      const firstProviderId = data.integrations?.[0]?.id;
      if (firstProviderId) {
        setPartnerEventProvider((current) => current || firstProviderId);
      }
    } catch (err) {
      setPartnerMigrationRequired(false);
      setError(err instanceof Error ? err.message : "Could not load partner integrations.");
    }
  }

  async function togglePartnerIntegration(id: string, active: boolean) {
    if (!PARTNER_INTEGRATIONS_ENABLED) return;

    setError("");
    try {
      const response = await fetch("/api/partner-integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, active }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        integration?: PartnerIntegration;
        migrationRequired?: boolean;
      };
      if (!response.ok || !data.integration) {
        if (data.migrationRequired) setPartnerMigrationRequired(true);
        throw new Error(data.error || "Could not update partner integration.");
      }
      setPartnerIntegrations((rows) =>
        rows.map((row) => (row.id === id ? data.integration! : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update partner integration.");
    }
  }

  async function recordPartnerEvent() {
    if (!PARTNER_INTEGRATIONS_ENABLED) return;

    if (!partnerEventProvider) {
      setError("Select a partner before recording an event.");
      return;
    }
    if (!partnerEventType.trim()) {
      setError("Enter an event type before recording a partner event.");
      return;
    }
    setSavingPartnerEvent(true);
    setError("");
    try {
      const response = await fetch("/api/partner-integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          providerId: partnerEventProvider,
          bookingId: partnerEventBooking,
          externalReference: partnerEventReference,
          eventType: partnerEventType,
          status: partnerEventStatus,
          direction: "outbound",
          payload: { note: partnerEventNote },
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        event?: PartnerEvent;
        migrationRequired?: boolean;
      };
      if (!response.ok || !data.event) {
        if (data.migrationRequired) setPartnerMigrationRequired(true);
        throw new Error(data.error || "Could not record partner event.");
      }
      setPartnerEvents((rows) => [data.event!, ...rows]);
      setPartnerEventBooking("");
      setPartnerEventReference("");
      setPartnerEventType("manual_note");
      setPartnerEventStatus("manual");
      setPartnerEventNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record partner event.");
    } finally {
      setSavingPartnerEvent(false);
    }
  }

  async function login() {
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Account sign-in is not configured.");

      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
      if (signInError || !signInData.user) {
        throw new Error(signInError?.message || "Could not sign in.");
      }

      const role = trustedUserRole(signInData.user);
      if (!roleRequiresMfa(role)) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("This account is not authorized for Travelyt operations.");
      }

      const [assuranceResult, factorResult] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (assuranceResult.error || factorResult.error) {
        throw new Error("Could not verify account security. Try again.");
      }
      const hasVerifiedTotp = Boolean(factorResult.data?.totp?.length);
      if (!hasVerifiedTotp) {
        window.location.href = "/security?required=1&next=%2Fadmin";
        return;
      }
      if (assuranceResult.data?.currentLevel !== "aal2") {
        window.location.href = "/mfa?next=%2Fadmin";
        return;
      }

      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error("Verified session is missing.");
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ accessToken: session.access_token }),
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

      setAdminEmail(data.email || signInData.user.email || "");
      setAdminRole(data.role ?? "admin");
      setPassword("");
      await loadBookings();
      await loadExceptions();
      await loadDriverCodes();
      await loadAgentOperations();
      await loadApplications();
      if ((data.role ?? "admin") === "admin") await loadAccounts();
      if (PARTNER_INTEGRATIONS_ENABLED) await loadPartnerIntegrations();
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
    setAgentReadiness([]);
    setAgentAssignments([]);
    setAccounts([]);
    setAuthEvents([]);
    setAccountCounts({ total: 0, active: 0, unconfirmed: 0, neverSignedIn: 0, banned: 0 });
    setAccountActivityMigrationRequired(false);
    setPartnerIntegrations([]);
    setPartnerEvents([]);
    setPartnerMigrationRequired(false);
    setGeneratedDriverCode("");
    setDriverOnboardingLink(null);
    setDriverEvidencePanel(null);
  }

  async function createDriverCode() {
    if (!newDriverName.trim()) {
      setError("Enter a driver name before creating an access code.");
      return;
    }
    if (!newDriverEmail.trim() && !newDriverPhone.trim()) {
      setError("Enter a driver email or phone so this access record is bound to one person.");
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
      await loadAgentOperations();
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

  async function rotateDriverCode(code: DriverAccessCode) {
    if (
      !confirm(
        `Reset ${code.driverName}'s access code? Their current code will stop working immediately.`
      )
    ) return;

    setError("");
    setGeneratedDriverCode("");
    try {
      const response = await fetch("/api/drivers/access-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: code.id, action: "rotate" }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        accessCode?: DriverAccessCode;
        oneTimeCode?: string;
      };
      if (!response.ok || !data.accessCode || !data.oneTimeCode) {
        throw new Error(data.error || "Could not reset driver access code.");
      }
      setGeneratedDriverCode(data.oneTimeCode);
      setDriverCodes((rows) =>
        rows.map((row) => (row.id === code.id ? data.accessCode! : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset driver access code.");
    }
  }

  async function createDriverOnboardingLink(code: DriverAccessCode) {
    if (
      !confirm(
        `Create an optional private fallback link for ${code.driverName}? Their normal access-code login already opens onboarding automatically. Any older active fallback link will be revoked.`
      )
    ) return;
    setError("");
    setDriverOnboardingLink(null);
    try {
      const response = await fetch("/api/ops/driver-onboarding-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ driverAccessId: code.id }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        driverName?: string;
        url?: string;
        expiresAt?: string;
      };
      if (!response.ok || !data.driverName || !data.url || !data.expiresAt) {
        throw new Error(data.error || "Could not create driver onboarding link.");
      }
      setDriverOnboardingLink({
        driverName: data.driverName,
        url: data.url,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create driver onboarding link.");
    }
  }

  async function loadDriverEvidence(code: DriverAccessCode) {
    setError("");
    try {
      const response = await fetch(
        `/api/ops/driver-onboarding-invites?driverAccessId=${encodeURIComponent(code.id)}`,
        { credentials: "same-origin" }
      );
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        evidence?: DriverEvidenceItem[];
        training?: DriverTrainingCompletion | null;
      };
      if (!response.ok || !data.evidence) {
        throw new Error(data.error || "Could not load driver evidence.");
      }
      setDriverEvidencePanel({
        driverName: code.driverName,
        items: data.evidence,
        training: data.training ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load driver evidence.");
    }
  }

  function openStaleCleanupQueue() {
    setDataView("production");
    setArchiveView("active");
    setStatus("pending");
    setQuery("");
    setCleanupOnly(true);
    requestAnimationFrame(() => {
      document
        .getElementById("booking-cleanup-queue")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return bookings.filter((booking) => {
      if (!matchesDataView(booking, dataView)) return false;
      const archived = Boolean(booking.archivedAt);
      if (archiveView === "active" && archived) return false;
      if (archiveView === "archived" && !archived) return false;
      if (cleanupOnly && !isStalePending(booking)) return false;
      const matchesStatus = status === "all" || booking.status === status;
      const matchesQuery =
        !clean ||
        bookingSearchText(booking).includes(clean);

      return matchesStatus && matchesQuery;
    });
  }, [archiveView, bookings, cleanupOnly, dataView, query, status]);

  const filteredDriverCodes = useMemo(
    () =>
      driverCodes.filter((code) => {
        const archived = isArchivedDriverCode(code);
        if (driverCodeView === "active") return !archived;
        if (driverCodeView === "archived") return archived;
        return true;
      }),
    [driverCodeView, driverCodes]
  );

  const metrics = useMemo(() => {
    const operationalBookings = bookings.filter(
      (booking) => !booking.archivedAt && matchesDataView(booking, dataView)
    );
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
      { label: `${dataViewLabel(dataView)} bookings`, value: `${operationalBookings.length}`, icon: BriefcaseBusiness },
      { label: "Active", value: `${active.length}`, icon: Truck },
      { label: "Awaiting driver", value: `${paid.length}`, icon: Package },
      { label: "Pipeline", value: formatPrice(revenueCents), icon: CheckCircle2 },
      { label: "SLA risk", value: `${slaRisk.length}`, icon: Clock3 },
      { label: "Bags", value: `${bags}`, icon: Users },
    ];
  }, [bookings, dataView]);

  const archivedCount = useMemo(
    () =>
      bookings.filter(
        (booking) => booking.archivedAt && matchesDataView(booking, dataView)
      ).length,
    [bookings, dataView]
  );

  const stalePending = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          matchesDataView(booking, "production") && isStalePending(booking)
      ),
    [bookings]
  );

  const productionCount = useMemo(
    () => bookings.filter((booking) => !booking.archivedAt && !isDemoBooking(booking)).length,
    [bookings]
  );

  const demoCount = useMemo(
    () => bookings.filter((booking) => !booking.archivedAt && isDemoBooking(booking)).length,
    [bookings]
  );

  const demoArchivedCount = useMemo(
    () => bookings.filter((booking) => booking.archivedAt && isDemoBooking(booking)).length,
    [bookings]
  );

  const activeDriverCodeCount = useMemo(
    () => driverCodes.filter((code) => !isArchivedDriverCode(code)).length,
    [driverCodes]
  );

  const archivedDriverCodeCount = useMemo(
    () => driverCodes.filter(isArchivedDriverCode).length,
    [driverCodes]
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
      getBookingServiceLabel(booking),
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
    link.download = `travelyt-${dataView}-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!adminEmail) {
    return (
      <AppChrome
        title="Admin"
        contentWidthClassName="max-w-7xl"
        homeHref="/admin"
        action={null}
        showBottomNav={false}
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
                <p className="text-xs text-navy/55">Use an authorized account and authenticator.</p>
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
      homeHref="/admin"
      action={null}
      showBottomNav={false}
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

        <Link
          href="/admin/seo"
          className="flex flex-col gap-3 rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5 transition-colors hover:border-[#ff6868]/40 hover:bg-[#ff6868]/5 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ff6868]/10 text-[#ff6868]">
              <Search className="h-5 w-5" strokeWidth={2} />
            </span>
            <span>
              <span className="block font-bold text-navy">SEO rankings</span>
              <span className="mt-1 block text-sm leading-relaxed text-navy/60">
                Separate tracker for Travelyt search terms, airport city pages,
                local pack checks, and Search Console readiness.
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 self-start rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white sm:self-auto">
            Open SEO
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </Link>

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

        {adminRole === "admin" && (
          <section className="rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                  <h2 className="font-bold text-navy">Customer accounts &amp; logins</h2>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-navy/60">
                  Every Supabase account, incomplete signup, confirmation state,
                  latest sign-in, and recent authentication activity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAccounts()}
                disabled={accountLoading}
                className="self-start rounded-xl bg-navy px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {accountLoading ? "Refreshing…" : "Refresh accounts"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["Total", accountCounts.total],
                ["Active", accountCounts.active],
                ["Unconfirmed", accountCounts.unconfirmed],
                ["No login yet", accountCounts.neverSignedIn],
                ["Banned", accountCounts.banned],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-navy/[0.03] px-3 py-2">
                  <p className="text-lg font-black text-navy">{value}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-navy/50">
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {accountActivityMigrationRequired && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Account list is live. Authentication history will appear after
                migration 027 is applied.
              </p>
            )}

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <div className="overflow-hidden rounded-xl border border-navy/10">
                <div className="border-b border-navy/10 bg-navy/[0.02] px-3 py-2 text-xs font-bold uppercase tracking-wider text-navy/55">
                  Accounts ({accounts.length})
                </div>
                <div className="max-h-[430px] divide-y divide-navy/10 overflow-y-auto">
                  {accounts.length === 0 ? (
                    <p className="p-4 text-sm text-navy/55">
                      {accountLoading ? "Loading accounts…" : "No accounts found."}
                    </p>
                  ) : (
                    accounts.map((account) => (
                      <div key={account.id} className="p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-navy">
                              {account.fullName || account.email || account.phone || "Unnamed account"}
                            </p>
                            {account.fullName && account.email && (
                              <p className="truncate text-xs text-navy/55">{account.email}</p>
                            )}
                            <p className="mt-1 text-[11px] text-navy/45">
                              Created {formatAuditTime(account.createdAt)} · Role {account.role}
                            </p>
                            <p className="mt-0.5 text-[11px] text-navy/45">
                              {account.lastSignInAt
                                ? `Last login ${formatAuditTime(account.lastSignInAt)}`
                                : account.confirmedAt
                                  ? "Confirmed, but no login recorded"
                                  : "Email/phone confirmation incomplete"}
                            </p>
                          </div>
                          <span
                            className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${ACCOUNT_STATUS_STYLES[account.status]}`}
                          >
                            {ACCOUNT_STATUS_LABELS[account.status]}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-navy/10">
                <div className="border-b border-navy/10 bg-navy/[0.02] px-3 py-2 text-xs font-bold uppercase tracking-wider text-navy/55">
                  Successful sign-ins ({authEvents.length})
                </div>
                <div className="max-h-[430px] divide-y divide-navy/10 overflow-y-auto">
                  {authEvents.length === 0 ? (
                    <p className="p-4 text-sm text-navy/55">
                      {accountActivityMigrationRequired
                        ? "Migration 028 is required for successful sign-in history."
                        : "No successful sign-ins recorded yet."}
                    </p>
                  ) : (
                    authEvents.map((event) => (
                      <div key={event.id} className="p-3">
                        <p className="text-xs font-bold text-navy">
                          {event.action.replace(/_/g, " ")}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-navy/55">
                          {event.email || event.userId || "System event"}
                        </p>
                        <p className="mt-1 text-[11px] text-navy/40">
                          {formatAuditTime(event.createdAt)}
                          {event.ipAddress ? ` · ${event.ipAddress}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">
                Data scope
              </p>
              <p className="mt-1 text-sm leading-relaxed text-navy/65">
                Production stats exclude pre-launch and obvious test records.
                Demo/test records stay stored for review and can be purged at
                launch.
              </p>
            </div>
            <div className="grid min-w-full grid-cols-3 gap-2 rounded-xl bg-navy/[0.03] p-1 text-xs font-bold text-navy lg:min-w-[420px]">
              {([
                ["production", `Production ${productionCount}`],
                ["demo", `Demo/test ${demoCount}`],
                ["all", `All ${bookings.filter((booking) => !booking.archivedAt).length}`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDataView(value);
                    setCleanupOnly(false);
                  }}
                  className={`rounded-lg px-2 py-2 transition-colors ${
                    dataView === value
                      ? "bg-white text-navy shadow-sm shadow-navy/5"
                      : "text-navy/55 hover:bg-white/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
            Demo/test means records created before {PRELAUNCH_DEMO_LABEL},
            internal Travelyt customer emails, or bookings with obvious test
            wording. This is a reporting separation only; it does not delete or
            hide records from audit history.
          </div>
          {demoCount + demoArchivedCount > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {demoCount} active and {demoArchivedCount} archived demo/test
                record{demoCount + demoArchivedCount === 1 ? "" : "s"} are
                separated from production reporting.
              </span>
              <button
                type="button"
                onClick={() => {
                  setDataView("demo");
                  setArchiveView("all");
                  setCleanupOnly(false);
                }}
                className="self-start rounded-lg bg-yellow-900 px-2.5 py-1.5 font-bold text-white shadow-sm shadow-yellow-900/5 sm:self-auto"
              >
                Review demo records
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          <aside className="space-y-4 xl:sticky xl:top-24">

          <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                  <h2 className="font-bold text-navy">Driver applications</h2>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-navy/55">
                  People who applied at travelyt.us/driver/apply. Approve to
                  auto-create their one-time sign-in code.
                </p>
              </div>
              <button
                onClick={() => void loadApplications()}
                className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
              >
                Refresh
              </button>
            </div>

            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-navy/45">
              {applications.length} total ·{" "}
              {
                applications.filter(
                  (a) => a.status === "pending" || a.status === "reviewing"
                ).length
              }{" "}
              awaiting review
            </p>

            {applications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-navy/10 p-4 text-sm text-navy/55">
                No applications yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="rounded-xl border border-navy/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-navy">
                          {app.full_name}
                        </p>
                        <a
                          href={`mailto:${app.email}`}
                          className="block truncate text-xs text-navy/55 hover:text-[#ff6868]"
                        >
                          {app.email}
                        </a>
                        {app.phone && (
                          <p className="text-xs text-navy/55">{app.phone}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          app.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : app.status === "rejected" ||
                                app.status === "withdrawn"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>

                    <div className="mt-2 grid gap-0.5 text-xs text-navy/60">
                      <p>
                        {app.city}, {app.state} · {app.availability}
                      </p>
                      <p>
                        {app.vehicle_make_model} · plate {app.license_plate}
                      </p>
                      <p>
                        License {app.drivers_license_state} ••
                        {app.drivers_license_last4}
                      </p>
                      {app.referral_source && (
                        <p>Heard via: {app.referral_source}</p>
                      )}
                      {app.notes && (
                        <p className="italic">&ldquo;{app.notes}&rdquo;</p>
                      )}
                    </div>

                    {appCode && appCode.id === app.id && (
                      <div className="mt-2 rounded-lg border border-green-100 bg-green-50 p-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">
                          One-time sign-in code
                        </p>
                        <code className="mt-1 block rounded bg-white px-2 py-1 text-sm font-bold text-navy">
                          {appCode.code}
                        </code>
                        <p className="mt-1 text-[10px] text-green-700">
                          Share with the driver now — shown once.
                        </p>
                      </div>
                    )}

                    {(app.status === "pending" ||
                      app.status === "reviewing") &&
                      adminRole === "admin" && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() =>
                              void reviewApplication(app.id, "approve")
                            }
                            disabled={appBusyId === app.id}
                            className="flex-1 rounded-lg bg-[#ff6868] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#ff5252] disabled:opacity-60"
                          >
                            {appBusyId === app.id
                              ? "Working…"
                              : "Approve + create code"}
                          </button>
                          <button
                            onClick={() =>
                              void reviewApplication(app.id, "reject")
                            }
                            disabled={appBusyId === app.id}
                            className="rounded-lg bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>

        {stalePending.length > 0 && (
          <div className="flex gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
            <div>
              <p className="font-bold">
                {stalePending.length} stale pending booking
                {stalePending.length === 1 ? "" : "s"} need cleanup.
              </p>
              <p className="mt-1 leading-relaxed">
                These are production-scope records only. Open the cleanup
                queue, then update the travel date, move the status forward, or
                archive stale records so they stay stored but out of operations.
              </p>
              <button
                type="button"
                onClick={openStaleCleanupQueue}
                className="mt-3 rounded-xl bg-yellow-900 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                Open cleanup queue
              </button>
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

          {PARTNER_INTEGRATIONS_ENABLED && (
            <div className="rounded-2xl border border-navy/10 bg-white p-4 shadow-sm shadow-navy/5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                    <h2 className="font-bold text-navy">Partner integrations</h2>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-navy/55">
                    Provider adapters for airlines, storage, travel partners, and
                    future systems. Partners stay inactive until credentials and
                    terms are real.
                  </p>
                </div>
                <button
                  onClick={() => void loadPartnerIntegrations()}
                  className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
                >
                  Refresh
                </button>
              </div>

              {partnerMigrationRequired && (
                <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-900">
                  Apply Supabase migration{" "}
                  <code className="font-bold">018_partner_integration_layer.sql</code>{" "}
                  before saving events or activating providers.
                </div>
              )}

              <div className="space-y-2">
                {partnerIntegrations.length ? (
                  partnerIntegrations.map((integration) => (
                    <div
                      key={integration.id}
                      className="rounded-xl border border-gray-100 bg-[#f8f9fc] p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-navy">
                            {integration.name}
                          </div>
                          <div className="mt-0.5 text-xs text-navy/50">
                            {integration.kind} · {integration.environment} ·{" "}
                            {integration.auth_type}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            integration.active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {integration.active ? "active" : "inactive"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {integration.capabilities.slice(0, 5).map((capability) => (
                          <span
                            key={capability}
                            className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-navy/55"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                      {integration.notes && (
                        <p className="mt-2 text-xs leading-relaxed text-navy/60">
                          {integration.notes}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void togglePartnerIntegration(
                            integration.id,
                            !integration.active
                          )
                        }
                        disabled={adminRole !== "admin" || partnerMigrationRequired}
                        className="mt-3 rounded-lg bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-40"
                      >
                        {integration.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-navy/10 p-4 text-sm text-navy/55">
                    No partner integrations loaded.
                  </div>
                )}
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
                Create one account per courier. The full access code is shown
                once; after that only the last characters are visible. Reset a
                lost code on the same account instead of creating a duplicate.
              </p>
            </div>
            <button
              onClick={() => void loadDriverCodes()}
              className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
            >
              Refresh codes
            </button>
          </div>

          {agentMigrationRequired ? (
            <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-900">
              Apply Supabase migration <code className="font-bold">030_agent_assignment_acceptance.sql</code>{" "}
              before certifying or assigning agents.
            </div>
          ) : (
            <AgentReadinessEditor
              profiles={agentReadiness}
              disabled={adminRole !== "admin"}
              onSave={saveAgentReadiness}
            />
          )}

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
                Send this to the driver privately. If they lose it, use Reset
                access on the same account so identity and readiness evidence
                remain linked to the correct person.
              </p>
            </div>
          )}

          {driverOnboardingLink && (
            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Optional onboarding fallback · {driverOnboardingLink.driverName}
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-2 text-xs font-bold text-navy">
                  {driverOnboardingLink.url}
                </code>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(driverOnboardingLink.url)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white"
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-blue-800">
                This is not required for the normal flow. It expires {formatDate(driverOnboardingLink.expiresAt)} and can be sent privately if the driver cannot use the normal access-code login.
              </p>
            </div>
          )}

          {driverEvidencePanel && (
            <div className="mb-4 rounded-2xl border border-navy/10 bg-navy/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-navy/65">
                  Evidence · {driverEvidencePanel.driverName}
                </p>
                <button type="button" onClick={() => setDriverEvidencePanel(null)} className="text-xs font-bold text-navy/50 underline">
                  Close
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {driverEvidencePanel.training && (
                  <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-xs text-green-900">
                    <p className="font-bold">Foundational training · {driverEvidencePanel.training.score}%</p>
                    <p className="mt-1">
                      Signed by {driverEvidencePanel.training.signatureName} · {formatDate(driverEvidencePanel.training.completedAt)} · {driverEvidencePanel.training.reviewStatus} review
                    </p>
                    <p className="mt-1 text-green-800">
                      Knowledge completion is recorded. It does not activate readiness or replace the observed physical drill.
                    </p>
                  </div>
                )}
                {driverEvidencePanel.items.length ? driverEvidencePanel.items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-navy">{item.evidenceType.replaceAll("_", " ")}</p>
                      <p className="text-navy/55">{item.originalName} · {(item.byteSize / 1024 / 1024).toFixed(1)} MB · {item.reviewStatus}</p>
                    </div>
                    {item.downloadUrl ? (
                      <a href={item.downloadUrl} target="_blank" rel="noreferrer" className="font-bold text-[#ff6868] underline">Review private file</a>
                    ) : (
                      <span className="text-red-600">Download unavailable</span>
                    )}
                  </div>
                )) : <p className="text-sm text-navy/55">No evidence uploaded yet.</p>}
              </div>
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
              placeholder="Email (required unless phone provided)"
              disabled={adminRole !== "admin"}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 disabled:bg-gray-50 disabled:text-navy/40"
            />
            <input
              value={newDriverPhone}
              onChange={(event) => setNewDriverPhone(event.target.value)}
              placeholder="Phone (required unless email provided)"
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
              Dispatchers can view code status. Only admin can create, revoke,
              or archive driver codes.
            </p>
          )}

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
            Active codes open one self-serve path: documents, ID + selfie,
            training, then operations review. Archived codes are blocked from
            future driver sign-in.
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-navy/[0.03] p-1 text-xs font-bold text-navy">
            {([
              ["active", `Active ${activeDriverCodeCount}`],
              ["archived", `Archived ${archivedDriverCodeCount}`],
              ["all", `All ${driverCodes.length}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDriverCodeView(value)}
                className={`rounded-lg px-2 py-2 transition-colors ${
                  driverCodeView === value
                    ? "bg-white text-navy shadow-sm shadow-navy/5"
                    : "text-navy/55 hover:bg-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100">
            {filteredDriverCodes.length ? (
              filteredDriverCodes.slice(0, 8).map((code) => (
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
                    {driverCodeStatusLabel(code)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadDriverEvidence(code)}
                    disabled={adminRole !== "admin"}
                    className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-40"
                  >
                    View evidence
                  </button>
                  <button
                    type="button"
                    onClick={() => void createDriverOnboardingLink(code)}
                    disabled={adminRole !== "admin" || code.status !== "active" || !code.driverEmail}
                    className="self-start rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40"
                  >
                    Optional fallback link
                  </button>
                  <button
                    type="button"
                    onClick={() => void rotateDriverCode(code)}
                    disabled={adminRole !== "admin" || code.status !== "active"}
                    className="self-start rounded-xl bg-[#ff6868]/10 px-3 py-2 text-xs font-bold text-[#c74444] transition-colors hover:bg-[#ff6868]/20 disabled:opacity-40"
                  >
                    Reset access
                  </button>
                  <button
                    type="button"
                    onClick={() => void revokeDriverCode(code.id)}
                    disabled={adminRole !== "admin" || code.status !== "active"}
                    className="self-start rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-40"
                  >
                    {code.status === "active" ? "Revoke + archive" : "Stored"}
                  </button>
                </div>
              ))
            ) : (
              <div className="p-5 text-center text-sm text-navy/55">
                No driver codes in this view.
              </div>
            )}
          </div>
        </div>

          </aside>

          <section id="booking-cleanup-queue" className="min-w-0 space-y-4">
            {PARTNER_INTEGRATIONS_ENABLED && (
              <div className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">
                    Partner event log
                  </p>
                  <h2 className="text-xl font-bold text-navy">
                    Integration activity
                  </h2>
                  <p className="mt-1 text-sm text-navy/60">
                    Manual and API events from systems like United, Royal
                    Jordanian, Stasher, and future partners.
                  </p>
                </div>
                <span className="self-start rounded-full bg-navy/5 px-3 py-1.5 text-xs font-bold text-navy/60">
                  {partnerEvents.length} recent event
                  {partnerEvents.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="rounded-2xl border border-gray-100 bg-[#f8f9fc] p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <select
                      value={partnerEventProvider}
                      onChange={(event) => setPartnerEventProvider(event.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-navy outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
                    >
                      {partnerIntegrations.map((integration) => (
                        <option key={integration.id} value={integration.id}>
                          {integration.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={partnerEventBooking}
                      onChange={(event) => setPartnerEventBooking(event.target.value)}
                      placeholder="Booking ID optional"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
                    />
                    <input
                      value={partnerEventReference}
                      onChange={(event) => setPartnerEventReference(event.target.value)}
                      placeholder="External reference optional"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
                    />
                    <input
                      value={partnerEventType}
                      onChange={(event) => setPartnerEventType(event.target.value)}
                      placeholder="Event type"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
                    />
                    <input
                      value={partnerEventStatus}
                      onChange={(event) => setPartnerEventStatus(event.target.value)}
                      placeholder="Status"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
                    />
                    <textarea
                      value={partnerEventNote}
                      onChange={(event) => setPartnerEventNote(event.target.value)}
                      placeholder="Manual note, API result, partner response, or next step"
                      className="min-h-24 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 sm:col-span-2 lg:col-span-1"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void recordPartnerEvent()}
                    disabled={savingPartnerEvent || partnerMigrationRequired}
                    className="mt-3 w-full rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {savingPartnerEvent ? "Saving..." : "Record partner event"}
                  </button>
                  {partnerMigrationRequired && (
                    <p className="mt-2 text-xs text-yellow-800">
                      Event saving unlocks after the partner migration is applied.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {partnerEvents.length ? (
                    partnerEvents.slice(0, 6).map((event) => (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-gray-100 bg-[#f8f9fc] p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${
                              event.direction === "inbound"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-purple-100 text-purple-700"
                            }`}
                          >
                            {event.direction}
                          </span>
                          <span className="font-semibold text-navy">
                            {event.provider_id}
                          </span>
                          <span className="text-xs text-navy/45">
                            {event.event_type} · {event.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-navy/55">
                          {formatAuditTime(event.created_at)}
                          {event.booking_id ? ` · ${event.booking_id}` : ""}
                          {event.external_reference
                            ? ` · ${event.external_reference}`
                            : ""}
                        </div>
                        {event.error_message && (
                          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                            {event.error_message}
                          </p>
                        )}
                        {event.payload?.note ? (
                          <p className="mt-2 text-xs leading-relaxed text-navy/65">
                            {String(event.payload.note)}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-navy/15 bg-white/60 p-6 text-center text-sm text-navy/55">
                      No partner events yet. Start with manual notes while APIs
                      are being approved.
                    </div>
                  )}
                </div>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">
                  Dispatch queue
                </p>
                <h2 className="text-xl font-bold text-navy">
                  {cleanupOnly ? "Cleanup queue" : "Bookings to manage"}
                </h2>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold text-navy/45">
                  Showing {filtered.length} {cleanupOnly ? "cleanup" : `${dataViewLabel(dataView)} ${archiveView}`} booking
                  {filtered.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-navy/40">
                  {archivedCount} archived {dataViewLabel(dataView)} record
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
                onClick={() => {
                  setArchiveView(value);
                  setCleanupOnly(false);
                }}
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
          {cleanupOnly && (
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Only showing stale pending bookings. Update the date/status or
                archive old test records to clear this queue.
              </span>
              <button
                type="button"
                onClick={() => {
                  setCleanupOnly(false);
                  setStatus("all");
                }}
                className="self-start rounded-lg bg-white px-2.5 py-1.5 font-bold text-yellow-900 shadow-sm shadow-yellow-900/5 sm:self-auto"
              >
                Clear cleanup view
              </button>
            </div>
          )}
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
              onChange={(event) => {
                const nextStatus = event.target.value as Booking["status"] | "all";
                setStatus(nextStatus);
                if (nextStatus !== "pending") setCleanupOnly(false);
              }}
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
                void loadAgentOperations();
                void loadPartnerIntegrations();
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
            filtered.map((booking) => {
              const assignment = agentAssignments.find((row) =>
                row.bookingId === booking.id && ["assigned", "accepted"].includes(row.status)
              );
              return (
                <BookingCard
                  key={`${booking.id}:${assignment?.id ?? "unassigned"}`}
                  booking={booking}
                  disabled={updatingId === booking.id}
                  onPatch={(patch, reason) => updateBooking(booking.id, patch, reason)}
                  agentProfiles={agentReadiness}
                  assignment={assignment}
                  onAssign={assignAgents}
                  onEligibilityDecision={decidePilotEligibility}
                />
              );
            })
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

function dateInputValue(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function agentReadinessForm(profile?: AgentReadinessProfile): Record<string, string> {
  if (!profile) return {};
  return {
    status: profile.status,
    identityEvidenceReference: profile.identityEvidenceReference ?? "",
    identityVerifiedAt: dateInputValue(profile.identityVerifiedAt),
    identityExpiresAt: dateInputValue(profile.identityExpiresAt),
    trainingEvidenceReference: profile.trainingEvidenceReference ?? "",
    trainingCompletedAt: dateInputValue(profile.trainingCompletedAt),
    trainingExpiresAt: dateInputValue(profile.trainingExpiresAt),
    insuranceEvidenceReference: profile.insuranceEvidenceReference ?? "",
    insuranceVerifiedAt: dateInputValue(profile.insuranceVerifiedAt),
    insuranceExpiresAt: dateInputValue(profile.insuranceExpiresAt),
    vehicleMakeModel: profile.vehicleMakeModel ?? "",
    licensePlate: profile.licensePlate ?? "",
    vehicleEvidenceReference: profile.vehicleEvidenceReference ?? "",
    vehicleVerifiedAt: dateInputValue(profile.vehicleVerifiedAt),
    vehicleExpiresAt: dateInputValue(profile.vehicleExpiresAt),
    notes: profile.notes ?? "",
  };
}

function AgentReadinessEditor({
  profiles,
  disabled,
  onSave,
}: {
  profiles: AgentReadinessProfile[];
  disabled: boolean;
  onSave: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = profiles.find((profile) => profile.driverAccessId === selectedId);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");

  function field(name: string, label: string, type = "text") {
    return (
      <label className="grid gap-1 text-[11px] font-bold uppercase tracking-wider text-navy/50">
        {label}
        <input
          type={type}
          value={form[name] ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
          disabled={disabled || saving}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-navy outline-none focus:border-[#ff6868] disabled:bg-gray-50"
        />
      </label>
    );
  }

  return (
    <div className="mb-4 rounded-2xl border border-navy/10 bg-navy/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-navy/45">Checkpoint 1 gate</p>
          <h3 className="mt-1 font-bold text-navy">Agent readiness evidence</h3>
          <p className="mt-1 text-xs leading-relaxed text-navy/55">
            Assignment stays blocked until both the primary and backup have current identity,
            training, insurance, vehicle, and individual-access evidence.
          </p>
        </div>
        {selected && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected.ready ? "bg-green-100 text-green-700" : "bg-red-50 text-red-700"}`}>
            {selected.ready ? "Ready" : "Blocked"}
          </span>
        )}
      </div>
      <select
        value={selectedId}
        onChange={(event) => {
          const nextId = event.target.value;
          setSelectedId(nextId);
          setForm(agentReadinessForm(profiles.find((profile) => profile.driverAccessId === nextId)));
          setLocalError("");
        }}
        className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-[#ff6868]"
      >
        <option value="">Select an individual agent account</option>
        {profiles.map((profile) => (
          <option key={profile.driverAccessId} value={profile.driverAccessId}>
            {profile.driverName} · {profile.ready ? "ready" : "blocked"}
          </option>
        ))}
      </select>
      {selected && (
        <div className="mt-4 space-y-4">
          <label className="grid gap-1 text-[11px] font-bold uppercase tracking-wider text-navy/50">
            Operational status
            <select
              value={form.status ?? "pending"}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              disabled={disabled || saving}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-navy outline-none focus:border-[#ff6868] disabled:bg-gray-50"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
            <span className="font-bold">Provider-backed identity:</span>{" "}
            {selected.identityVerifiedAt
              ? `Stripe Identity verified ${new Date(selected.identityVerifiedAt).toLocaleDateString()}.`
              : "No current Stripe Identity verification matches this agent email."}
            {selected.identityExpiresAt ? ` Expires ${new Date(selected.identityExpiresAt).toLocaleDateString()}.` : ""}
            Identity evidence cannot be manually certified here.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("trainingEvidenceReference", "Training evidence ref")}
            {field("trainingCompletedAt", "Training completed", "date")}
            {field("trainingExpiresAt", "Training expires", "date")}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("insuranceEvidenceReference", "Insurance evidence ref")}
            {field("insuranceVerifiedAt", "Insurance verified", "date")}
            {field("insuranceExpiresAt", "Insurance expires", "date")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {field("vehicleMakeModel", "Vehicle")}
            {field("licensePlate", "Plate")}
            {field("vehicleEvidenceReference", "Vehicle evidence ref")}
            {field("vehicleVerifiedAt", "Vehicle verified", "date")}
            {field("vehicleExpiresAt", "Vehicle expires", "date")}
          </div>
          {field("notes", "Internal readiness note")}
          {selected.blockers.length > 0 && (
            <ul className="rounded-xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700">
              {selected.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
            </ul>
          )}
          {localError && <p className="text-xs font-semibold text-red-600">{localError}</p>}
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => {
              setSaving(true);
              setLocalError("");
              void onSave({ driverAccessId: selected.driverAccessId, ...form })
                .catch((error) => setLocalError(error instanceof Error ? error.message : "Could not save readiness."))
                .finally(() => setSaving(false));
            }}
            className="w-full rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving evidence..." : "Save readiness evidence"}
          </button>
        </div>
      )}
    </div>
  );
}

function BookingCard({
  booking,
  disabled,
  onPatch,
  agentProfiles,
  assignment,
  onAssign,
  onEligibilityDecision,
}: {
  booking: Booking;
  disabled: boolean;
  onPatch: (patch: Partial<Booking>, reason?: string) => void | Promise<void>;
  agentProfiles: AgentReadinessProfile[];
  assignment?: AgentAssignment;
  onAssign: (input: {
    bookingId: string;
    primaryDriverAccessId: string;
    backupDriverAccessId: string;
    reason?: string;
  }) => void | Promise<void>;
  onEligibilityDecision: (input: {
    bookingId: string;
    decision: Exclude<PilotEligibilityStatus, "pending" | "expired">;
    reason: string;
  }) => void | Promise<void>;
}) {
  const [primaryAgentId, setPrimaryAgentId] = useState(assignment?.primaryDriverAccessId ?? "");
  const [backupAgentId, setBackupAgentId] = useState(assignment?.backupDriverAccessId ?? "");
  const [auditReason, setAuditReason] = useState("");
  const [issueType, setIssueType] = useState<BookingIssueType | "">(
    booking.issueType ?? ""
  );
  const [issueNotes, setIssueNotes] = useState(booking.issueNotes ?? "");
  const [issueResolution, setIssueResolution] = useState(
    booking.issueResolution ?? ""
  );
  const [bags, setBags] = useState<BookingBag[] | null>(null);
  const [bagsBusy, setBagsBusy] = useState(false);
  const [bagsError, setBagsError] = useState("");
  const [reviewBusyPassengerId, setReviewBusyPassengerId] = useState("");
  const [reviewedPassengerStatuses, setReviewedPassengerStatuses] = useState<Record<string, "verified" | "rejected">>({});
  const [reviewError, setReviewError] = useState("");
  const [reviewEvidenceReference, setReviewEvidenceReference] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [eligibilityReason, setEligibilityReason] = useState("");
  const [eligibilityBusy, setEligibilityBusy] = useState(false);

  async function reviewPassenger(passengerId: string, action: "verify" | "reject") {
    setReviewBusyPassengerId(passengerId);
    setReviewError("");
    try {
      const response = await fetch("/api/identity/verification-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          bookingId: booking.id,
          passengerId,
          action,
          evidenceReference: reviewEvidenceReference,
          reason: reviewReason,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not complete identity review.");
      }
      setReviewedPassengerStatuses((current) => ({ ...current, [passengerId]: action === "verify" ? "verified" : "rejected" }));
      setReviewEvidenceReference("");
      setReviewReason("");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not complete identity review.");
    } finally {
      setReviewBusyPassengerId("");
    }
  }

  async function loadBags() {
    setBagsBusy(true);
    setBagsError("");
    try {
      const response = await fetch(
        `/api/custody?bookingId=${encodeURIComponent(booking.id)}`,
        { credentials: "same-origin" }
      );
      const data = (await response.json()) as { bags?: BookingBag[] };
      if (!response.ok) throw new Error("Could not load bags.");
      setBags(data.bags ?? []);
    } catch (err) {
      setBagsError(err instanceof Error ? err.message : "Could not load bags.");
    } finally {
      setBagsBusy(false);
    }
  }

  async function issueBadges() {
    setBagsBusy(true);
    setBagsError("");
    try {
      const response = await fetch("/api/custody", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "issue",
          bookingId: booking.id,
          count: booking.bags,
        }),
      });
      const data = (await response.json()) as { bags?: BookingBag[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not issue badges.");
      await loadBags();
    } catch (err) {
      setBagsError(err instanceof Error ? err.message : "Could not issue badges.");
    } finally {
      setBagsBusy(false);
    }
  }

  const demoBooking = isDemoBooking(booking);
  const stale = isStalePending(booking);
  const effectivePassengers = booking.passengers?.map((passenger) => {
    const reviewedStatus = reviewedPassengerStatuses[passenger.id];
    if (!reviewedStatus) return passenger;
    return {
      ...passenger,
      verificationStatus: reviewedStatus,
      identityVerifiedAt: reviewedStatus === "verified"
        ? passenger.identityVerifiedAt ?? "reviewed-in-session"
        : undefined,
    };
  });
  const effectiveBooking = { ...booking, passengers: effectivePassengers };
  const travelerBlockers = passengerManifestCustodyBlockers(
    effectivePassengers,
    Boolean(booking.customerIdentityVerifiedAt)
  );
  const identityReady = Boolean(
    booking.customerIdentityVerifiedAt &&
      booking.driverIdentityVerifiedAt &&
      travelerBlockers.length === 0
  );
  const restrictedReady = Boolean(booking.restrictedItemsAttestedAt);
  const blockers = custodyBlockers(effectiveBooking);
  const custodyReady = blockers.length === 0;
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
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              booking.pilotEligibilityStatus === "approved"
                ? "bg-green-100 text-green-800"
                : booking.pilotEligibilityStatus === "declined"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-800"
            }`}>
              {PILOT_ELIGIBILITY_LABELS[booking.pilotEligibilityStatus ?? "pending"]}
            </span>
            {stale && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-semibold text-yellow-800">
                Past date
              </span>
            )}
            {demoBooking && (
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                Demo/test
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
            {booking.email}
            {booking.phone ? ` · ${booking.phone}` : ""}
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

      {booking.status === "pending" && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-navy">Pilot eligibility gate</p>
          {booking.pilotEligibilityStatus === "pending" || !booking.pilotEligibilityStatus ? (
            <>
              <p className="mt-1 text-xs leading-relaxed text-navy/70">
                Approve only after confirming eligible flight, eligible traveler,
                route within the pilot area, minimum notice, and available capacity.
                Approval unlocks Stripe for 24 hours. Waitlisted and declined
                requests are never sent to checkout.
              </p>
              <textarea
                value={eligibilityReason}
                onChange={(event) => setEligibilityReason(event.target.value)}
                placeholder="Required decision reason or capacity note"
                className="mt-3 min-h-20 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-[#ff6868]"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([
                  ["approved", "Approve: all 5 checks passed", "bg-green-700 text-white"],
                  ["waitlisted", "Waitlist — no charge", "bg-amber-200 text-amber-950"],
                  ["declined", "Decline — no charge", "bg-red-100 text-red-700"],
                ] as const).map(([decision, label, className]) => (
                  <button
                    key={decision}
                    type="button"
                    disabled={disabled || eligibilityBusy || eligibilityReason.trim().length < 8}
                    onClick={() => {
                      setEligibilityBusy(true);
                      void Promise.resolve(onEligibilityDecision({
                        bookingId: booking.id,
                        decision,
                        reason: eligibilityReason.trim(),
                      })).finally(() => setEligibilityBusy(false));
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40 ${className}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-navy/70">
              {PILOT_ELIGIBILITY_LABELS[booking.pilotEligibilityStatus]}
              {booking.pilotEligibilityReason ? ` — ${booking.pilotEligibilityReason}` : ""}
              {booking.pilotEligibilityExpiresAt
                ? ` Checkout authorization expires ${formatAuditTime(booking.pilotEligibilityExpiresAt)}.`
                : " No payment authorization was issued."}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 text-sm text-navy/70 sm:grid-cols-2">
        <Info label="Service" value={`${getBookingServiceLabel(booking)} · ${booking.bags} bag${booking.bags > 1 ? "s" : ""}`} />
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

      {booking.passengers && booking.passengers.length > 1 && (
        <div className="mt-4 rounded-2xl border border-navy/10 bg-[#f7f8fb] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-wider text-navy/60">
              Traveler identity reviews
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block rounded-xl border border-navy/10 bg-white px-3 py-3 text-xs font-semibold text-navy/70">
              Document or approved-provider reference
              <input value={reviewEvidenceReference} onChange={(event) => setReviewEvidenceReference(event.target.value)} placeholder="Provider case or manual ledger reference" className="mt-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-sm font-normal text-navy outline-none focus:border-[#ff6868]" />
            </label>
            <label className="block rounded-xl border border-navy/10 bg-white px-3 py-3 text-xs font-semibold text-navy/70">
              Rejection reason
              <input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Required only when rejecting" className="mt-2 w-full rounded-lg border border-navy/15 px-3 py-2 text-sm font-normal text-navy outline-none focus:border-[#ff6868]" />
            </label>
          </div>
          <div className="mt-3 space-y-2">
            {booking.passengers.map((passenger) => {
              const localStatus = reviewedPassengerStatuses[passenger.id];
              const status = localStatus ?? passenger.verificationStatus;
              const reviewable = passenger.verificationMethod === "self_service" &&
                ["pending", "manual_review"].includes(status);
              return (
                <div key={passenger.id} className="flex flex-col gap-2 rounded-xl border border-navy/10 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-navy">{passenger.firstName} {passenger.lastName}</p>
                    <p className="mt-0.5 text-xs capitalize text-navy/55">{passenger.category.replace("_", " ")} · {passenger.relationship} · {passenger.bags} bag{passenger.bags === 1 ? "" : "s"} · {status.replaceAll("_", " ")}</p>
                  </div>
                  {status === "verified" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                    </span>
                  ) : status === "rejected" ? (
                    <span className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">Rejected</span>
                  ) : reviewable ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void reviewPassenger(passenger.id, "verify")} disabled={Boolean(reviewBusyPassengerId)} className="rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-50">
                        {reviewBusyPassengerId === passenger.id ? "Saving..." : "Mark verified"}
                      </button>
                      <button type="button" onClick={() => void reviewPassenger(passenger.id, "reject")} disabled={Boolean(reviewBusyPassengerId)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:cursor-wait disabled:opacity-50">
                        Reject
                      </button>
                    </div>
                  ) : status === "invite_sent" ? (
                    <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-800">Waiting for adult consent</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">{String(status).replaceAll("_", " ")}</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-navy/55">
            Only mark a separate adult verified after their private consent plus the required document and liveness review. Raw identity documents do not belong in the booking manifest.
          </p>
          {reviewError && <p className="mt-2 text-xs font-semibold text-red-600">{reviewError}</p>}
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

      <div className="mt-4 rounded-2xl border border-navy/10 bg-navy/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-navy/70" strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-wider text-navy/60">
              Bags &amp; badges
            </span>
          </div>
          {bags === null ? (
            <button
              onClick={() => void loadBags()}
              disabled={bagsBusy}
              className="rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-50"
            >
              {bagsBusy ? "Loading…" : "View badges"}
            </button>
          ) : (
            <button
              onClick={() => void loadBags()}
              disabled={bagsBusy}
              className="rounded-xl bg-navy/5 px-3 py-2 text-xs font-bold text-navy transition-colors hover:bg-navy/10 disabled:opacity-50"
            >
              Refresh
            </button>
          )}
        </div>

        <p className="mb-3 text-xs leading-relaxed text-navy/55">
          Mint a tamper-evident badge per bag. Each badge is a scannable,
          hash-chained custody record at{" "}
          <span className="font-mono">travelyt.us/badge/CODE</span>.
        </p>

        {bagsError && (
          <p className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {bagsError}
          </p>
        )}

        {bags !== null && bags.length === 0 && (
          <p className="mb-3 text-xs text-navy/55">
            No badges issued yet for this booking&rsquo;s {booking.bags} bag
            {booking.bags > 1 ? "s" : ""}.
          </p>
        )}

        {bags !== null && bags.length > 0 && (
          <div className="mb-3 grid gap-2">
            {bags.map((bag) => (
              <div
                key={bag.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-navy/10 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-navy">
                    {bag.badge_code}
                  </p>
                  <p className="text-[11px] text-navy/50">
                    {bag.label ?? "Bag"} · {bag.status.replace(/_/g, " ")}
                  </p>
                </div>
                <Link
                  href={`/badge/${bag.badge_code}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-lg bg-navy/5 px-2.5 py-1.5 text-xs font-bold text-navy transition-colors hover:bg-navy/10"
                >
                  Open <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
            ))}
          </div>
        )}

        {bags !== null && bags.length === 0 && (
          <button
            onClick={() => void issueBadges()}
            disabled={disabled || bagsBusy}
            className="rounded-xl bg-[#ff6868] px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {bagsBusy
              ? "Issuing…"
              : `Issue ${booking.bags} badge${booking.bags > 1 ? "s" : ""}`}
          </button>
        )}
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
        <div className="grid gap-3 sm:grid-cols-[150px_1fr_1fr_auto]">
        <select
          value={booking.status}
          disabled={disabled || assignment?.status === "accepted"}
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
              <option
                key={option}
                value={option}
                disabled={option === "assigned" || option === "accepted"}
              >
                {STATUS_LABELS[option]}
              </option>
            ))}
        </select>
        <select
          value={primaryAgentId}
          onChange={(event) => setPrimaryAgentId(event.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
        >
          <option value="">Primary agent</option>
          {agentProfiles.map((profile) => (
            <option key={profile.driverAccessId} value={profile.driverAccessId} disabled={!profile.ready}>
              {profile.driverName}{profile.ready ? "" : " — blocked"}
            </option>
          ))}
        </select>
        <select
          value={backupAgentId}
          onChange={(event) => setBackupAgentId(event.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10"
        >
          <option value="">Backup agent</option>
          {agentProfiles.map((profile) => (
            <option key={profile.driverAccessId} value={profile.driverAccessId} disabled={!profile.ready || profile.driverAccessId === primaryAgentId}>
              {profile.driverName}{profile.ready ? "" : " — blocked"}
            </option>
          ))}
        </select>
        <button
          disabled={disabled || assignment?.status === "accepted"}
          onClick={() => {
            void onAssign({
              bookingId: booking.id,
              primaryDriverAccessId: primaryAgentId,
              backupDriverAccessId: backupAgentId,
              reason: auditReason.trim() || undefined,
            });
            setAuditReason("");
          }}
          className="rounded-xl bg-[#ff6868] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {disabled ? "Saving..." : assignment?.status === "accepted" ? "Accepted" : assignment ? "Reassign" : "Assign agents"}
        </button>
        </div>
        {assignment && (
          <p className="mt-2 text-xs leading-relaxed text-navy/55">
            Primary: {assignment.primaryDriverName} · Backup: {assignment.backupDriverName} ·{" "}
            {assignment.status === "accepted"
              ? `Accepted ${formatDate(assignment.acceptedAt || assignment.assignedAt)}`
              : `Accept by ${formatDate(assignment.acceptanceDueAt)}`}
          </p>
        )}
        {!agentProfiles.some((profile) => profile.ready) && (
          <p className="mt-2 text-xs font-semibold text-red-600">
            No agent has complete, current identity, training, insurance, and vehicle evidence.
          </p>
        )}
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
