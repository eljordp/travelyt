import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardCheck,
  LockKeyhole,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LeadCapture from "@/components/LeadCapture";

export const metadata: Metadata = {
  title: "Embassy and Consular Luggage Coordination",
  description:
    "Travelyt coordinates sealed, trackable luggage pickup and airport handoff for embassy, consular, diplomatic, and official travel teams.",
};

const useCases = [
  {
    title: "Official delegations",
    body: "Coordinate multiple bags, travelers, pickup windows, and airport handoffs through one operating plan.",
    icon: Building2,
  },
  {
    title: "Consular pickup",
    body: "Arrange pickup from a residence, office, hotel, or consular location with a clear chain-of-custody log.",
    icon: MapPinned,
  },
  {
    title: "Sensitive handling",
    body: "Use named handlers, tamper-evident seals, proof photos, and documented transfer checkpoints.",
    icon: ShieldCheck,
  },
];

const process = [
  "Share trip dates, airports, bag counts, and pickup sites.",
  "Travelyt confirms handling rules, windows, and point-of-contact details.",
  "A vetted courier seals, photographs, and logs each bag at pickup.",
  "Your team follows status and proof updates through a secure tracking link.",
];

export default function EmbassyPage() {
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-navy">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-16 pt-28">
        <section className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              Embassy and consular travel
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.04] text-navy sm:text-5xl lg:text-6xl">
              Coordinated luggage handling for official travel.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-navy/65 sm:text-lg">
              Travelyt helps diplomatic, consular, and official travel teams
              move baggage through pickup, sealing, airport handoff, and proof
              of custody without asking travelers to manage every bag in person.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/quote?service=both&persona=embassy"
                className="inline-flex items-center gap-2 rounded-xl bg-[#c41e2a] px-5 py-3 text-sm font-bold text-white hover:bg-[#a91823]"
              >
                Request coordination <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/trust"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-navy shadow-sm shadow-navy/5 hover:bg-navy/5"
              >
                Review custody model
              </Link>
            </div>
          </div>

          <div className="rounded-2xl bg-navy p-6 text-white shadow-xl shadow-navy/10 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-[#ff7a85]">
                <LockKeyhole className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                  Pilot program
                </p>
                <p className="font-bold">Structured handling, clear records.</p>
              </div>
            </div>
            <div className="mt-7 grid gap-3">
              {[
                "Named point of contact for each movement",
                "Seal IDs and timestamped proof photos",
                "Secure tracking link for authorized contacts",
                "Bulk handling for teams and family groups",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl bg-white/[0.06] p-4">
                  <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#ff7a85]" strokeWidth={1.8} />
                  <span className="text-sm leading-relaxed text-white/82">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-3">
          {useCases.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl bg-white p-6 shadow-sm shadow-navy/5">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#c41e2a]/10 text-[#c41e2a]">
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <h2 className="mt-5 text-xl font-bold text-navy">{item.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-navy/65">{item.body}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-14 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              How the pilot works
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
              A documented chain of custody from pickup to handoff.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-navy/65 sm:text-base">
              The first embassy/consular pilot should stay intentionally
              controlled: fewer routes, named contacts, and a confirmed service
              window before bags move.
            </p>
          </div>

          <ol className="space-y-3">
            {process.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#c41e2a] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-navy/70">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
              Start a diplomatic pilot
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
              Tell us who is traveling and where the bags need to move.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-navy/65 sm:text-base">
              We will follow up to confirm airports, pickup sites, handling
              requirements, and whether the route fits the current pilot.
            </p>
          </div>
          <div className="mt-7">
            <LeadCapture
              source="embassy-page"
              defaultInterest="embassy-consular"
            />
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-navy/55">
            For urgent or sensitive movements, include timing and contact
            details in the follow-up conversation before sending itinerary
            specifics.
          </p>
        </section>

        <section className="mt-14 rounded-2xl bg-white p-6 shadow-sm shadow-navy/5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy/5 text-navy">
                <ClipboardCheck className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-navy">Need consumer service instead?</h2>
                <p className="mt-1 text-sm leading-relaxed text-navy/65">
                  Families, executives, and frequent travelers can start with
                  the regular quote request.
                </p>
              </div>
            </div>
            <Link
              href="/quote"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white hover:bg-navy/90"
            >
              Get a quote <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
