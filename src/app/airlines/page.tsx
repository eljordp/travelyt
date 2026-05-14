import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

const airlines = [
  {
    name: "American Airlines",
    code: "AA",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    hubs: ["DFW", "CLT", "MIA", "ORD", "PHX", "LAX", "JFK"],
  },
  {
    name: "Delta Air Lines",
    code: "DL",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    hubs: ["ATL", "MSP", "DTW", "SLC", "SEA", "JFK", "LAX"],
  },
  {
    name: "United Airlines",
    code: "UA",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    hubs: ["ORD", "DEN", "IAH", "EWR", "SFO", "IAD", "LAX"],
  },
  {
    name: "Southwest Airlines",
    code: "WN",
    bags: "2 free checked bags (23kg/50lb each)",
    fee: "Free (first 2 bags)",
    hubs: ["DAL", "MDW", "BWI", "DEN", "LAS", "PHX", "HOU"],
  },
  {
    name: "JetBlue Airways",
    code: "B6",
    bags: "Varies by fare (0-2 free)",
    fee: "$35-$40 if not included",
    hubs: ["JFK", "BOS", "FLL", "MCO", "LAX"],
  },
  {
    name: "Alaska Airlines",
    code: "AS",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    hubs: ["SEA", "PDX", "SFO", "LAX", "ANC"],
  },
  {
    name: "Spirit Airlines",
    code: "NK",
    bags: "Checked bags available",
    fee: "$31-$55+ (varies by route/timing)",
    hubs: ["FLL", "MCO", "ATL", "DFW", "LAS"],
  },
  {
    name: "Frontier Airlines",
    code: "F9",
    bags: "Checked bags available",
    fee: "$30-$52+ (varies)",
    hubs: ["DEN", "MCO", "ATL", "LAS", "PHX"],
  },
];

const features = [
  {
    title: "We know the rules for every airline",
    desc: "Weight limits, size restrictions, and fee schedules vary by carrier. We prep each bag to match your airline's policy so nothing gets flagged at the counter.",
  },
  {
    title: "Oversized and sports equipment",
    desc: "Golf clubs, skis, surfboards, strollers. We handle the odd-shaped stuff and route it with the same care as a regular suitcase — priced transparently up front.",
  },
  {
    title: "Curbside meet-up",
    desc: "When your bags arrive at the airport, we meet you at the curb or a designated spot so you can walk straight in and hand them to the airline agent yourself.",
  },
  {
    title: "Digital bag receipts",
    desc: "You get a digital receipt the moment each bag is picked up and sealed — tracking number, weight, photo, and seal ID. Everything stays in your account.",
  },
];

export default function AirlinesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Airline Baggage Rules</span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">Prepped for your airline</h1>
          <p className="text-navy/60 max-w-2xl mx-auto text-lg">
            Every airline has its own baggage policy. We weigh, tag, and prep each bag to match — so when you walk into the terminal, everything&apos;s ready for the counter.
          </p>
          <p className="text-navy/40 max-w-2xl mx-auto text-sm mt-6">
            Travelyt is an independent baggage logistics service. We are not affiliated with, endorsed by, or partnered with any airline unless explicitly stated. Airline names and logos are used here only to describe their baggage policies.
          </p>
        </div>
      </section>

      {/* Airline Grid */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {airlines.map((airline) => (
              <div key={airline.code} className="border border-gray-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-navy/5 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-navy">{airline.name}</h3>
                    <span className="text-xs font-mono text-navy/40">{airline.code}</span>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-navy/40">Checked bag allowance</span>
                    <span className="text-navy/70 font-medium">{airline.bags}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy/40">Airline baggage fee</span>
                    <span className="text-navy/70 font-medium">{airline.fee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy/40">Major hubs</span>
                    <span className="text-navy/70 font-medium">{airline.hubs.join(", ")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-navy/40 mt-8 max-w-2xl mx-auto">
            Airline fees are paid directly to the airline at check-in. Travelyt service fees are separate and cover pickup, transport, sealing, tracking, and insurance. Fee schedules above are summaries — check your airline&apos;s site for the current, complete terms.
          </p>
        </div>
      </section>

      {/* How we handle it */}
      <section className="py-20 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">How we handle airline baggage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6">
                <h3 className="font-bold text-navy mb-2">{f.title}</h3>
                <p className="text-sm text-navy/50 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-navy text-white text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4">Flying soon?</h2>
          <p className="text-white/60 mb-8">Tell us your airline and we&apos;ll prep your bags to match.</p>
          <Link href="/quote" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#e63946] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
