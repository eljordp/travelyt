"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CarFront,
  CircleUserRound,
  Home,
  PlusCircle,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/quote", label: "Book", icon: PlusCircle },
  { href: "/profile", label: "Trips", icon: BriefcaseBusiness },
  { href: "/driver", label: "Driver", icon: CarFront },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppChrome({
  children,
  title,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[#f6f7fb] text-navy">
      <header className="sticky top-0 z-40 border-b border-navy/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <Link href="/" className="flex items-center gap-2" aria-label="Travelyt home">
            <Image
              src="/logo.png"
              alt="Travelyt"
              width={120}
              height={42}
              className="h-8 w-auto"
              priority
            />
          </Link>
          <div className="min-w-0 flex-1 px-3 text-center">
            {title ? (
              <p className="truncate text-sm font-semibold text-navy/80">
                {title}
              </p>
            ) : null}
          </div>
          {action ?? (
            <Link
              href="/profile"
              aria-label="Account"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/5 text-navy"
            >
              <CircleUserRound className="h-5 w-5" strokeWidth={1.8} />
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-5">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-navy/10 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_rgba(10,31,92,0.08)] backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4 px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#ff6b6b]/10 text-[#ff6b6b]"
                    : "text-navy/55 hover:bg-navy/5 hover:text-navy"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
