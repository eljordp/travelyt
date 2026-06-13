import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { backupCsv, listBackupBookings } from "@/lib/backup-ops-server";
import { rateLimit } from "@/lib/rate-limit";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "backup:export", 30);
  if (limited) return limited;

  const session = getAdminSession(request);
  if (!session) return bad("Backup ops access is required.", 401);

  try {
    const csv = backupCsv(await listBackupBookings());
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="travelyt-backup-active-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Backup export failed", error);
    return bad("Could not export active backup bookings.", 500);
  }
}
