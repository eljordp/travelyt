import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import {
  ARRIVAL_INCLUDED_BAGS,
  EXPRESS_DISTANCE_RATE_CENTS,
  INCLUDED_DISTANCE_MILES,
  SERVICE_PRICES_CENTS,
  STANDARD_DISTANCE_RATE_CENTS,
} from "@/lib/pricing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ORD Baggage Service",
  description:
    "Request Travelyt baggage-service availability for Chicago O'Hare and the Chicagoland area.",
  alternates: {
    canonical: "/cities/ord",
  },
};

const NEARBY = [
  "Downtown Chicago", "Lincoln Park", "Wicker Park", "Evanston", "Oak Park",
  "Schaumburg", "Naperville", "Aurora", "Joliet", "Waukegan",
  "Skokie", "Des Plaines", "Arlington Heights", "Elmhurst", "Oak Brook",
];

const AIRLINES = [
  "American Airlines", "United Airlines", "Delta Air Lines", "Southwest Airlines",
  "Alaska Airlines", "JetBlue Airways", "Spirit Airlines", "Frontier Airlines",
];

export default function ORDPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="pt-28 pb-20 bg-gradient-to-b from-navy to-navy/90 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-travel.jpg')] bg-cover bg-center opacity-20" />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">Chicago</span>
          <h1 className="text-4xl md:text-6xl font-bold mt-3 mb-4">
            Travelyt <span className="text-[#ff6868]">ORD</span>
          </h1>
          <p className="text-white/70 max-w-2xl mx-auto text-lg mb-8">
            Request pilot availability for Chicago O&apos;Hare. A submitted quote does not confirm a live service area, terminal location, or delivery SLA.
          </p>
          <Link href="/quote?airport=ORD" className="inline-block bg-[#ff6868] text-white px-8 py-4 rounded-full font-bold hover:bg-[#ff6868] transition-colors">
            Get a Quote for ORD
          </Link>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">Proposed Chicago pilot flow</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Availability confirmed", desc: "Travelyt first confirms the address, route, agent, operating window, and eligible public-terminal handoff point." },
              { step: "02", title: "Bags sealed & tracked", desc: "We weigh, tag, and seal each bag at your door. GPS custody checkpoints are recorded as the bag moves through pickup, handoff, and delivery." },
              { step: "03", title: "Public-terminal return", desc: "For a confirmed departure rehearsal, the agent returns sealed bags to the verified traveler at the approved public meet point before airline check-in." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="text-4xl font-bold text-[#ff6868]/20 mb-3">{s.step}</div>
                <h3 className="text-lg font-bold text-navy mb-2">{s.title}</h3>
                <p className="text-sm text-navy/70 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">Coverage Area</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">{INCLUDED_DISTANCE_MILES}-mile base radius from ORD</h2>
              <p className="text-navy/70 mb-6">The first {INCLUDED_DISTANCE_MILES} miles from ORD are included. Routes beyond that add ${(STANDARD_DISTANCE_RATE_CENTS / 100).toFixed(2)}/mi standard or ${(EXPRESS_DISTANCE_RATE_CENTS / 100).toFixed(2)}/mi with express.</p>
              <div className="flex flex-wrap gap-2">
                {NEARBY.map((city) => (
                  <span key={city} className="bg-white px-3 py-1.5 rounded-full text-xs font-medium text-navy/70 border border-gray-100">{city}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">Carrier reference list</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">Availability is approval-dependent</h2>
              <p className="text-navy/70 mb-6">These airlines operate at ORD; listing them does not mean Travelyt is approved by or available for that carrier. Service is confirmed per booking, and any passenger-absent checked-bag handoff requires written carrier and station authorization.</p>
              <div className="space-y-2">
                {AIRLINES.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-navy/70">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff6868]" />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-navy mb-4">ORD Pricing</h2>
          <p className="text-navy/70 mb-10">Base rates are consistent, with distance added after {INCLUDED_DISTANCE_MILES} miles.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { name: "Departure", price: `$${SERVICE_PRICES_CENTS.departure / 100}`, unit: "/bag" },
              { name: "Arrival", price: `$${SERVICE_PRICES_CENTS.arrival / 100}`, unit: `/${ARRIVAL_INCLUDED_BAGS} bags` },
            ].map((p) => (
              <div key={p.name} className="bg-[#f5f0ee] rounded-2xl p-6">
                <div className="text-sm font-semibold text-navy/70 mb-2">{p.name}</div>
                <div className="text-4xl font-bold text-navy">{p.price}<span className="text-lg text-navy/70">{p.unit}</span></div>
              </div>
            ))}
          </div>
          <Link href="/quote?airport=ORD" className="inline-block mt-10 bg-[#ff6868] text-white px-8 py-4 rounded-full font-bold hover:bg-[#ff6868] transition-colors">
            Get Your ORD Quote
          </Link>
        </div>
      </section>

      <section className="py-16 bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { num: "83M+", label: "Annual ORD passengers" },
              { num: "30mi", label: "Base-pricing radius" },
              { num: "TBD", label: "Live terminal coverage" },
              { num: "TBD", label: "Confirmed delivery SLA" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-[#ff6868]">{s.num}</div>
                <div className="text-sm text-white/70 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
