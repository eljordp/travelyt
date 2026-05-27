import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ClipboardCheck, LockKeyhole, MapPin, Scale, ShieldCheck, UserCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trust & Security",
  description:
    "How Travelyt protects luggage with tamper-evident seals, live tracking, chain-of-custody logs, vetted agents, and insurance coverage.",
  alternates: {
    canonical: "/trust",
  },
  openGraph: {
    title: "Trust & Security | Travelyt",
    description:
      "Learn how Travelyt handles luggage with seals, tracking, custody logs, vetted agents, and insurance coverage.",
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
    title: "Live GPS Tracking",
    desc: "From pickup to delivery, you can follow your bags on a live map and see status updates at every checkpoint. A tracking link goes to the traveler and, if you choose, to anyone meeting them at the other end.",
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
    title: "Insurance Coverage",
    desc: "Every bag we pick up is insured from the moment we collect it until delivery. Standard coverage applies automatically; declared-value upgrades are available for high-value items. Full terms apply.",
    icon: (
      <ShieldCheck className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "Vetted Agents",
    desc: "Every Travelyt agent is ID-verified and trained on handling, sealing, and chain-of-custody procedures. You always know who's handling your bags.",
    icon: (
      <UserCheck className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
  {
    title: "Operates Within the Rules",
    desc: "Travelyt is a federally registered motor carrier. We follow TSA guidance on restricted items, airport authority rules on landside pickup and delivery, and FMCSA requirements for property transport.",
    icon: (
      <Scale className="w-7 h-7" strokeWidth={1.5} />
    ),
  },
];

const process = [
  { title: "Pickup", desc: "Agent arrives at your door, verifies your ID, weighs each bag, and applies a uniquely numbered tamper-evident seal." },
  { title: "Transport", desc: "Bags are loaded into a GPS-tracked Travelyt vehicle. Live tracking is active from this moment on." },
  { title: "Airline Handoff", desc: "For departures, we drive your bags to the airport and deliver them to your airline for your flight. You walk in with nothing to carry." },
  { title: "Arrival Delivery", desc: "For arrivals service, our agent coordinates post-flight bag pickup using your bag tag receipt and flight info." },
  { title: "Delivery", desc: "Bags are delivered to your chosen address — hotel, home, office — within the agreed delivery window." },
];

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Trust & Security</span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">Your bags are in safe hands</h1>
          <p className="text-navy/70 max-w-2xl mx-auto text-lg">
            Every bag is tracked, insured, sealed, and handled by vetted agents. Here&apos;s exactly how we protect your belongings.
          </p>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((f) => (
              <div key={f.title} className="border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-navy/5 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#c41e2a]/10 flex items-center justify-center text-[#c41e2a] mb-4">
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
                  <div className="w-10 h-10 rounded-full bg-[#c41e2a] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
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

      {/* Insurance */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-[#f5f0ee] rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl font-bold text-navy mb-2">Insurance coverage</h2>
            <p className="text-sm text-navy/70 mb-8">Standard coverage is included on every booking. Full terms and claim procedures apply — details below, and complete terms are available on request.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              {[
                { label: "Standard coverage per bag", value: "Included in every booking" },
                { label: "Declared value upgrade", value: "Available for high-value items" },
                { label: "Lost or damaged bag", value: "Claim for documented value" },
                { label: "Delayed delivery", value: "Service fee refund options" },
                { label: "Fragile / high-value items", value: "Must be declared at pickup" },
                { label: "Claims process", value: "Initiated via your Travelyt account" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between gap-4 border-b border-gray-200 pb-3">
                  <span className="text-navy/70">{item.label}</span>
                  <span className="text-navy font-semibold text-right">{item.value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-navy/70 mt-6">
              Specific coverage limits are set out in the Travelyt Terms of Service. Items restricted by law or by carrier policy (flammable liquids, lithium batteries shipped loose, currency, irreplaceable documents, etc.) are not eligible for coverage.
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
              { label: "Insurance on every booking", icon: "✓" },
              { label: "Federally registered motor carrier", icon: "✓" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-8">
                <div className="text-3xl text-[#c41e2a] mb-2 font-bold">{s.icon}</div>
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
          <p className="text-white/60 mb-8">Tracked, insured, sealed, delivered. Every time.</p>
          <Link href="/quote" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#c41e2a] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
