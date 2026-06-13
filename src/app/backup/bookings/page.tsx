import Link from "next/link";
import { redirect } from "next/navigation";
import BackupShell from "@/app/backup/_components/BackupShell";
import {
  BACKUP_SERVICE_LABELS,
  BACKUP_STATUS_LABELS,
  backupNextAction,
  formatBackupMoney,
  formatBackupTime,
  latestSealId,
} from "@/lib/backup-ops";
import { listBackupBookings } from "@/lib/backup-ops-server";
import { getAdminSessionFromServerHeaders } from "@/lib/server-admin-session";

export default async function BackupBookingsPage() {
  const session = await getAdminSessionFromServerHeaders();
  if (!session) redirect("/backup/login");

  const bookings = await listBackupBookings();
  const paid = bookings.filter((booking) => booking.status === "paid").length;
  const assigned = bookings.filter((booking) =>
    ["assigned", "accepted", "en_route", "arrived"].includes(booking.status)
  ).length;
  const custody = bookings.filter((booking) =>
    ["picked_up", "in_transit", "delivery_pending"].includes(booking.status)
  ).length;
  const issues = bookings.filter((booking) => booking.status === "issue").length;

  return (
    <BackupShell session={session} title="Active run sheets">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Active jobs" value={bookings.length} />
        <Metric label="Awaiting dispatch" value={paid} />
        <Metric label="Driver moving" value={assigned} />
        <Metric label="In custody" value={custody} />
        <Metric label="Issues" value={issues} />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-sm shadow-navy/5">
        <div className="flex flex-col gap-3 border-b border-navy/10 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-navy">Emergency booking list</h2>
            <p className="mt-1 text-sm text-navy/60">
              Only active, non-archived operational bookings are shown here.
            </p>
          </div>
          <Link
            href="/api/backup/export"
            className="rounded-xl bg-navy px-4 py-3 text-center text-xs font-black text-white transition hover:opacity-90"
          >
            Download active CSV
          </Link>
        </div>
        <div className="divide-y divide-navy/10">
          {bookings.length === 0 ? (
            <div className="p-8 text-sm text-navy/60">No active backup bookings.</div>
          ) : (
            bookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/backup/bookings/${booking.id}`}
                className="grid gap-4 p-5 transition hover:bg-navy/[0.025] lg:grid-cols-[1.2fr_1fr_1fr_1.4fr]"
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-coral">
                    {booking.id}
                  </p>
                  <p className="mt-1 text-lg font-black text-navy">{booking.name}</p>
                  <p className="mt-1 text-sm text-navy/60">
                    {BACKUP_SERVICE_LABELS[booking.service]} - {booking.airport}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="font-bold text-navy">{BACKUP_STATUS_LABELS[booking.status]}</p>
                  <p className="mt-1 text-navy/60">
                    {booking.date}
                    {booking.flightTime ? ` at ${booking.flightTime}` : ""}
                  </p>
                  <p className="mt-1 text-navy/60">{formatBackupMoney(booking.priceCents)}</p>
                </div>
                <div className="text-sm">
                  <p className="font-bold text-navy">
                    {booking.driverName || "No driver assigned"}
                  </p>
                  <p className="mt-1 text-navy/60">{booking.phone || booking.email}</p>
                  <p className="mt-1 text-navy/60">
                    Seal: {latestSealId(booking) || "not logged"}
                  </p>
                </div>
                <div className="text-sm text-navy/65">
                  <p className="font-bold text-navy">Next action</p>
                  <p className="mt-1 leading-6">{backupNextAction(booking)}</p>
                  <p className="mt-1 text-xs">Paid: {formatBackupTime(booking.paidAt)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </BackupShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
      <p className="text-3xl font-black text-navy">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-navy/55">
        {label}
      </p>
    </div>
  );
}
