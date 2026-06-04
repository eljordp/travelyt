import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { CircleCheck, ShieldCheck, Tag } from "lucide-react";
import {
  EXPRESS_PICKUP_CENTS,
  EXPRESS_DISTANCE_RATE_CENTS,
  FAMILY_BUNDLE_MIN_BAGS,
  FAMILY_BUNDLE_PERCENT,
  INCLUDED_DISTANCE_MILES,
  SERVICE_PRICES_CENTS,
  STANDARD_DISTANCE_RATE_CENTS,
} from "@/lib/pricing";
import { AIRLINE_BAG_CUTOFF_MINUTES } from "@/lib/service-rules";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Travelyt base pricing for departure pickup, arrival delivery, round-trip baggage handling, and distance-based route surcharges.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Travelyt Pricing",
    description:
      "See base per-bag rates for Travelyt pickup, delivery, tracking, sealing, insured baggage transport, and distance-based route surcharges.",
    url: "/pricing",
  },
};

const plans = [
  {
    name: "Departure",
    price: SERVICE_PRICES_CENTS.departure / 100,
    unit: "per bag",
    description: "We collect your bags at your door and move them to the airport. You arrive hands-free.",
    features: [
      "Doorstep bag collection",
      "Weigh, tag, and seal",
      "GPS custody checkpoints",
      "Curbside or terminal meet-up",
      "Full insurance coverage",
      "SMS & email updates",
    ],
    cta: "Book Departure",
    href: "/quote?service=departure",
    popular: false,
  },
  {
    name: "Arrival",
    price: SERVICE_PRICES_CENTS.arrival / 100,
    unit: "per bag",
    description: "We collect your bags after your flight lands and deliver them to your address.",
    features: [
      "Post-flight bag collection",
      "Delivery to any address",
      "Status and custody updates",
      "Full insurance coverage",
      "Flexible delivery windows",
      "Multi-bag support",
    ],
    cta: "Book Arrival",
    href: "/quote?service=arrival",
    popular: false,
  },
  {
    name: "Both Ways",
    price: SERVICE_PRICES_CENTS.both / 100,
    unit: "per bag",
    description: "Full round-trip. Your bags leave and come back without you lifting a finger.",
    features: [
      "Everything in Departure",
      "Everything in Arrival",
      "Priority scheduling",
      "Dedicated agent both ways",
      "Save $9 per bag vs. booking separately",
      "Best value for round trips",
    ],
    cta: "Book Both Ways",
    href: "/quote?service=both",
    popular: true,
  },
];

const addons = [
  { name: "Express Pickup", detail: `+$${EXPRESS_PICKUP_CENTS / 100} per booking — priority route coordination; timing depends on distance and airline cutoff` },
  { name: "Distance Surcharge", detail: `${INCLUDED_DISTANCE_MILES} miles from the airport included, then $${(STANDARD_DISTANCE_RATE_CENTS / 100).toFixed(2)}/mi standard or $${(EXPRESS_DISTANCE_RATE_CENTS / 100).toFixed(2)}/mi with express` },
  { name: "Extra Bag Discount", detail: "$10 off each additional bag on the same booking" },
  { name: "Family Bundle", detail: `${FAMILY_BUNDLE_MIN_BAGS}+ bags: ${FAMILY_BUNDLE_PERCENT}% off eligible service fees` },
  { name: "Airline Cutoff", detail: `Departure handoff targets airline bag acceptance at least ${AIRLINE_BAG_CUTOFF_MINUTES} minutes before departure unless a specific airport or airline approves a shorter Travelyt cutoff` },
  { name: "Oversized / Sports Equipment", detail: "+$15 per item (golf bags, skis, surfboards)" },
];

const standardDistanceRate = (STANDARD_DISTANCE_RATE_CENTS / 100).toFixed(2);
const expressDistanceRate = (EXPRESS_DISTANCE_RATE_CENTS / 100).toFixed(2);

const competitors = [
  { name: "Travelyt", departure: "$49", arrival: "$29", sameDay: "Yes", tracking: "Yes", curbside: "Yes", highlight: true },
  { name: "Bags VIP", departure: "—", arrival: "$49.95+", sameDay: "4-6 hrs", tracking: "Updates", curbside: "No", highlight: false },
  { name: "LugLess", departure: "Quote based", arrival: "Quote based", sameDay: "Carrier timing", tracking: "Carrier", curbside: "No", highlight: false },
  { name: "Luggage Forward", departure: "Quote based", arrival: "Quote based", sameDay: "Carrier timing", tracking: "Carrier", curbside: "No", highlight: false },
  { name: "AirPortr (UK/EU)", departure: "Quote based", arrival: "Quote based", sameDay: "Yes", tracking: "Yes", curbside: "Yes", highlight: false },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider">Pricing</span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">Simple, transparent pricing</h1>
          <p className="text-navy/70 max-w-2xl mx-auto text-lg">
            Straightforward base per-bag rates, with discounts calculated automatically. Routes beyond {INCLUDED_DISTANCE_MILES} miles from the airport add ${standardDistanceRate}/mi standard or ${expressDistanceRate}/mi with express.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20 -mt-4">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.name} className={`relative rounded-2xl p-8 ${plan.popular ? "bg-navy text-white shadow-2xl shadow-navy/20 md:-mt-4 md:mb-[-1rem] ring-2 ring-[#ff6868]" : "bg-white border border-gray-100 shadow-lg shadow-navy/5"}`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#ff6868] text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className={`text-lg font-bold mb-1 ${plan.popular ? "text-white" : "text-navy"}`}>{plan.name}</h3>
                  <p className={`text-sm ${plan.popular ? "text-white/60" : "text-navy/70"}`}>{plan.description}</p>
                </div>
                <div className="mb-6">
                  <span className={`text-5xl font-bold ${plan.popular ? "text-white" : "text-navy"}`}>${plan.price}</span>
                  <span className={`text-sm ml-1 ${plan.popular ? "text-white/70" : "text-navy/70"}`}>{plan.unit}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CircleCheck
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.popular ? "text-[#ff6868]" : "text-[#ff6868]"}`}
                        fill="currentColor"
                        strokeWidth={1.5}
                      />
                      <span className={plan.popular ? "text-white/80" : "text-navy/70"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all ${plan.popular ? "bg-[#ff6868] text-white hover:bg-[#ff6868]" : "bg-navy text-white hover:bg-navy/90"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-navy/70 mt-8 max-w-2xl mx-auto">
            Airline baggage fees are paid separately to the airline at check-in.
            Travelyt base fees cover pickup, transport, sealing, tracking, and
            standard coverage within {INCLUDED_DISTANCE_MILES} miles of the
            airport. Addresses farther than {INCLUDED_DISTANCE_MILES} miles
            add ${standardDistanceRate}/mi standard or ${expressDistanceRate}/mi
            with express.
          </p>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-16 bg-[#f5f0ee]">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-navy text-center mb-3">Add-ons & automatic discounts</h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-navy/65">
            Express pickup is a single booking add-on, not a per-bag charge. Pickup timing is confirmed from route distance, traffic, and airline baggage cutoff rules. Extra-bag and family discounts are calculated in the quote flow before promo codes are applied.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addons.map((a) => (
              <div key={a.name} className="bg-white rounded-xl p-5 shadow-sm">
                <div className="font-bold text-navy text-sm mb-1">{a.name}</div>
                <div className="text-navy/70 text-sm">{a.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Promo example */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto grid gap-6 px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff6868]/10 text-[#ff6868]">
              <Tag className="h-5 w-5" strokeWidth={2} />
            </span>
            <h2 className="mt-4 text-2xl font-bold text-navy">Discounts show before you pay</h2>
            <p className="mt-3 text-sm leading-relaxed text-navy/70">
              Enter a promo code or open a launch-offer link and Travelyt recalculates the booking total automatically. The review screen shows service subtotal, express pickup, distance surcharge, automatic bag discount, promo discount, and estimated total.
            </p>
          </div>
          <div className="rounded-2xl border border-navy/10 bg-[#f6f7fb] p-5 shadow-sm shadow-navy/5">
            <div className="space-y-3 rounded-xl bg-white p-5 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-navy/65">Departure pickup · 4 bags</span>
                <span className="font-semibold text-navy">$196.00</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-navy/65">Express pickup</span>
                <span className="font-semibold text-navy">$20.00</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-navy/65">Distance surcharge · 7 mi express</span>
                <span className="font-semibold text-navy">$31.50</span>
              </div>
              <div className="flex justify-between gap-4 text-[#ff6868]">
                <span>Extra bag discount</span>
                <span className="font-semibold">−$30.00</span>
              </div>
              <div className="flex justify-between gap-4 text-[#ff6868]">
                <span>Launch offer (TRAVELYT30)</span>
                <span className="font-semibold">−$55.80</span>
              </div>
              <div className="flex justify-between gap-4 border-t border-navy/10 pt-3 text-base">
                <span className="font-bold text-navy">Base estimate</span>
                <span className="font-bold text-navy">$161.70</span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-navy/60">
              Example only. Promo availability, eligibility, service areas,
              timing, distance surcharges, and coverage terms may vary.
              Discounts do not apply to airline baggage fees, distance
              surcharges, oversized-item fees, declared-value upgrades, taxes,
              or third-party charges unless stated.
            </p>
          </div>
        </div>
      </section>

      {/* Insurance */}
      <section className="bg-navy py-16 text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-[#ff6868]">
              <ShieldCheck className="h-6 w-6" strokeWidth={2} />
            </span>
            <h2 className="mt-4 text-3xl font-bold">Insurance is included on every eligible bag</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Travelyt coverage starts when we collect your bag and ends when it is delivered or accepted at the agreed handoff point. You can add declared-value coverage for higher-value items before pickup.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Standard coverage", "Included in every eligible booking"],
              ["Chain of custody", "Photos, seals, timestamps, and handoff logs"],
              ["Claims support", "Documented claim process if something goes wrong"],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl bg-white/[0.06] p-5">
                <p className="font-bold text-white">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-navy text-center mb-3">How we compare</h2>
          <p className="text-navy/70 text-center mb-10 max-w-xl mx-auto">Same-day pickup, GPS custody checkpoints, curbside meet-up at the airport. We pick up and deliver — the airline handles the counter.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  {["Service", "Departure", "Arrival", "Same Day", "GPS Checkpoints", "Curbside Meet-up"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-navy/70 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {competitors.map((c) => (
                  <tr key={c.name} className={c.highlight ? "bg-[#ff6868]/5" : "hover:bg-gray-50/50"}>
                    <td className={`px-4 py-4 font-semibold ${c.highlight ? "text-[#ff6868]" : "text-navy"}`}>{c.name}</td>
                    <td className="px-4 py-4 text-navy/70">{c.departure}</td>
                    <td className="px-4 py-4 text-navy/70">{c.arrival}</td>
                    <td className="px-4 py-4 text-navy/70">{c.sameDay}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.tracking === "Yes" ? "bg-green-100 text-green-700" : c.tracking === "Limited" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>{c.tracking}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.curbside === "Yes" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.curbside}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-navy/70 mt-6 text-center">
            Competitor notes are approximate from public information and quote-flow behavior as of May 2026. No endorsement, affiliation, or partnership is implied.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-navy text-white text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4">Ready to travel hands-free?</h2>
          <p className="text-white/60 mb-8">Get a free quote in under 60 seconds.</p>
          <Link href="/quote" className="inline-block bg-[#ff6868] text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-[#ff6868] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
