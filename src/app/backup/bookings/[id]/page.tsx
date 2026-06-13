import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BackupShell from "@/app/backup/_components/BackupShell";
import CopyValue from "@/app/backup/_components/CopyValue";
import EmergencyLogForm from "@/app/backup/_components/EmergencyLogForm";
import {
  BACKUP_SERVICE_LABELS,
  BACKUP_STATUS_LABELS,
  backupNextAction,
  backupTrackingUrl,
  formatBackupMoney,
  formatBackupTime,
  latestProofSummary,
  latestSealId,
} from "@/lib/backup-ops";
import { getBackupBooking } from "@/lib/backup-ops-server";
import { getAdminSessionFromServerHeaders } from "@/lib/server-admin-session";

export default async function BackupBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSessionFromServerHeaders();
  if (!session) redirect("/backup/login");

  const { id } = await params;
  const booking = await getBackupBooking(id);
  if (!booking) notFound();

  const trackingUrl = backupTrackingUrl(booking);
  const telUrl = booking.phone ? `tel:${booking.phone}` : "";
  const mailUrl = `mailto:${booking.email}`;

  return (
    <BackupShell session={session} title={`Run sheet ${booking.id}`}>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-coral">
                  {BACKUP_STATUS_LABELS[booking.status]}
                </p>
                <h2 className="mt-1 text-3xl font-black text-navy">{booking.name}</h2>
                <p className="mt-2 text-sm leading-6 text-navy/65">
                  {backupNextAction(booking)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyValue label="Copy tracking" value={trackingUrl} />
                <CopyValue label="Copy phone" value={booking.phone || ""} />
                <CopyValue label="Copy email" value={booking.email} />
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Field label="Service" value={BACKUP_SERVICE_LABELS[booking.service]} />
              <Field label="Airport" value={booking.airport} />
              <Field label="Flight" value={booking.flight || "Not recorded"} />
              <Field label="Travel date" value={booking.date} />
              <Field label="Flight time" value={booking.flightTime || "Not recorded"} />
              <Field label="Bags" value={`${booking.bags}`} />
              <Field label="Estimate" value={formatBackupMoney(booking.priceCents)} />
              <Field label="Paid" value={formatBackupTime(booking.paidAt)} />
              <Field label="Driver" value={booking.driverName || "Not assigned"} />
            </div>
          </div>

          <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
            <h2 className="text-lg font-black text-navy">Contacts and route</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Customer phone" value={booking.phone || "Not recorded"} href={telUrl} />
              <Field label="Customer email" value={booking.email} href={mailUrl} />
              <Field label="Pickup / delivery address" value={booking.address} wide />
              <Field label="Customer tracking" value={trackingUrl} href={trackingUrl} wide />
            </div>
            {booking.notes && (
              <div className="mt-4 rounded-xl bg-navy/[0.03] p-4 text-sm leading-6 text-navy/70">
                <p className="font-bold text-navy">Booking notes</p>
                <p className="mt-1">{booking.notes}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
            <h2 className="text-lg font-black text-navy">Proof and custody checklist</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ChecklistItem label="Payment verified" done={Boolean(booking.paidAt)} />
              <ChecklistItem label="Driver assigned" done={Boolean(booking.driverName)} />
              <ChecklistItem label="Customer ID/manual review" done={Boolean(booking.customerIdentityVerifiedAt)} />
              <ChecklistItem label="Driver ID/manual review" done={Boolean(booking.driverIdentityVerifiedAt)} />
              <ChecklistItem label="Restricted items attested" done={Boolean(booking.restrictedItemsAttestedAt)} />
              <ChecklistItem label="Seal ID logged" done={Boolean(latestSealId(booking))} />
              <ChecklistItem label="Proof on file" done={booking.proofs.length > 0} />
              <ChecklistItem label="GPS/location trail" done={(booking.locationEvents?.length ?? 0) > 0} />
            </div>
            <div className="mt-4 rounded-xl bg-navy/[0.03] p-4 text-sm text-navy/70">
              <p>
                Seal: <span className="font-bold text-navy">{latestSealId(booking) || "not logged"}</span>
              </p>
              <p className="mt-1">Latest proof: {latestProofSummary(booking)}</p>
            </div>
          </div>

          <EmergencyLogForm bookingId={booking.id} />
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm leading-6 text-yellow-950">
            <h2 className="text-lg font-black">Emergency rules</h2>
            <p className="mt-2">
              Do not use fallback notes to hide uncertainty. Record who said what,
              when they said it, and what proof was actually received.
            </p>
            <Link
              href="/backup/playbook"
              className="mt-4 inline-flex rounded-xl bg-yellow-900 px-4 py-2 text-xs font-black text-white"
            >
              Open failure playbook
            </Link>
          </div>

          <div className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
            <h2 className="text-lg font-black text-navy">Audit trail</h2>
            <div className="mt-4 space-y-3">
              {booking.statusHistory?.length ? (
                [...booking.statusHistory].reverse().slice(0, 14).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-navy/10 p-3 text-xs leading-5">
                    <p className="font-black text-navy">
                      {entry.actorName || entry.actorRole}
                    </p>
                    <p className="text-navy/60">{formatBackupTime(entry.timestamp)}</p>
                    {entry.reason && <p className="mt-1 text-navy/75">{entry.reason}</p>}
                  </div>
                ))
              ) : (
                <p className="text-sm text-navy/60">No audit entries yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </BackupShell>
  );
}

function Field({
  label,
  value,
  href,
  wide = false,
}: {
  label: string;
  value: string;
  href?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="text-xs font-bold uppercase tracking-wider text-navy/50">{label}</p>
      {href ? (
        <a className="mt-1 block break-words text-sm font-bold text-coral underline-offset-4 hover:underline" href={href}>
          {value}
        </a>
      ) : (
        <p className="mt-1 break-words text-sm font-bold text-navy">{value}</p>
      )}
    </div>
  );
}

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div
      className={
        done
          ? "rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-bold text-green-800"
          : "rounded-xl border border-navy/10 bg-navy/[0.02] px-4 py-3 text-sm font-bold text-navy/60"
      }
    >
      {done ? "Ready: " : "Missing: "}
      {label}
    </div>
  );
}
