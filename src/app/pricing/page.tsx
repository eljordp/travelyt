import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent Travelyt per-bag pricing for departure pickup, arrival delivery, and round-trip baggage handling.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Travelyt Pricing",
    description:
      "See per-bag rates for Travelyt pickup, delivery, tracking, sealing, and insured baggage transport.",
    url: "/pricing",
  },
};

const plans = [
  {
    name: "Departure",
    price: 49,
    unit: "per bag",
    description: "We collect your bags at your door and move them to the airport. You arrive hands-free.",
    features: [
      "Doorstep bag collection",
      "Weigh, tag, and seal",
      "GPS tracking end-to-end",
      "Curbside or terminal meet-up",
      "Full insurance coverage",
      "SMS & email updates",
    ],
    cta: "Book Departure",
    href: "/quote?service=departure",
    popular: false,
  },
  {
    name: "Both Ways",
    price: 69,
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
  {
    name: "Arrival",
    price: 29,
    unit: "per bag",
    description: "We collect your bags after your flight lands and deliver them to your address.",
    features: [
      "Post-flight bag collection",
      "Delivery to any address",
      "Real-time tracking",
      "Full insurance coverage",
      "Flexible delivery windows",
      "Multi-bag support",
    ],
    cta: "Book Arrival",
    href: "/quote?service=arrival",
    popular: false,
  },
];

const addons = [
  { name: "Extra Bag Discount", detail: "$10 off each additional bag on same booking" },
  { name: "Oversized / Sports Equipment", detail: "+$15 per item (golf bags, skis, surfboards)" },
  { name: "Express Pickup", detail: "+$20 — 2-hour pickup window instead of 4-hour" },
  { name: "Family Bundle", detail: "4+ bags: 15% off entire booking" },
];

const competitors = [
  { name: "Travelyt", departure: "$49", arrival: "$29", sameDay: "Yes", tracking: "Yes", curbside: "Yes", highlight: true },
  { name: "Bags VIP", departure: "—", arrival: "$29", sameDay: "4-6 hrs", tracking: "No", curbside: "No", highlight: false },
  { name: "LugLess", departure: "$35+", arrival: "$35+", sameDay: "2-5 days", tracking: "Limited", curbside: "No", highlight: false },
  { name: "Luggage Forward", departure: "$99+", arrival: "$99+", sameDay: "1-3 days", tracking: "Yes", curbside: "No", highlight: false },
  { name: "AirPortr (UK)", departure: "$45-95", arrival: "$45-95", sameDay: "Yes", tracking: "Yes", curbside: "Yes", highlight: false },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-16 bg-gradient-to-b from-[#f5f0ee] to-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Pricing</span>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mt-3 mb-4">Simple, transparent pricing</h1>
          <p className="text-navy/70 max-w-2xl mx-auto text-lg">
            No hidden fees. No surge pricing. Just straightforward per-bag rates.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-20 -mt-4">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.name} className={`relative rounded-2xl p-8 ${plan.popular ? "bg-navy text-white shadow-2xl shadow-navy/20 md:-mt-4 md:mb-[-1rem] ring-2 ring-[#c41e2a]" : "bg-white border border-gray-100 shadow-lg shadow-navy/5"}`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#c41e2a] text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
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
                      <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.popular ? "text-[#e63946]" : "text-[#c41e2a]"}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className={plan.popular ? "text-white/80" : "text-navy/70"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.href}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all ${plan.popular ? "bg-[#c41e2a] text-white hover:bg-[#e63946]" : "bg-navy text-white hover:bg-navy/90"}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-navy/70 mt-8 max-w-2xl mx-auto">
            Airline baggage fees are paid separately to the airline at check-in. Travelyt fees cover pickup, transport, sealing, tracking, and insurance only.
          </p>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-16 bg-[#f5f0ee]">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-navy text-center mb-8">Add-ons & Discounts</h2>
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

      {/* Comparison */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-navy text-center mb-3">How we compare</h2>
          <p className="text-navy/70 text-center mb-10 max-w-xl mx-auto">Same-day pickup, real-time tracking, curbside meet-up at the airport. We pick up and deliver — the airline handles the counter.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-100">
                  {["Service", "Departure", "Arrival", "Same Day", "Live Tracking", "Curbside Meet-up"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-navy/70 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {competitors.map((c) => (
                  <tr key={c.name} className={c.highlight ? "bg-[#c41e2a]/5" : "hover:bg-gray-50/50"}>
                    <td className={`px-4 py-4 font-semibold ${c.highlight ? "text-[#c41e2a]" : "text-navy"}`}>{c.name}</td>
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
          <p className="text-xs text-navy/70 mt-6 text-center">Competitor pricing is approximate and gathered from public sources. No endorsement or affiliation implied.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-navy text-white text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4">Ready to travel hands-free?</h2>
          <p className="text-white/60 mb-8">Get a free quote in under 60 seconds.</p>
          <Link href="/quote" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-[#e63946] transition-colors">
            Get Your Quote
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
