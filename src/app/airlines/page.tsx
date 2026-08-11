import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Home,
  LockKeyhole,
  MapPin,
  PlaneTakeoff,
  ScanLine,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Airlines — Baggage as a Service",
  description:
    "Travelyt partners with airlines to move baggage off-airport under documented chain of custody — fewer counter queues, a premium ancillary product, and acceptance that stays fully under airline control.",
  alternates: {
    canonical: "/airlines",
  },
  openGraph: {
    title: "For Airlines | Travelyt",
    description:
      "Off-airport baggage under documented custody. Your check-in rules, your acceptance, your screening — our drivers, seals, and ledger.",
    url: "/airlines",
  },
};

const heroCallouts = [
  {
    title: "Fewer counter queues",
    desc: "Bags collected off-airport arrive prepped and documented, easing peak-hour pressure at check-in.",
    icon: <Users className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "Documented custody",
    desc: "Every handoff is a logged event: verified ID, seal, weight, photo — a documented, append-only record.",
    icon: <ClipboardCheck className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "A premium ancillary",
    desc: "Door-to-carrier baggage custody can become a paid passenger product only under your approved station process — without touching your fare structure.",
    icon: <TrendingUp className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "Passengers arrive lighter",
    desc: "Hands-free travelers move faster through your terminal and start their trip with your brand.",
    icon: <PlaneTakeoff className="w-6 h-6" strokeWidth={1.5} />,
  },
];

const stages = [
  {
    n: "1",
    title: "Off-airport collection",
    desc: "An ID-verified Travelyt agent collects the bag at the passenger's door. The bag is weighed, photographed, and sealed with a numbered tamper-evident seal — condition and weight on file before it moves.",
    icon: <Home className="w-7 h-7" strokeWidth={1.5} />,
  },
  {
    n: "2",
    title: "Documented custody",
    desc: "In transit, the bag is bound to a per-bag badge identity. Scan events, seal checks, and photos write to a documented, append-only custody log — who touched the bag, where, and when, with no untracked gap.",
    icon: <MapPin className="w-7 h-7" strokeWidth={1.5} />,
  },
  {
    n: "3",
    title: "Carrier-controlled acceptance",
    desc: "The bag is delivered to your designated handoff point with its full custody record. Your team accepts it under your rules — screening, acceptance, and loading remain exactly where they belong: with you.",
    icon: <BadgeCheck className="w-7 h-7" strokeWidth={1.5} />,
  },
];

const opsChecklist = [
  {
    title: "Tamper-evident seals + photo record",
    desc: "Numbered seals applied at the door, verified at handoff. Condition photos at every custody event.",
    icon: <LockKeyhole className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "Timestamped custody checkpoints",
    desc: "Route start, pickup, transit, and handoff each produce a timestamped custody event; live GPS tracking layers in as the service scales.",
    icon: <MapPin className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "Append-only chain-of-custody log",
    desc: "A complete digital audit trail per bag, available to your operations and security teams for every pilot movement.",
    icon: <ClipboardCheck className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "ID-verified, vetted agents",
    desc: "Every agent is identity-verified, background-checked, and trained on sealing and custody procedure.",
    icon: <UserCheck className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "Insured transport",
    desc: "Bags move under insurance coverage bound before any live custody, operating within TSA and airport-authority rules.",
    icon: <ShieldCheck className="w-6 h-6" strokeWidth={1.5} />,
  },
  {
    title: "Integration-light pilot",
    desc: "Pilots run on manifests and status updates — no re-architecture of your systems required to start. Deeper integration only when a pilot earns it.",
    icon: <Workflow className="w-6 h-6" strokeWidth={1.5} />,
  },
];

const pillars = [
  {
    label: "Commercial",
    title: "A baggage product worth selling",
    desc: "An airline-approved baggage custody service can create an ancillary line and a loyalty story without discounting a single fare.",
  },
  {
    label: "Operations",
    title: "Pressure off the peak",
    desc: "Every bag that arrives documented and prepped is queue time your counters get back. Off-airport collection moves work out of your terminal's busiest hour.",
  },
  {
    label: "Customer experience",
    title: "Your brand, hands-free",
    desc: "The passenger's trip starts calm at their front door and stays that way through your terminal. The experience carries your service standard, not ours.",
  },
  {
    label: "Security & compliance",
    title: "Proof before acceptance",
    desc: "The custody ledger exists to answer the exact question regulators and your security team ask: who touched this bag, when, and can you prove it.",
  },
];

export default function AirlinesPartnerPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">
            For Airlines
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Baggage as a growth line, not a cost center.
          </h1>
          <p className="text-navy/70 max-w-2xl mx-auto text-lg">
            Travelyt moves baggage off-airport under documented chain of custody
            — easing your counters, adding a premium ancillary product, and
            leaving acceptance, screening, and loading fully under your control.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <a
              href="mailto:info@travelyt.us?subject=Pilot%20briefing%20request"
              className="inline-flex items-center justify-center gap-2 bg-[#ff6868] text-white px-8 py-4 rounded-full font-bold hover:opacity-90 transition-opacity"
            >
              Request a pilot briefing
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </a>
            <a
              href="#custody"
              className="inline-flex items-center justify-center gap-2 bg-white border border-navy/10 text-navy px-8 py-4 rounded-full font-bold hover:shadow-lg hover:shadow-navy/5 transition-all"
            >
              See how custody works
            </a>
          </div>
          <p className="text-navy/50 max-w-2xl mx-auto text-sm mt-8">
            Travelyt is an independent baggage logistics service, currently
            operating supervised pilot routes. We are not affiliated with,
            endorsed by, or partnered with any airline unless explicitly stated.
          </p>
        </div>
      </section>

      {/* Benefit callouts */}
      <section className="py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {heroCallouts.map((c) => (
              <div
                key={c.title}
                className="border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-navy/5 transition-all"
              >
                <div className="text-[#ff6868] mb-3">{c.icon}</div>
                <h3 className="font-bold text-navy mb-1">{c.title}</h3>
                <p className="text-sm text-navy/70 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3-stage BaaS flow */}
      <section id="custody" className="py-20 bg-[#f5f0ee] scroll-mt-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">
              Baggage as a Service
            </span>
            <h2 className="text-3xl font-bold text-navy mt-3">
              Three stages. One unbroken record.
            </h2>
            <p className="text-navy/70 max-w-2xl mx-auto mt-4">
              The product underneath the service is a chain-of-custody ledger:
              every time a bag changes hands, it becomes a verifiable event tied
              to one bag, one ID-verified person, one time and place.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stages.map((s) => (
              <div key={s.n} className="bg-white rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-full bg-[#ff6868] text-white flex items-center justify-center font-bold text-sm">
                    {s.n}
                  </span>
                  <span className="text-[#ff6868]">{s.icon}</span>
                </div>
                <h3 className="font-bold text-navy mb-2">{s.title}</h3>
                <p className="text-sm text-navy/70 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Check-in stays yours */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-navy rounded-3xl p-8 md:p-12 text-white">
            <div className="max-w-3xl">
              <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">
                The part that matters to your security team
              </span>
              <h2 className="text-3xl font-bold mt-3 mb-6">
                Check-in stays yours. Provably.
              </h2>
              <div className="space-y-4 text-white/80 leading-relaxed">
                <p>
                  Travelyt does not bypass passenger check-in, TSA screening, or
                  airline acceptance — and is not trying to. The workflow is
                  initiated by Travelyt under a process the airline approves;
                  the airline&apos;s own system issues the bag tags; and those
                  tags remain inactive until the bag is accepted by the
                  airline&apos;s authorized representative.
                </p>
                <p>
                  What Travelyt adds is the piece the off-airport model has
                  always been missing: verifiable proof that between the
                  passenger&apos;s door and your acceptance point, the bag
                  stayed bound to a verified traveler under documented custody,
                  with no untracked gap.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                {[
                  { k: "Your system", v: "issues every bag tag" },
                  { k: "Your team", v: "accepts every bag" },
                  { k: "Your rules", v: "govern screening & loading" },
                ].map((item) => (
                  <div
                    key={item.k}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4"
                  >
                    <div className="font-bold text-[#ff6868]">{item.k}</div>
                    <div className="text-sm text-white/70">{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Built for airline operations */}
      <section className="py-20 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">
            Built for airline operations
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {opsChecklist.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 flex gap-4">
                <div className="text-[#ff6868] shrink-0 mt-1">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-navy mb-2">{f.title}</h3>
                  <p className="text-sm text-navy/70 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value pillars */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">
            Value across every function
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pillars.map((p) => (
              <div
                key={p.label}
                className="border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-navy/5 transition-all"
              >
                <span className="text-xs font-semibold text-[#ff6868] uppercase tracking-wider">
                  {p.label}
                </span>
                <h3 className="font-bold text-navy mt-2 mb-2">{p.title}</h3>
                <p className="text-sm text-navy/70 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot anchor */}
      <section className="py-20 bg-[#f5f0ee]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <ScanLine className="w-10 h-10 text-[#ff6868] mx-auto mb-4" strokeWidth={1.5} />
          <h2 className="text-3xl font-bold text-navy mb-4">
            We&apos;d rather show you a custody log than a logo wall.
          </h2>
          <p className="text-navy/70 max-w-2xl mx-auto leading-relaxed">
            Travelyt is pilot-stage by design. Every launch route runs
            supervised: dated flight verified, route confirmed, handoff point
            designated by the airline, and every custody event documented from
            doorstep to acceptance. A pilot briefing walks your team through the
            live custody record of real movements — the proof, not the pitch.
          </p>
          <div className="mt-8">
            <a
              href="mailto:info@travelyt.us?subject=Pilot%20briefing%20request"
              className="inline-flex items-center justify-center gap-2 bg-navy text-white px-8 py-4 rounded-full font-bold hover:opacity-90 transition-opacity"
            >
              Request a pilot briefing
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </a>
          </div>
        </div>
      </section>

      {/* Cross-link to consumer page */}
      <section className="py-10 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-navy/70">
            Traveling, not partnering?{" "}
            <Link
              href="/airlines/baggage"
              className="font-semibold text-[#ff6868] hover:underline"
            >
              See how we prep bags for your airline&apos;s baggage rules →
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
