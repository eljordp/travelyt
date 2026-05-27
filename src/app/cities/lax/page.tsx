import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import {
  EXPRESS_DISTANCE_RATE_CENTS,
  INCLUDED_DISTANCE_MILES,
  STANDARD_DISTANCE_RATE_CENTS,
} from "@/lib/pricing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LAX Baggage Service",
  description:
    "Travelyt door-to-door baggage pickup and airport handoff for Los Angeles International Airport and the greater LA area.",
  alternates: {
    canonical: "/cities/lax",
  },
};

const NEARBY = [
  "Santa Monica", "Beverly Hills", "West Hollywood", "Downtown LA", "Pasadena",
  "Long Beach", "Inglewood", "Culver City", "Manhattan Beach", "Hermosa Beach",
  "Redondo Beach", "Torrance", "Anaheim", "Irvine", "Burbank",
];

const AIRLINES = [
  "American Airlines", "Delta Air Lines", "United Airlines", "Southwest Airlines",
  "Alaska Airlines", "JetBlue Airways", "Spirit Airlines", "Frontier Airlines",
];

export default function LAXPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-20 bg-gradient-to-b from-navy to-navy/90 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-travel.jpg')] bg-cover bg-center opacity-20" />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Los Angeles</span>
          <h1 className="text-4xl md:text-6xl font-bold mt-3 mb-4">
            Travelyt <span className="text-[#c41e2a]">LAX</span>
          </h1>
          <p className="text-white/70 max-w-2xl mx-auto text-lg mb-8">
            Door-to-door baggage service for Los Angeles International Airport. Base pricing includes the first {INCLUDED_DISTANCE_MILES} miles from LAX.
          </p>
          <Link href="/quote?airport=LAX" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#c41e2a] transition-colors">
            Get a Quote for LAX
          </Link>
        </div>
      </section>

      {/* How it works locally */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">How it works in LA</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "We come to you", desc: "Anywhere in the greater LA area — your home, hotel, Airbnb, or office. Our agent arrives at your scheduled time." },
              { step: "02", title: "Bags sealed & tracked", desc: "We weigh, tag, and seal your bags on-site. Live GPS tracking is active from the moment we collect — you can follow along from your phone." },
              { step: "03", title: "You skip the drag", desc: "Drive or ride to LAX hands-free. We meet you curbside with your bags ready for the counter — or, for arrivals, we deliver after your flight lands." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="text-4xl font-bold text-[#c41e2a]/20 mb-3">{s.step}</div>
                <h3 className="text-lg font-bold text-navy mb-2">{s.title}</h3>
                <p className="text-sm text-navy/70 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coverage */}
      <section className="py-20 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Coverage Area</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">{INCLUDED_DISTANCE_MILES}-mile base radius from LAX</h2>
              <p className="text-navy/70 mb-6">The first {INCLUDED_DISTANCE_MILES} miles from LAX are included. Routes beyond that add ${(STANDARD_DISTANCE_RATE_CENTS / 100).toFixed(2)}/mi standard or ${(EXPRESS_DISTANCE_RATE_CENTS / 100).toFixed(2)}/mi with express.</p>
              <div className="flex flex-wrap gap-2">
                {NEARBY.map((city) => (
                  <span key={city} className="bg-white px-3 py-1.5 rounded-full text-xs font-medium text-navy/70 border border-gray-100">{city}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Airlines at LAX</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">All major carriers</h2>
              <p className="text-navy/70 mb-6">We handle baggage for flights on all major US airlines departing from LAX.</p>
              <div className="space-y-2">
                {AIRLINES.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-navy/70">
                    <CircleCheck className="w-4 h-4 text-[#c41e2a] flex-shrink-0" fill="currentColor" strokeWidth={1.5} />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-navy mb-4">LAX Pricing</h2>
          <p className="text-navy/70 mb-10">Base rates are consistent, with distance added after {INCLUDED_DISTANCE_MILES} miles.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { name: "Departure", price: "$49", unit: "/bag" },
              { name: "Arrival", price: "$29", unit: "/bag" },
              { name: "Both Ways", price: "$69", unit: "/bag" },
            ].map((p) => (
              <div key={p.name} className="bg-[#f5f0ee] rounded-2xl p-6">
                <div className="text-sm font-semibold text-navy/70 mb-2">{p.name}</div>
                <div className="text-4xl font-bold text-navy">{p.price}<span className="text-lg text-navy/70">{p.unit}</span></div>
              </div>
            ))}
          </div>
          <Link href="/quote?airport=LAX" className="inline-block mt-10 bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#c41e2a] transition-colors">
            Get Your LAX Quote
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { num: "88M+", label: "Annual LAX passengers" },
              { num: "50mi", label: "Service radius" },
              { num: "9", label: "LAX terminals covered" },
              { num: "4hr", label: "Max delivery window" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-[#c41e2a]">{s.num}</div>
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
