"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  MapPin,
  PackageCheck,
  Plane,
  ShieldCheck,
  Tag,
} from "lucide-react";
import AppChrome from "@/components/AppChrome";
import BagStatus from "@/components/BagStatus";
import HeroCarousel from "@/components/HeroCarousel";

const recentTrips = [
  {
    id: "TVT-001",
    route: "Home to LAX",
    date: "Today",
    status: "Ready",
    bags: "2 bags",
  },
  {
    id: "TVT-002",
    route: "JFK to hotel",
    date: "Mar 22",
    status: "Delivered",
    bags: "3 bags",
  },
];

export default function AppHome() {
  return (
    <AppChrome title="Travel light">
      <div className="space-y-5">
        <HeroCarousel />

        <Link
          href="/quote?promo=TRAVELYT30"
          className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-[#ff6868] to-[#ff6868] p-5 text-white shadow-lg shadow-[#ff6868]/20"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Tag className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/85">
              Launch offer · 1 hour left
            </p>
            <p className="mt-0.5 text-base font-bold leading-tight">
              30% off your first booking
            </p>
            <span className="mt-2 inline-flex max-w-full rounded-full bg-white/15 px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide text-white">
              Code TRAVELYT30
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-white/90" />
        </Link>

        <BagStatus
          current="checked_in"
          bookingId="TVT-001"
          route="Home → LAX"
          compact
        />

        <section className="grid grid-cols-2 gap-3">
          <Link
            href="/quote?service=departure"
            className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5"
          >
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff6868]/10 text-[#ff6868]">
              <PackageCheck className="h-5 w-5" strokeWidth={2} />
            </span>
            <p className="font-bold text-navy">Book pickup</p>
            <p className="mt-1 text-xs leading-relaxed text-navy/60">
              Door to gate.
            </p>
          </Link>

          <Link
            href="/quote?service=arrival"
            className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5"
          >
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-navy/10 text-navy">
              <Plane className="h-5 w-5" strokeWidth={2} />
            </span>
            <p className="font-bold text-navy">Arrival drop</p>
            <p className="mt-1 text-xs leading-relaxed text-navy/60">
              Arrive empty handed.
            </p>
          </Link>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy">Trip activity</h2>
            <Link
              href="/profile"
              className="flex items-center gap-1 text-xs font-semibold text-[#ff6868]"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {recentTrips.map((trip) => (
              <Link
                key={trip.id}
                href="/profile"
                className="flex items-center gap-3 rounded-xl border border-navy/10 p-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f6f7fb] text-navy">
                  <CalendarDays className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy">
                    {trip.route}
                  </span>
                  <span className="mt-0.5 block text-xs text-navy/55">
                    {trip.date} · {trip.bags}
                  </span>
                </span>
                <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy/70">
                  {trip.status}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          {[
            { label: "Insured", icon: ShieldCheck },
            { label: "Sealed + tracked", icon: MapPin },
            { label: "Courier", icon: CarFront },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-2xl bg-white p-3 text-center shadow-sm shadow-navy/5"
              >
                <Icon className="mx-auto h-5 w-5 text-[#ff6868]" strokeWidth={2} />
                <p className="mt-2 text-xs font-semibold text-navy/70">
                  {item.label}
                </p>
              </div>
            );
          })}
        </section>
      </div>
    </AppChrome>
  );
}
