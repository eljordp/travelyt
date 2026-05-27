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
import Footer from "@/components/Footer";

const personas = [
  {
    eyebrow: "Business traveler",
    headline: "Move at meeting speed",
    body: "We collect your bag from your office or hotel and meet you at the airport. Walk in, board, fly out.",
    href: "/quote?service=departure&persona=business",
    cta: "Book a business pickup",
  },
  {
    eyebrow: "Family trip",
    headline: "One less thing to carry",
    body: "Doorstep pickup so you can travel with kids, strollers, and gear without dragging six suitcases through the terminal.",
    href: "/quote?service=both&persona=family",
    cta: "Book a family trip",
  },
  {
    eyebrow: "Frequent flyer",
    headline: "Move through the airport lighter",
    body: "Trip handling built around less dragging, fewer bag moments, and a cleaner path from door to airline handoff.",
    href: "/quote?service=both&persona=frequent",
    cta: "Set up round-trip",
  },
];

const services = [
  {
    title: "Departure Pickup",
    text: "Door to gate, sealed and tracked.",
    href: "/quote?service=departure",
    icon: PackageCheck,
  },
  {
    title: "Arrival Delivery",
    text: "Post-flight delivery support.",
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
  { label: "Customer login", href: "/login?next=%2Fprofile", icon: MapPinned },
];

export default function WebsiteHome() {
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-navy">
      <Navbar />

      <main className="mx-auto max-w-7xl space-y-12 px-6 pb-16 pt-24">
        <section className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c41e2a]">
            Travel light, arrive smart
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] text-navy sm:text-5xl lg:text-6xl">
            We move your bags, you move freely.
          </h1>
        </section>

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
              Sealed and tracked from door to gate.
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
                className="inline-flex items-center gap-2 rounded-xl bg-[#c41e2a] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#c41e2a]"
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

        <section aria-label="First time here">
          <div className="rounded-3xl border border-navy/8 bg-white p-6 shadow-sm shadow-navy/5 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
                First time? Here&apos;s the idea.
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
                You pack the bag. We do everything in between.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-navy/65">
                Most travelers in the US have never used a baggage service before. It&apos;s simple: we collect your luggage at home, move it through the airport on your flight, and meet you at your destination. You travel without the bags.
              </p>
            </div>

            <ol className="mt-8 grid gap-5 sm:grid-cols-3">
              <li className="rounded-2xl bg-[#f6f7fb] p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#c41e2a] text-sm font-bold text-white">
                  1
                </span>
                <p className="mt-3 font-bold text-navy">Book a pickup</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Tell us your flight, your address, and when you want the bag picked up. Takes a minute.
                </p>
              </li>
              <li className="rounded-2xl bg-[#f6f7fb] p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#c41e2a] text-sm font-bold text-white">
                  2
                </span>
                <p className="mt-3 font-bold text-navy">We collect at your door</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Your bag is weighed, sealed, and photographed before it leaves. You get tracking the whole way.
                </p>
              </li>
              <li className="rounded-2xl bg-[#f6f7fb] p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#c41e2a] text-sm font-bold text-white">
                  3
                </span>
                <p className="mt-3 font-bold text-navy">You arrive lighter</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Walk through the airport hands-free. Your bag is already handled for the trip ahead.
                </p>
              </li>
            </ol>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-navy/65">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#c41e2a]" strokeWidth={2} />
                Sealed and insured
              </span>
              <span className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[#c41e2a]" strokeWidth={2} />
                Background-checked handlers
              </span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-[#c41e2a]" strokeWidth={2} />
                Photo proof at every step
              </span>
            </div>
          </div>
        </section>

        <section aria-label="Which traveler are you">
          <div className="mb-6 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              Which traveler are you
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
              Pick the trip that sounds like yours.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-navy/65 sm:text-base">
              Each one starts the same way: tell us where to pick up, where it&apos;s going, and when. We do the rest.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {personas.map((persona) => (
              <Link
                key={persona.eyebrow}
                href={persona.href}
                className="group flex h-full flex-col rounded-2xl border border-navy/8 bg-white p-6 shadow-sm shadow-navy/5 transition-transform hover:-translate-y-0.5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
                  {persona.eyebrow}
                </p>
                <p className="mt-3 text-xl font-bold leading-tight text-navy">
                  {persona.headline}
                </p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-navy/65">
                  {persona.body}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy group-hover:text-[#c41e2a]">
                  {persona.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section
          className="rounded-3xl bg-navy px-6 py-10 text-white sm:px-10 lg:px-14"
          aria-label="Where to start"
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
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
              className="inline-flex items-center gap-2 self-start rounded-xl bg-[#c41e2a] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#c41e2a]"
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
                    className="h-5 w-5 shrink-0 text-[#c41e2a]"
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

      <Footer />
    </div>
  );
}
