import { redirect } from "next/navigation";
import BackupLoginForm from "@/app/backup/_components/BackupLoginForm";
import { getAdminSessionFromServerHeaders } from "@/lib/server-admin-session";

export default async function BackupLoginPage() {
  const session = await getAdminSessionFromServerHeaders();
  if (session) redirect("/backup/bookings");

  return (
    <main className="min-h-screen bg-[#f5f6fa] px-4 py-10 text-navy">
      <div className="mx-auto max-w-md rounded-2xl border border-navy/10 bg-white p-6 shadow-sm shadow-navy/5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
          Backup Ops
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-navy">
          Emergency access
        </h1>
        <p className="mt-2 text-sm leading-6 text-navy/65">
          Admin or dispatcher login for live run sheets, fallback notes, and
          active booking exports.
        </p>
        <div className="mt-6">
          <BackupLoginForm />
        </div>
      </div>
    </main>
  );
}
