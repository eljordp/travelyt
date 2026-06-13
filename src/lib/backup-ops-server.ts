import { randomUUID } from "crypto";
import type { AdminRole } from "@/lib/admin-auth";
import { rowToBooking, type BookingRow } from "@/lib/booking-mappers";
import type { Booking, BookingAuditEntry, BookingStatus } from "@/lib/bookings";
import {
  BACKUP_ACTIVE_STATUSES,
  BACKUP_SERVICE_LABELS,
  BACKUP_STATUS_LABELS,
  backupNextAction,
  backupTrackingUrl,
  csvCell,
  formatBackupMoney,
  latestProofSummary,
  latestSealId,
  type BackupLogCategory,
} from "@/lib/backup-ops";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export type BackupSession = {
  email: string;
  role: AdminRole;
};

export type BackupLogInput = {
  category: BackupLogCategory;
  note: string;
  status?: BookingStatus;
  sealId?: string;
};

function getAdminClient() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Booking backend is not configured.");
  return supabase;
}

function timestampPatchForStatus(status: BookingStatus, now: string) {
  const patch: Record<string, string | null> = {};
  if (status === "accepted") patch.accepted_at = now;
  if (status === "en_route") patch.en_route_at = now;
  if (status === "arrived") patch.arrived_at = now;
  if (status === "picked_up") patch.picked_up_at = now;
  if (status === "delivery_pending") patch.delivery_pending_at = now;
  if (status === "delivered") patch.delivered_at = now;
  if (status === "closed") patch.closed_at = now;
  if (status === "issue") patch.issue_opened_at = now;
  return patch;
}

function backupActionFor(input: BackupLogInput): BookingAuditEntry["action"] {
  if (input.status) return "backup_status";
  if (input.category === "proof") return "backup_proof";
  return "backup_note";
}

function backupReason(input: BackupLogInput) {
  const parts = [`[Backup ${input.category}] ${input.note.trim()}`];
  if (input.sealId?.trim()) parts.push(`Seal ID: ${input.sealId.trim().toUpperCase()}`);
  if (input.status) parts.push(`Manual status: ${BACKUP_STATUS_LABELS[input.status]}`);
  return parts.join(" | ");
}

function toAuditEntry(
  row: BookingRow,
  input: BackupLogInput,
  session: BackupSession,
  now: string
): BookingAuditEntry {
  return {
    id: randomUUID(),
    action: backupActionFor(input),
    fromStatus: row.status,
    toStatus: input.status ?? row.status,
    actorRole: session.role,
    actorName: session.email,
    reason: backupReason(input),
    timestamp: now,
  };
}

export async function listBackupBookings() {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("travel_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return ((data ?? []) as BookingRow[])
    .map(rowToBooking)
    .filter(
      (booking) =>
        !booking.archivedAt && BACKUP_ACTIVE_STATUSES.includes(booking.status)
    );
}

export async function getBackupBooking(id: string) {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();

  if (error) throw error;
  return data ? rowToBooking(data) : null;
}

export async function appendBackupLog(
  id: string,
  input: BackupLogInput,
  session: BackupSession
) {
  const supabase = getAdminClient();
  const { data: existing, error: loadError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle<BookingRow>();

  if (loadError) throw loadError;
  if (!existing) throw new Error("Booking not found.");
  if (!input.note.trim() && !input.status && !input.sealId?.trim()) {
    throw new Error("Add a note, status, or seal ID before saving.");
  }

  const now = new Date().toISOString();
  const history = Array.isArray(existing.status_history)
    ? [...existing.status_history]
    : [];
  history.push(toAuditEntry(existing, input, session, now));

  const rowPatch: Record<string, unknown> = {
    status_history: history,
    updated_at: now,
  };

  if (input.status && input.status !== existing.status) {
    rowPatch.status = input.status;
    Object.assign(rowPatch, timestampPatchForStatus(input.status, now));
  }

  const { data, error } = await supabase
    .from("bookings")
    .update(rowPatch)
    .eq("id", id)
    .select("*")
    .single<BookingRow>();

  if (error) throw error;
  return rowToBooking(data);
}

export function backupCsv(bookings: Booking[]) {
  const header = [
    "booking_id",
    "status",
    "service",
    "airport",
    "travel_date",
    "flight_time",
    "flight",
    "bags",
    "price",
    "paid_at",
    "customer",
    "customer_phone",
    "customer_email",
    "address",
    "driver",
    "seal_id",
    "latest_proof",
    "next_action",
    "tracking_url",
  ];
  const rows = bookings.map((booking) => [
    booking.id,
    BACKUP_STATUS_LABELS[booking.status],
    BACKUP_SERVICE_LABELS[booking.service],
    booking.airport,
    booking.date,
    booking.flightTime,
    booking.flight,
    booking.bags,
    formatBackupMoney(booking.priceCents),
    booking.paidAt,
    booking.name,
    booking.phone,
    booking.email,
    booking.address,
    booking.driverName,
    latestSealId(booking),
    latestProofSummary(booking),
    backupNextAction(booking),
    backupTrackingUrl(booking),
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}
