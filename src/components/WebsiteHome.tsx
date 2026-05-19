"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  ClipboardCheck,
  MapPinned,
  PackageCheck,
  PlaneLanding,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroCarousel from "@/components/HeroCarousel";
import BagStatus from "@/components/BagStatus";

const services = [
  {
    title: "Departure Pickup",
    text: "Door to airport handoff.",
    href: "/quote?service=departure",
    icon: PackageCheck,
  },
  {
    title: "Arrival Delivery",
    text: "Baggage claim to address.",
    href: "/quote?service=arrival",
    icon: PlaneLanding,
  },
  {
    title: "Round Trip",
    text: "Both sides of the trip.",
    href: "/quote?service=both",
    icon: BadgeCheck,
  },
];

const shortcuts = [
  { label: "Pricing", href: "/pricing", icon: CircleDollarSign },
  { label: "Trust", href: "/trust", icon: ShieldCheck },
  { label: "Airlines", href: "/airlines", icon: ClipboardCheck },
  { label: "Track demo", href: "/profile", icon: MapPinned },
];

export default function WebsiteHome() {
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-navy">
      <Navbar />

      <main className="mx-auto max-w-7xl space-y-12 px-6 pb-16 pt-24">
        <HeroCarousel />

        <section>
          <div className="grid gap-4 sm:grid-cols-3">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.title}
                  href={service.href}
                  className="group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm shadow-navy/5 transition-transform hover:-translate-y-0.5"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#c41e2a]/10 text-[#c41e2a]">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-navy">{service.title}</span>
                    <span className="mt-1 block text-sm text-navy/60">
                      {service.text}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-navy/35 transition-transform group-hover:translate-x-0.5 group-hover:text-[#c41e2a]" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              Live tracking
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              You&apos;ll see your bag get on the plane.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-navy/65">
              Every Travelyt booking moves through a chain of custody you can
              watch in real time — from doorstep pickup to the moment your
              airline accepts it as your checked baggage.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-navy/75">
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c41e2a]" />
                Tamper-evident seal and weight on file at pickup.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c41e2a]" />
                Live status as your bag clears the airport and boards your flight.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c41e2a]" />
                Photo proof when it&apos;s handed off to the airline and delivered.
              </li>
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/quote"
                className="inline-flex items-center gap-2 rounded-xl bg-[#c41e2a] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#e63946]"
              >
                Book your first bag <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/trust"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
              >
                See how it works
              </Link>
            </div>
          </div>

          <BagStatus
            current="checked_in"
            bookingId="TVT-001"
            route="Home → LAX"
          />
        </section>

        <section
          className="rounded-3xl bg-navy px-6 py-10 text-white sm:px-10 lg:px-14"
          aria-label="Where to start"
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff747d]">
                Where to start
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                Tell us about your trip. We&apos;ll handle the bags.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
                Pick a service, drop your dates, and we&apos;ll quote your route in seconds. No accounts needed to start.
              </p>
            </div>

            <Link
              href="/quote"
              className="inline-flex items-center gap-2 self-start rounded-xl bg-[#c41e2a] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#e63946]"
            >
              Get your quote <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Link
                  key={shortcut.label}
                  href={shortcut.href}
                  className="group flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3.5 transition-colors hover:bg-white/[0.12]"
                >
                  <Icon
                    className="h-5 w-5 shrink-0 text-[#ff747d]"
                    strokeWidth={2}
                  />
                  <span className="flex-1 text-sm font-semibold text-white">
                    {shortcut.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
