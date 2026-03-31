import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

const securityFeatures = [
  {
    title: "Tamper-Proof Smart Seals",
    desc: "Every bag is sealed with a unique, numbered tamper-evident seal at your door. If the seal is broken at any point, our system flags it immediately and you're notified.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: "Real-Time GPS Tracking",
    desc: "From the moment we collect your bags to the moment they're loaded onto your flight, you can track them live on a map. Updates at every checkpoint.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "Chain of Custody Logging",
    desc: "Every handoff is logged — who handled your bag, where, and when. A full digital audit trail from door to plane and back.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Full Insurance Coverage",
    desc: "Every bag is insured from the moment we collect it until delivery. Coverage for loss, damage, and delay — up to $3,000 per bag.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: "Background-Checked Agents",
    desc: "Every Travelyt agent undergoes a thorough background check, TSA compliance training, and ongoing performance reviews. Your bags are in trusted hands.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    title: "Aviation Security Compliance",
    desc: "We operate in full compliance with TSA regulations and airline security protocols. All bags are screened and handled according to federal aviation standards.",
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
];

const process = [
  { title: "Collection", desc: "Agent arrives, verifies your identity, weighs and seals each bag with a numbered tamper-proof seal." },
  { title: "Transport", desc: "Bags loaded into secure, GPS-tracked Travelyt vehicles. Live tracking enabled from this point." },
  { title: "Airport Handoff", desc: "Bags delivered to airline baggage system. Digital chain-of-custody handoff logged." },
  { title: "Flight Loading", desc: "Airline loads bags onto your flight per standard procedures. You receive confirmation." },
  { title: "Arrival (if booked)", desc: "Bags collected from carousel, cleared through customs if needed, delivered to your address." },
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
          <p className="text-navy/60 max-w-2xl mx-auto text-lg">
            Every bag is tracked, insured, sealed, and handled by vetted professionals. Here&apos;s exactly how we protect your belongings.
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
                <p className="text-sm text-navy/50 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chain of Custody Process */}
      <section className="py-20 bg-navy text-white">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-4">Chain of custody</h2>
          <p className="text-white/50 text-center mb-12">Every step is logged, tracked, and verified.</p>
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
                  <p className="text-white/50 text-sm">{step.desc}</p>
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
            <h2 className="text-2xl font-bold text-navy mb-4">Insurance coverage details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              {[
                { label: "Coverage per bag", value: "Up to $3,000" },
                { label: "Lost bag compensation", value: "Full declared value" },
                { label: "Damaged item coverage", value: "Repair or replacement cost" },
                { label: "Delayed delivery", value: "Full service refund" },
                { label: "Fragile / high-value items", value: "Additional coverage available" },
                { label: "Claims processing", value: "48-hour resolution target" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between gap-4 border-b border-gray-200 pb-3">
                  <span className="text-navy/50">{item.label}</span>
                  <span className="text-navy font-semibold text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-16 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { num: "0", label: "Bags lost to date" },
              { num: "99.8%", label: "On-time delivery" },
              { num: "$3K", label: "Insurance per bag" },
              { num: "24/7", label: "Support available" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl md:text-4xl font-bold text-[#c41e2a]">{s.num}</div>
                <div className="text-sm text-navy/50 mt-1">{s.label}</div>
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
          <Link href="/quote" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#e63946] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
