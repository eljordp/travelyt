"use client";

import Image from "next/image";
import { CircleCheck, Globe2, Package, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { INCLUDED_DISTANCE_MILES } from "@/lib/pricing";

const AIRPORTS = [
  ["ATL","Atlanta (ATL)"],["BOS","Boston (BOS)"],["BWI","Baltimore/Washington (BWI)"],
  ["DCA","Reagan National (DCA)"],["DEN","Denver (DEN)"],["DFW","Dallas/Fort Worth (DFW)"],
  ["DTW","Detroit (DTW)"],["EWR","New York Newark (EWR)"],["HOU","Houston Hobby (HOU)"],
  ["IAD","Washington Dulles (IAD)"],["IAH","Houston Intercontinental (IAH)"],["JFK","New York JFK (JFK)"],
  ["LAS","Las Vegas (LAS)"],["LAX","Los Angeles (LAX)"],["MCO","Orlando (MCO)"],
  ["MDW","Chicago Midway (MDW)"],["MIA","Miami (MIA)"],["MSP","Minneapolis (MSP)"],
  ["ORD","Chicago O'Hare (ORD)"],["ORF","Norfolk (ORF)"],["PDX","Portland (PDX)"],
  ["PHX","Phoenix (PHX)"],["RIC","Richmond (RIC)"],["SEA","Seattle (SEA)"],["SFO","San Francisco (SFO)"],
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const now = new Date();
const YEARS = [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];

export default function Hero() {
  const router = useRouter();
  const [airport, setAirport] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState(String(YEARS[0]));

  function handleQuote() {
    const params = new URLSearchParams();
    if (airport) params.set("airport", airport);
    if (month && day && year) params.set("date", `${year}-${month}-${day}`);
    const query = params.toString();
    router.push(query ? `/quote?${query}` : "/quote");
  }

  const labelClass = "block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-2";
  const selectClass = "w-full px-3 py-3 rounded-xl border border-gray-200 focus:border-purple focus:ring-2 focus:ring-purple/20 outline-none transition-all text-sm bg-white text-navy";

  return (
    <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden">
      {/* Hero background image */}
      <div className="absolute inset-0">
        <Image
          src="/hero-travel.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/50 to-white" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-10 text-xs sm:text-sm text-white/70">
          {["Fully Insured", "Live Tracking", "Sealed In Transit"].map((badge) => (
            <span key={badge} className="flex items-center gap-2">
              <CircleCheck className="w-5 h-5 text-cyan" fill="currentColor" strokeWidth={1.5} />
              {badge}
            </span>
          ))}
        </div>

        {/* Headline */}
        <div className="text-center max-w-4xl mx-auto mb-12">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6">
            We move your bags.
            <br />
            <span className="text-cyan">You move freely.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            We pick up your luggage at your door and deliver it straight to your airline at the airport. Travel hands-free before you even reach the terminal.
          </p>
          <p className="text-sm md:text-base text-cyan/90 italic mt-8 tracking-wide">
            Travel light, arrive smart.
          </p>
        </div>

        {/* Booking Form */}
        <div id="book" className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl shadow-navy/5 p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            {/* Airport */}
            <div>
              <label htmlFor="hero-airport" className={labelClass}>
                Airport
              </label>
              <select id="hero-airport" value={airport} onChange={(e) => setAirport(e.target.value)} className={selectClass}>
                <option value="">Select airport...</option>
                {AIRPORTS.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-navy/70 mt-1.5">
                {INCLUDED_DISTANCE_MILES} miles included
              </p>
            </div>

            {/* Travel Date — 3 dropdowns */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                Travel Date
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass} aria-label="Month">
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
                  ))}
                </select>
                <select value={day} onChange={(e) => setDay(e.target.value)} className={selectClass} aria-label="Day">
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
                  ))}
                </select>
                <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass} aria-label="Year">
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-end">
              <button
                onClick={handleQuote}
                className="w-full bg-gradient-to-r from-purple to-purple-light text-white py-3 px-6 rounded-xl font-semibold hover:opacity-90 transition-opacity text-sm cursor-pointer"
              >
                Get Quote →
              </button>
            </div>
          </div>
        </div>

        {/* Service Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-5xl mx-auto">
          {[
            {
              icon: (
                <Package className="w-8 h-8" strokeWidth={1.5} />
              ),
              title: "Doorstep Pickup",
              desc: "We come to your door, weigh and tag your bags, and deliver them to your airline at the airport. You arrive hands-free.",
            },
            {
              icon: (
                <Globe2 className="w-8 h-8" strokeWidth={1.5} />
              ),
              title: "Arrival Delivery",
              desc: "Walk off the plane, skip the carousel. We collect your bags after your flight and deliver them to your hotel or address.",
            },
            {
              icon: (
                <ShieldCheck className="w-8 h-8" strokeWidth={1.5} />
              ),
              title: "Fully Secured",
              desc: "Real-time GPS tracking, tamper-evident seals, and secure luggage handling from pickup to handoff.",
            },
          ].map((card) => (
            <div key={card.title} className="bg-white rounded-2xl p-6 shadow-lg shadow-navy/5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple/10 to-cyan/10 flex items-center justify-center text-purple mb-4">
                {card.icon}
              </div>
              <h2 className="text-lg font-bold text-navy mb-2">{card.title}</h2>
              <p className="text-sm text-navy/70 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
