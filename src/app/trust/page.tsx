import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ClipboardCheck, LockKeyhole, MapPin, Scale, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trust & Security",
  description:
    "How Travelyt is designed to protect luggage with tamper-evident seals, custody checkpoints, documented transfers, agent activation controls, and a pre-custody coverage gate.",
  alternates: {
    canonical: "/trust",
  },
  openGraph: {
    title: "Trust & Security | Travelyt",
    description:
      "Learn how Travelyt's proposed custody controls use seals, checkpoints, documented transfers, agent activation requirements, and a pre-custody coverage gate.",
    url: "/trust",
  },
};

const securityFeatures = [
  {
    title: "Tamper-Evident Seals",
    desc: "Every bag is sealed with a unique, numbered tamper-evident seal at your door. If the seal is broken at any point before you or your recipient receive the bag, our system flags it and you're notified immediately.",
    icon: (
      <LockKeyhole className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "GPS Custody Checkpoints",
    desc: "From route start to pickup, handoff, and delivery, Travelyt records GPS checkpoints with custody proof so travelers can see verified status updates as the bag moves.",
    icon: (
      <MapPin className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "Chain of Custody Logging",
    desc: "Every handoff is logged — who handled your bag, where, and when. A full digital audit trail from your door through transport to final delivery.",
    icon: (
      <ClipboardCheck className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "Coverage Before Custody",
    desc: "No live customer bag enters Travelyt custody until coverage is bound for the final driver, vehicle, route, and custody model. The controlling policy—not a quote-page selection—defines all terms.",
    icon: (
      <ShieldCheck className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "Activation-Gated Agents",
    desc: "Every Travelyt agent must complete identity verification and scored training on handling, sealing, privacy, exceptions, and custody procedures before activation.",
    icon: (
      <UserCheck className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "Route-by-Route Compliance",
    desc: "Each live route must be cleared against the applicable motor-carrier, airport, airline, restricted-item, insurance, and local operating requirements before launch.",
    icon: (
      <Scale className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
];

const process = [
  { title: "Pickup", desc: "Agent arrives at your door, verifies your ID, weighs each bag, and applies a uniquely numbered tamper-evident seal." },
  { title: "Transport", desc: "Bags are loaded for transport, and GPS custody checkpoints are recorded as the driver starts route, arrives, and completes each proof step." },
  { title: "Airline Handoff", desc: "For departures, we tender bags only through the receiving role, location, cutoff, tagging, screening, and exception process authorized by the participating airline and airport." },
  { title: "Arrival Delivery", desc: "Where approved, our agent coordinates post-flight bag release using the airline- and airport-required documents and process." },
  { title: "Delivery", desc: "Bags are delivered to your chosen address — hotel, home, office — within the agreed delivery window." },
];

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">Trust & Security</span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">Your bags are in safe hands</h1>
          <p className="text-navy/70 max-w-2xl mx-auto text-lg">
            Every live bag must be sealed, documented, handled by trained staff, and covered by the controlling policy. Here&apos;s how the custody controls are designed.
          </p>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((f) => (
              <div key={f.title} className="border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-navy/5 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#ff6868]/10 flex items-center justify-center text-[#ff6868] mb-4">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-navy mb-2">{f.title}</h3>
                <p className="text-sm text-navy/70 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chain of Custody Process */}
      <section className="py-20 bg-navy text-white">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-4">Chain of custody</h2>
          <p className="text-white/70 text-center mb-12">Every step is logged, tracked, and verified.</p>
          <div className="space-y-6">
            {process.map((step, i) => (
              <div key={step.title} className="flex gap-6 items-start">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-[#ff6868] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {i + 1}
                  </div>
                  {i < process.length - 1 && <div className="w-px h-full bg-white/10 mt-2 min-h-[2rem]" />}
                </div>
                <div className="pb-4">
                  <h3 className="font-bold text-lg mb-1">{step.title}</h3>
                  <p className="text-white/70 text-sm">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coverage readiness */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-[#f5f0ee] rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl font-bold text-navy mb-2">Coverage readiness</h2>
            <p className="text-sm text-navy/70 mb-8">These are launch gates, not current insurance benefits. The final binder and policy terms must be confirmed before Travelyt accepts a live customer bag.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              {[
                { label: "Final policy binder", value: "Required before live custody" },
                { label: "Driver and vehicle", value: "Must be named or covered" },
                { label: "Custody model", value: "Must match policy terms" },
                { label: "Declared value", value: "Recorded for manual review" },
                { label: "Exclusions and limits", value: "Controlled by final policy" },
                { label: "Claims process", value: "Published after policy binding" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between gap-4 border-b border-gray-200 pb-3">
                  <span className="text-navy/70">{item.label}</span>
                  <span className="text-navy font-semibold text-right">{item.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-navy/70 mt-6">
              Restricted items remain prohibited regardless of coverage. No page,
              quote, or declared-value entry overrides the controlling policy,
              airline requirements, airport rules, or law.
            </p>
          </div>
        </div>
      </section>

      {/* What we stand for */}
      <section className="py-16 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { label: "Every bag sealed and tracked", icon: "✓" },
              { label: "Coverage required before live custody", icon: "✓" },
              { label: "Federally registered motor carrier", icon: "✓" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-8">
                <div className="text-3xl text-[#ff6868] mb-2 font-bold">{s.icon}</div>
                <div className="text-sm text-navy/70">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-navy text-white text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4">Trust us with your bags</h2>
          <p className="text-white/60 mb-8">Documented, sealed, and handled through an approved process.</p>
          <Link href="/quote" className="inline-block bg-[#ff6868] text-white px-8 py-4 rounded-full font-bold hover:bg-[#ff6868] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
