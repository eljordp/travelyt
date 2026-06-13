import { redirect } from "next/navigation";
import BackupShell from "@/app/backup/_components/BackupShell";
import { FAILURE_PLAYBOOKS } from "@/lib/backup-ops";
import { getAdminSessionFromServerHeaders } from "@/lib/server-admin-session";

export default async function BackupPlaybookPage() {
  const session = await getAdminSessionFromServerHeaders();
  if (!session) redirect("/backup/login");

  return (
    <BackupShell session={session} title="Failure playbook">
      <section className="grid gap-4 lg:grid-cols-2">
        {FAILURE_PLAYBOOKS.map((playbook) => (
          <article
            key={playbook.title}
            className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
              Owner: {playbook.owner}
            </p>
            <h2 className="mt-2 text-xl font-black text-navy">{playbook.title}</h2>
            <div className="mt-4 rounded-xl bg-navy/[0.03] p-4 text-sm leading-6 text-navy/75">
              <span className="font-black text-navy">First check: </span>
              {playbook.firstCheck}
            </div>
            <ol className="mt-4 space-y-2 text-sm leading-6 text-navy/70">
              {playbook.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-black text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </section>
    </BackupShell>
  );
}
