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
import {
  ORD_PILOT_ARRIVAL_MAX_MINUTES,
  ORD_PILOT_ARRIVAL_TARGET_MINUTES,
  ORD_PILOT_DEPARTURE_PICKUP_WINDOW_MINUTES,
} from "@/lib/service-rules";
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

const ROUTE_GATES = [
  "Written carrier and station authorization", "Named receiving party and location",
  "Confirmed cutoffs and exception procedure", "Cleared agent, vehicle, and coverage",
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
            Request a route review for Chicago O&apos;Hare. A proposed pickup area or displayed estimate does not confirm a live service lane, airline agreement, or operating window.
          </p>
          <Link href="/quote?airport=ORD" className="inline-block bg-[#ff6868] text-white px-8 py-4 rounded-full font-bold hover:bg-[#ff6868] transition-colors">
            Request ORD Route Review
          </Link>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">Proposed Chicago pilot flow</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Route gates confirmed", desc: "Travelyt confirms the address, operating window, agent readiness, coverage, and the exact authorized receiving path before releasing a request into custody." },
              { step: "02", title: "Verify, weigh + seal", desc: "At the door, the traveler, trip, and physical bags are matched. Weight, condition evidence, and a numbered tamper-evident seal begin each bag record." },
              { step: "03", title: "Authorized acceptance only", desc: "Passenger-absent tender occurs only through the carrier- and station-approved recipient, location, timing, tagging, screening, and exception procedure." },
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

      <section className="border-y border-navy/10 bg-white py-14">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 md:grid-cols-2">
          <div className="rounded-2xl border border-navy/10 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff6868]">Proposed pickup window</p>
            <h2 className="mt-2 text-xl font-bold text-navy">Target {ORD_PILOT_DEPARTURE_PICKUP_WINDOW_MINUTES}-minute arrival window</h2>
            <p className="mt-2 text-sm leading-relaxed text-navy/70">Pickup timing is confirmed only after the flight cutoff, route, capacity, and authorized receiving window are known. A displayed target is not a live service guarantee.</p>
          </div>
          <div className="rounded-2xl border border-navy/10 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff6868]">Proposed arrival timing</p>
            <h2 className="mt-2 text-xl font-bold text-navy">{ORD_PILOT_ARRIVAL_TARGET_MINUTES / 60}-hour target · {ORD_PILOT_ARRIVAL_MAX_MINUTES / 60}-hour maximum</h2>
            <p className="mt-2 text-sm leading-relaxed text-navy/70">The target is measured from actual landing when airport release is authorized and baggage is made available normally. Travelyt&apos;s accountable custody clock begins at the custody-accepted scan, and external release delays are recorded as exceptions.</p>
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
              <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">Before launch</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">Availability is approval-dependent</h2>
              <p className="text-navy/70 mb-6">No carrier relationship is implied. Each passenger-absent checked-bag route must clear these requirements before service can be confirmed.</p>
              <div className="space-y-2">
                {ROUTE_GATES.map((a) => (
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
          <h2 className="text-3xl font-bold text-navy mb-4">ORD planning estimates</h2>
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
            Request ORD Route Review
          </Link>
        </div>
      </section>

      <section className="py-16 bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { num: "1", label: "Record per physical bag" },
              { num: "30mi", label: "Base-pricing radius" },
              { num: "TBD", label: "Live terminal coverage" },
              { num: "TBD", label: "Confirmed arrival window" },
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
