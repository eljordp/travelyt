import Link from "next/link";
import type { ReactNode } from "react";
import type { BackupSession } from "@/lib/backup-ops-server";

const navItems = [
  { href: "/backup/bookings", label: "Bookings" },
  { href: "/backup/export", label: "Export" },
  { href: "/backup/playbook", label: "Playbook" },
  { href: "/admin", label: "Main admin" },
];

export default function BackupShell({
  children,
  session,
  title,
  eyebrow = "Backup Ops",
}: {
  children: ReactNode;
  session: BackupSession;
  title: string;
  eyebrow?: string;
}) {
  return (
    <main className="min-h-screen bg-[#f5f6fa] px-4 py-5 text-navy sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral">
                {eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-navy">
                {title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-navy/65">
                Emergency command surface for active bookings, run sheets, manual
                logs, and fallback operations.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-navy/10 bg-navy/[0.03] px-4 py-2 text-xs font-bold text-navy transition hover:bg-navy hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-navy/55">
            <span className="rounded-full bg-navy/[0.04] px-3 py-1">
              Signed in: {session.email}
            </span>
            <span className="rounded-full bg-navy/[0.04] px-3 py-1">
              Role: {session.role}
            </span>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
