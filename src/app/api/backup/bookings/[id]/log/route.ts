import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  appendBackupLog,
  type BackupLogInput,
} from "@/lib/backup-ops-server";
import {
  BACKUP_LOG_CATEGORIES,
  BACKUP_STATUS_OPTIONS,
  type BackupLogCategory,
} from "@/lib/backup-ops";
import type { BookingStatus } from "@/lib/bookings";
import { rateLimit } from "@/lib/rate-limit";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isLogCategory(value: string): value is BackupLogCategory {
  return BACKUP_LOG_CATEGORIES.some((category) => category.value === value);
}

function isBackupStatus(value: string): value is BookingStatus {
  return BACKUP_STATUS_OPTIONS.includes(value as BookingStatus);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(request, "backup:log", 60);
  if (limited) return limited;

  const session = getAdminSession(request);
  if (!session) return bad("Backup ops access is required.", 401);

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      category?: string;
      note?: string;
      status?: string;
      sealId?: string;
    };

    const category = body.category?.trim() || "note";
    if (!isLogCategory(category)) return bad("Unsupported backup log type.");

    const status = body.status?.trim();
    if (status && !isBackupStatus(status)) {
      return bad("Unsupported backup status.");
    }
    const backupStatus = status && isBackupStatus(status) ? status : undefined;

    const input: BackupLogInput = {
      category,
      note: body.note ?? "",
      sealId: body.sealId,
      status: backupStatus,
    };

    const booking = await appendBackupLog(id, input, session);
    return NextResponse.json({ ok: true, booking });
  } catch (error) {
    console.error("Backup log failed", error);
    return bad(
      error instanceof Error ? error.message : "Could not save emergency log.",
      500
    );
  }
}
