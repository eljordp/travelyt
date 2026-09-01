import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  CircleAlert,
  ClipboardCheck,
  LockKeyhole,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Airline Baggage Preparation",
  description:
    "How Travelyt prepares each checked bag around the traveler’s exact itinerary while leaving airline acceptance, tagging, screening, and loading under carrier control.",
  alternates: {
    canonical: "/airlines/baggage",
  },
  openGraph: {
    title: "Airline Baggage Preparation | Travelyt",
    description:
      "Verify, weigh, seal, record, and tender only through an authorized carrier receiving process.",
    url: "/airlines/baggage",
  },
};

const checks = [
  {
    title: "Exact itinerary",
    body: "The traveler, flight details, bag count, timing, and current carrier rules are reviewed for the specific trip—not assumed from a generic airline list.",
    icon: ClipboardCheck,
  },
  {
    title: "Weight + dimensions",
    body: "Each physical bag is weighed and checked against the applicable allowance before it enters custody. Oversized or unusual items move to manual review.",
    icon: Scale,
  },
  {
    title: "Seal + condition proof",
    body: "A numbered tamper-evident seal and condition evidence begin the per-bag custody record before transport starts.",
    icon: LockKeyhole,
  },
  {
    title: "Authorized receiving gate",
    body: "Passenger-absent tender stays locked until the carrier and station approve the receiving role, location, timing, tagging, screening, and exception procedure.",
    icon: BadgeCheck,
  },
];

const gates = [
  { icon: ShieldCheck, label: "Carrier + station authorization" },
  { icon: BadgeCheck, label: "Named receiving role and location" },
  { icon: ClipboardCheck, label: "Tagging, screening, and exception procedure" },
  { icon: CircleAlert, label: "Missing gate means no transfer" },
];

export default function AirlineBaggagePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main>
        <section className="bg-gradient-to-b from-[#f5f0ee] to-white pb-16 pt-28">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
              Bag preparation
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight text-navy md:text-6xl">
              Prepared for the flight. Accepted only through an authorized lane.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-navy/70">
              Travelyt is building a per-bag preparation and custody process around
              the traveler&apos;s exact itinerary. The airline still controls bag
              tags, acceptance, screening, and loading.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/#route-updates"
                className="rounded-full bg-[#ff6868] px-8 py-4 font-bold text-white transition-opacity hover:opacity-90"
              >
                Join the Launch
              </Link>
              <Link
                href="/trust"
                className="rounded-full border border-navy/10 bg-white px-8 py-4 font-bold text-navy transition-shadow hover:shadow-lg"
              >
                Review Custody Controls
              </Link>
            </div>
            <p className="mx-auto mt-7 max-w-2xl text-sm leading-relaxed text-navy/50">
              Travelyt is independent. No airline relationship, station approval,
              or live passenger-absent acceptance lane is implied unless Travelyt
              identifies it explicitly for the confirmed route.
            </p>
          </div>
        </section>

        <section className="pb-20 pt-10">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-5 md:grid-cols-2">
              {checks.map((check) => {
                const Icon = check.icon;
                return (
                  <article
                    key={check.title}
                    className="rounded-3xl border border-navy/10 bg-white p-7 shadow-sm shadow-navy/5"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff6868]/10 text-[#ff6868]">
                      <Icon className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h2 className="mt-5 text-xl font-bold text-navy">
                      {check.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-navy/70">
                      {check.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-navy py-20 text-white">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
                The handoff boundary
              </p>
              <h2 className="mt-4 text-3xl font-bold md:text-4xl">
                Requested does not mean released for custody.
              </h2>
              <p className="mt-5 leading-relaxed text-white/70">
                A service request can record the trip and prepare the operating
                plan. It cannot create carrier authority. If the named receiving
                party, location, cutoff, or procedure is missing, Travelyt does
                not complete a passenger-absent airline transfer.
              </p>
            </div>
            <div className="space-y-3">
              {gates.map((gate) => {
                const Icon = gate.icon;
                return (
                  <div
                    key={gate.label}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-[#ff6868]" />
                    <span className="text-sm font-semibold text-white/85">
                      {gate.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
