import Link from "next/link";
import { redirect } from "next/navigation";
import BackupShell from "@/app/backup/_components/BackupShell";
import { listBackupBookings } from "@/lib/backup-ops-server";
import { getAdminSessionFromServerHeaders } from "@/lib/server-admin-session";

export default async function BackupExportPage() {
  const session = await getAdminSessionFromServerHeaders();
  if (!session) redirect("/backup/login");

  const bookings = await listBackupBookings();

  return (
    <BackupShell session={session} title="Emergency export">
      <section className="rounded-2xl border border-navy/10 bg-white p-6 shadow-sm shadow-navy/5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
          Active booking snapshot
        </p>
        <h2 className="mt-2 text-2xl font-black text-navy">
          {bookings.length} active booking{bookings.length === 1 ? "" : "s"} ready for export
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-navy/65">
          Download this if the main admin app, driver portal, or customer
          tracking flow starts failing. It gives ops a phone/text run sheet
          outside the normal UI.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/api/backup/export"
            className="rounded-xl bg-navy px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
          >
            Download active CSV
          </Link>
          <Link
            href="/backup/bookings"
            className="rounded-xl border border-navy/10 bg-white px-5 py-3 text-sm font-black text-navy transition hover:border-coral hover:text-coral"
          >
            Back to run sheets
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-sm leading-6 text-yellow-950">
        <h2 className="text-lg font-black">Export rule</h2>
        <p className="mt-2">
          During live operations, export before and after major fallback updates.
          If the database becomes unavailable, use the latest export and a local
          shared note until systems are restored.
        </p>
      </section>
    </BackupShell>
  );
}
