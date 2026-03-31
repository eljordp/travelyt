import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

const airlines = [
  {
    name: "American Airlines",
    code: "AA",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    status: "Supported",
    hubs: ["DFW", "CLT", "MIA", "ORD", "PHX", "LAX", "JFK"],
  },
  {
    name: "Delta Air Lines",
    code: "DL",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    status: "Supported",
    hubs: ["ATL", "MSP", "DTW", "SLC", "SEA", "JFK", "LAX"],
  },
  {
    name: "United Airlines",
    code: "UA",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    status: "Supported",
    hubs: ["ORD", "DEN", "IAH", "EWR", "SFO", "IAD", "LAX"],
  },
  {
    name: "Southwest Airlines",
    code: "WN",
    bags: "2 free checked bags (23kg/50lb each)",
    fee: "Free (first 2 bags)",
    status: "Supported",
    hubs: ["DAL", "MDW", "BWI", "DEN", "LAS", "PHX", "HOU"],
  },
  {
    name: "JetBlue Airways",
    code: "B6",
    bags: "Varies by fare (0-2 free)",
    fee: "$35-$40 if not included",
    status: "Supported",
    hubs: ["JFK", "BOS", "FLL", "MCO", "LAX"],
  },
  {
    name: "Alaska Airlines",
    code: "AS",
    bags: "2 checked bags (23kg/50lb each)",
    fee: "$35 first bag, $45 second",
    status: "Supported",
    hubs: ["SEA", "PDX", "SFO", "LAX", "ANC"],
  },
  {
    name: "Spirit Airlines",
    code: "NK",
    bags: "Checked bags available",
    fee: "$31-$55+ (varies by route/timing)",
    status: "Supported",
    hubs: ["FLL", "MCO", "ATL", "DFW", "LAS"],
  },
  {
    name: "Frontier Airlines",
    code: "F9",
    bags: "Checked bags available",
    fee: "$30-$52+ (varies)",
    status: "Supported",
    hubs: ["DEN", "MCO", "ATL", "LAS", "PHX"],
  },
];

const features = [
  {
    title: "We handle the airline rules",
    desc: "Every airline has different weight limits, size restrictions, and fees. Our agents know them all and ensure your bags are compliant before they leave your door.",
  },
  {
    title: "Excess baggage? We handle it",
    desc: "Overweight or oversized? We calculate fees and handle payment at check-in so you're not stuck at the counter.",
  },
  {
    title: "Boarding pass ready",
    desc: "Where airline integration allows, we generate your boarding pass during doorstep check-in. You go straight to security.",
  },
  {
    title: "Baggage receipts on your phone",
    desc: "You get a digital receipt for every bag the moment it's tagged — tracking number, weight, airline confirmation.",
  },
];

export default function AirlinesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Airline Compatibility</span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">We work with all airlines</h1>
          <p className="text-navy/60 max-w-2xl mx-auto text-lg">
            Every airline. Every flight. We follow each carrier&apos;s baggage policies to the letter — your bags are tagged, weighed, and checked in exactly how the airline requires.
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
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">{airline.status}</span>
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
                    <span className="text-navy/40">Hub airports</span>
                    <span className="text-navy/70 font-medium">{airline.hubs.join(", ")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-navy/40 mt-8">
            These are our most popular carriers — but we work with <strong className="text-navy/60">every airline</strong> operating at our served airports. Don&apos;t see yours? We&apos;ve got you covered.<br />
            Airline baggage fees are paid separately to the airline. Travelyt service fees are in addition to airline charges.
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
          <p className="text-white/60 mb-8">Tell us your airline and we&apos;ll handle the rest.</p>
          <Link href="/quote" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#e63946] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
