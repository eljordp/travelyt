"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  MapPinned,
  PackageCheck,
  PlaneLanding,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroCarousel from "@/components/HeroCarousel";
import BagStatus from "@/components/BagStatus";
import Footer from "@/components/Footer";
import LeadCapture from "@/components/LeadCapture";
import { APP_STORE_URL } from "@/lib/site";

const personas = [
  {
    eyebrow: "Business traveler",
    headline: "Move at meeting speed",
    body: "We collect your bag from your office or hotel and meet you in the public ticketing area. You verify the seal and complete airline check-in.",
    href: "/quote?service=departure&persona=business",
    cta: "Book a business pickup",
  },
  {
    eyebrow: "Family trip",
    headline: "One less thing to carry",
    body: "Doorstep pickup so you can travel with kids, strollers, and gear without dragging six suitcases through the terminal.",
    href: "/quote?service=departure&persona=family",
    cta: "Book a family trip",
  },
  {
    eyebrow: "Frequent flyer",
    headline: "Move through the airport lighter",
    body: "Trip handling built around less dragging, fewer bag moments, and a documented path from door to traveler handoff at the terminal.",
    href: "/quote?service=departure&persona=frequent",
    cta: "Book a departure pickup",
  },
];

const services = [
  {
    title: "Departure Pickup",
    text: "Door to public ticketing handoff, sealed and tracked.",
    href: "/quote?service=departure",
    icon: PackageCheck,
  },
  {
    title: "Arrival Delivery",
    text: "Post-flight delivery support.",
    href: "/quote?service=arrival",
    icon: PlaneLanding,
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ff6868]">
            Travel light, arrive smart
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] text-navy sm:text-5xl lg:text-6xl">
            We move your bags, you move freely.
          </h1>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Download on App Store
            </a>
            <Link
              href="/quote"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
            >
              Start online <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
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
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ff6868]/10 text-[#ff6868]">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-navy">{service.title}</span>
                    <span className="mt-1 block text-sm text-navy/60">
                      {service.text}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-navy/35 transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff6868]" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
              Custody checkpoints
            </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Sealed and tracked from door to verified handoff.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-navy/65">
              Every Travelyt booking moves through a documented chain of custody,
              from doorstep pickup to verified traveler handoff at the terminal. An
              authorized carrier handoff is used only where that carrier and station
              approve it. Traveler-facing live GPS remains subject to launch testing.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-navy/75">
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6868]" />
                Tamper-evident seal and weight on file at pickup.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6868]" />
                Status and location recorded at custody milestones.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6868]" />
                Photo proof at traveler handoff or authorized carrier acceptance.
              </li>
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/quote"
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#ff6868]"
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
            current="traveler_handoff"
            bookingId="TVT-001"
            route="Home → LAX"
          />
        </section>

        <section aria-label="First time here">
          <div className="rounded-3xl border border-navy/8 bg-white p-6 shadow-sm shadow-navy/5 sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
                First time? Here&apos;s the idea.
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
                You pack the bag. We document every custody step.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-navy/65">
                Standard departure service collects, weighs, seals, photographs, and tracks your luggage from home to an identity-matched return in the airport&apos;s public ticketing area. A named airline or authorized handler may receive it only under that carrier&apos;s approved station process.
              </p>
            </div>

            <ol className="mt-8 grid gap-5 sm:grid-cols-3">
              <li className="rounded-2xl bg-[#f6f7fb] p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#ff6868] text-sm font-bold text-white">
                  1
                </span>
                <p className="mt-3 font-bold text-navy">Book a pickup</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Tell us your flight, your address, and when you want the bag picked up. Takes a minute.
                </p>
              </li>
              <li className="rounded-2xl bg-[#f6f7fb] p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#ff6868] text-sm font-bold text-white">
                  2
                </span>
                <p className="mt-3 font-bold text-navy">We collect at your door</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Your bag is weighed, sealed, and photographed before it leaves. You get tracking the whole way.
                </p>
              </li>
              <li className="rounded-2xl bg-[#f6f7fb] p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#ff6868] text-sm font-bold text-white">
                  3
                </span>
                <p className="mt-3 font-bold text-navy">You arrive lighter</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Meet the courier at the public ticketing area, verify the seal, and complete airline check-in. Travelyt never performs screening.
                </p>
              </li>
            </ol>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-navy/65">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
                Sealed; coverage required before launch
              </span>
              <span className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
                Background-checked handlers
              </span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
                Photo proof at every step
              </span>
            </div>
          </div>
        </section>

        <section aria-label="Which traveler are you">
          <div className="mb-6 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
              Which traveler are you
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
              Pick the trip that sounds like yours.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-navy/65 sm:text-base">
            Each one starts the same way: tell us where to pick up, where it&apos;s going, and when. We manage the documented custody leg; you complete airline check-in.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {personas.map((persona) => (
              <Link
                key={persona.eyebrow}
                href={persona.href}
                className="group flex h-full flex-col rounded-2xl border border-navy/8 bg-white p-6 shadow-sm shadow-navy/5 transition-transform hover:-translate-y-0.5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
                  {persona.eyebrow}
                </p>
                <p className="mt-3 text-xl font-bold leading-tight text-navy">
                  {persona.headline}
                </p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-navy/65">
                  {persona.body}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy group-hover:text-[#ff6868]">
                  {persona.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section
          id="route-updates"
          className="py-4"
          aria-label="Route updates"
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              Planning a trip soon?
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
              Get availability for your route.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-navy/65 sm:text-base">
              Drop your email and what kind of trip you are planning. We will
              use it to prioritize airport coverage, family routes, and business
              travel windows for supported launch markets.
            </p>
          </div>
          <div className="mt-7">
            <LeadCapture
              source="homepage-route-updates"
              defaultInterest="early-customer"
            />
          </div>
        </section>

        <section
          className="rounded-3xl bg-navy px-6 py-10 text-white sm:px-10 lg:px-14"
          aria-label="Where to start"
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6868]">
                Where to start
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
                Download the app or start with a quote.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
                Travelyt is live on the App Store. Pick a service, drop your dates, and we&apos;ll quote your route in seconds.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-navy transition-colors hover:bg-white/90"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                App Store
              </a>
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#ff6868]"
              >
                Get your quote <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
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
                    className="h-5 w-5 shrink-0 text-[#ff6868]"
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
