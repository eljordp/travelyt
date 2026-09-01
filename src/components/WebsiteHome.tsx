"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Download,
  Home,
  LockKeyhole,
  MapPin,
  PackageCheck,
  PlaneTakeoff,
  Scale,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FAQ from "@/components/FAQ";
import LeadCapture from "@/components/LeadCapture";
import { APP_STORE_URL } from "@/lib/site";

const journeyCards = [
  {
    step: "01",
    eyebrow: "At your door",
    title: "The checked-bag journey starts at home.",
    body: "A professional agent matches the trip and physical bags before custody begins.",
    image: "/journey/home-pickup-hawaii.webp",
    alt: "A family dressed for a Hawaii vacation releasing checked bags to an unbranded professional agent at their front door",
    position: "center 46%",
  },
  {
    step: "02",
    eyebrow: "Proof at pickup",
    title: "Each bag is verified, weighed and sealed.",
    body: "Condition evidence, weight and a numbered tamper-evident seal begin the per-bag record.",
    image: "/journey/verify-weigh-seal-hawaii.webp",
    alt: "A professional agent recording a suitcase and applying a numbered tamper-evident seal while the family waits at home",
    position: "center 45%",
  },
  {
    step: "03",
    eyebrow: "At the airport",
    title: "You arrive with only what you want to carry.",
    body: "The traveler follows normal passenger screening while the checked bags follow the approved custody path.",
    image: "/journey/airport-lighter-hawaii.webp",
    alt: "The same Hawaii-ready family walking through a bright airport with personal items and no checked suitcases",
    position: "center 45%",
  },
];

const proofPoints = [
  {
    icon: BadgeCheck,
    title: "Traveler + bag match",
    body: "The traveler, flight details and each physical bag are matched before release.",
  },
  {
    icon: LockKeyhole,
    title: "Per-bag custody record",
    body: "Seal, condition evidence, weight, actor, time and location stay attached to that bag.",
  },
  {
    icon: MapPin,
    title: "Recorded checkpoints",
    body: "Custody milestones show where the bag is in the process without exposing private traveler data.",
  },
  {
    icon: ShieldCheck,
    title: "No acceptance, no transfer",
    body: "A refused handoff, damaged seal or missed cutoff stops the lane and creates an exception.",
  },
];

const bagPath = [
  { icon: ScanLine, title: "Verify", text: "Traveler, trip and bags" },
  { icon: Scale, title: "Weigh + seal", text: "Evidence captured" },
  { icon: PackageCheck, title: "Secure transit", text: "Custody recorded" },
  { icon: PlaneTakeoff, title: "Airline acceptance", text: "Only where authorized" },
];

const travelerPath = [
  { icon: Home, title: "Leave later", text: "No checked bags to haul" },
  { icon: ShieldCheck, title: "Passenger screening", text: "Normal process" },
  { icon: PlaneTakeoff, title: "Go to the gate", text: "Personal items only" },
];

const COMMERCIAL_VIDEO_SRC: string | null = null;

function PathLane({
  tone,
  label,
  description,
  items,
}: {
  tone: "bag" | "traveler";
  label: string;
  description: string;
  items: Array<{
    icon: typeof Home;
    title: string;
    text: string;
  }>;
}) {
  const traveler = tone === "traveler";

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_1fr] lg:items-center">
      <div>
        <p
          className={`text-xs font-bold uppercase tracking-[0.2em] ${
            traveler ? "text-[#ff6868]" : "text-white"
          }`}
        >
          {label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-white/60">
          {description}
        </p>
      </div>
      <ol
        className={`grid gap-3 ${
          items.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"
        }`}
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <li
              key={item.title}
              className={`relative rounded-2xl border p-4 ${
                traveler
                  ? "border-[#ff6868]/30 bg-[#ff6868]/10"
                  : "border-white/12 bg-white/[0.06]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    traveler
                      ? "bg-[#ff6868] text-white"
                      : "bg-white text-navy"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs text-white/55">{item.text}</p>
                </div>
              </div>
              {index < items.length - 1 ? (
                <ArrowRight
                  aria-hidden
                  className={`absolute -right-[15px] top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full md:block ${
                    traveler
                      ? "bg-[#ff6868] text-white"
                      : "bg-white text-navy"
                  }`}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CommercialFeature() {
  if (!COMMERCIAL_VIDEO_SRC) return null;

  return (
    <section
      id="film"
      className="overflow-hidden rounded-[2rem] bg-[#f0f3f9]"
      aria-labelledby="film-title"
    >
      <div className="grid lg:grid-cols-[1.25fr_0.75fr] lg:items-stretch">
        <div className="relative aspect-video min-h-[320px] overflow-hidden bg-navy lg:aspect-auto">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/journey/airport-lighter-hawaii.webp"
              className="h-full w-full object-cover"
            >
              <source src={COMMERCIAL_VIDEO_SRC} type="video/mp4" />
            </video>
        </div>

        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
            Travel Lighter film
          </p>
          <h2 id="film-title" className="mt-3 text-3xl font-bold leading-tight text-navy sm:text-4xl">
            The bags take the custody path. You take the passenger path.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-navy/65">
            See how one pickup at home can change the whole airport day.
          </p>
          <div className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-navy shadow-sm shadow-navy/5">
            <span className="h-2 w-2 rounded-full bg-[#ff6868]" />
            The seamless journey
          </div>
        </div>
      </div>
    </section>
  );
}

export default function WebsiteHome() {
  return (
    <div className="min-h-screen bg-white text-navy">
      <Navbar />

      <main className="pb-20 pt-[72px]">
        <section className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="relative min-h-[670px] overflow-hidden rounded-[2rem] bg-navy sm:min-h-[720px]">
            <Image
              src="/journey/airport-lighter-hawaii.webp"
              alt="A Hawaii-ready family arriving at the airport with personal items and no checked suitcases"
              fill
              preload
              sizes="100vw"
              className="object-cover"
              style={{ objectPosition: "center 45%" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/10 lg:via-navy/72" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-navy/15" />

            <div className="relative flex min-h-[670px] flex-col justify-between p-6 text-white sm:min-h-[720px] sm:p-10 lg:p-14">
              <div className="max-w-3xl pt-3 sm:pt-8 lg:pt-12">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white backdrop-blur">
                  <Sparkles className="h-4 w-4 text-[#ff6868]" strokeWidth={2} />
                  Launching in select markets
                </div>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-[#ff6868]">
                  One pickup. Two paths.
                </p>
                <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                  Your checked bags leave home.
                  <span className="mt-2 block text-[#ff8b8b]">
                    You arrive lighter.
                  </span>
                </h1>
                <p className="mt-7 max-w-2xl text-base leading-relaxed text-white/78 sm:text-lg">
                  Travelyt is building a seamless checked-bag journey from your front door toward authorized airline acceptance—so your airport trip starts with only what you want to carry.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="#route-updates"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6868] px-6 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                  >
                    Join the launch <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="#journey"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/15"
                  >
                    See the journey
                  </Link>
                  <a
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white/80 transition-colors hover:text-white"
                  >
                    <Download className="h-4 w-4" strokeWidth={2} /> App Store
                  </a>
                </div>
              </div>

              <div className="grid gap-3 pt-10 sm:grid-cols-3 lg:max-w-4xl">
                {[
                  ["01", "Pickup at your door", "The bag journey starts before the airport."],
                  ["02", "Custody stays visible", "Each bag carries its own recorded path."],
                  ["03", "Screen as usual", "Passenger screening and eligibility do not change."],
                ].map(([number, title, body]) => (
                  <div
                    key={number}
                    className="rounded-2xl border border-white/12 bg-navy/55 p-4 backdrop-blur-md"
                  >
                    <p className="text-xs font-bold text-[#ff6868]">{number}</p>
                    <p className="mt-2 text-sm font-bold text-white">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="journey" className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
              The seamless experience
            </p>
            <h2 className="mt-4 text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-navy sm:text-5xl">
              The airport feels different when the checked bags are already on their way.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-navy/62 sm:text-lg">
              The experience is simple on purpose. One handoff at home separates the bag journey from the passenger journey.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {journeyCards.map((card) => (
              <article
                key={card.step}
                className="overflow-hidden rounded-3xl border border-navy/8 bg-white shadow-lg shadow-navy/[0.06]"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#eef1f6]">
                  <Image
                    src={card.image}
                    alt={card.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover transition-transform duration-700 hover:scale-[1.02]"
                    style={{ objectPosition: card.position }}
                  />
                  <span className="absolute left-4 top-4 rounded-full bg-navy px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-lg">
                    Illustrative concept
                  </span>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ff6868] text-xs font-bold text-white">
                      {card.step}
                    </span>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff6868]">
                      {card.eyebrow}
                    </p>
                  </div>
                  <h3 className="mt-5 text-2xl font-bold leading-tight text-navy">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-navy/62">
                    {card.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-navy py-20 text-white sm:py-24" aria-labelledby="two-paths-title">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
                  One trip, two paths
                </p>
                <h2 id="two-paths-title" className="mt-4 text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                  The bag path and passenger path separate at home.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
                Travelyt does not change passenger screening. It changes how much luggage the traveler has to manage before reaching it.
              </p>
            </div>

            <div className="mt-12 space-y-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7 lg:p-9">
              <PathLane
                tone="bag"
                label="Checked-bag path"
                description="A visible custody journey"
                items={bagPath}
              />
              <div className="h-px bg-white/10" />
              <PathLane
                tone="traveler"
                label="Passenger path"
                description="A lighter airport journey"
                items={travelerPath}
              />

              <div className="grid gap-4 rounded-2xl bg-white p-5 text-navy sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy text-white">
                  <PackageCheck className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff6868]">
                    Destination
                  </p>
                  <p className="mt-1 text-lg font-bold">Family + bags reunite through normal bag claim.</p>
                </div>
                <CheckCircle2 className="hidden h-7 w-7 text-[#ff6868] sm:block" strokeWidth={2} />
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-white/45">
              Proposed seamless lane. Carrier and station authorization are required before passenger-absent airline acceptance.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:py-28" aria-labelledby="proof-title">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
                Seamless, with accountability
              </p>
              <h2 id="proof-title" className="mt-4 text-4xl font-bold leading-tight tracking-[-0.03em] text-navy sm:text-5xl">
                Easy for the traveler. Visible for everyone responsible for the bag.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-navy/62">
                The experience should feel effortless without making custody invisible. The per-bag record is what holds the journey together.
              </p>
              <Link
                href="/trust"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90"
              >
                Explore custody and trust <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {proofPoints.map((point, index) => {
                const Icon = point.icon;
                return (
                  <article
                    key={point.title}
                    className={`rounded-3xl border border-navy/8 p-6 sm:p-7 ${
                      index === 3 ? "bg-[#fff1f1]" : "bg-[#f5f7fb]"
                    }`}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#ff6868] shadow-sm shadow-navy/5">
                      <Icon className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mt-5 text-xl font-bold text-navy">{point.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy/62">{point.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {COMMERCIAL_VIDEO_SRC ? (
          <div className="mx-auto max-w-7xl px-6 pb-20 sm:pb-28">
            <CommercialFeature />
          </div>
        ) : null}

        <section id="route-updates" className="bg-[#f5f7fb] py-20 sm:py-24" aria-labelledby="launch-title">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
              Launching market by market
            </p>
            <h2 id="launch-title" className="mt-4 text-4xl font-bold leading-tight tracking-[-0.03em] text-navy sm:text-5xl">
              Tell us where you want to travel lighter.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-navy/62">
              Download the app or join the route list. Every request is confirmed individually based on market availability, operating capacity and the approved handoff path.
            </p>
            <div className="mt-8">
              <LeadCapture source="homepage-seamless-launch" defaultInterest="family-trip" />
            </div>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-navy transition-colors hover:text-[#ff6868]"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Download Travelyt on the App Store
            </a>
          </div>
        </section>

        <FAQ />
      </main>

      <Footer />
    </div>
  );
}
