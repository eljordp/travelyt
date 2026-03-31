import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

const NEARBY = [
  "Manhattan", "Brooklyn", "Queens", "The Bronx", "Staten Island",
  "Jersey City", "Newark", "Hoboken", "Long Island", "Westchester",
  "Stamford", "White Plains", "Yonkers", "New Rochelle", "Garden City",
];

const AIRLINES = [
  "American Airlines", "Delta Air Lines", "United Airlines", "JetBlue Airways",
  "Alaska Airlines", "Southwest Airlines", "Spirit Airlines", "Frontier Airlines",
];

export default function JFKPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="pt-28 pb-20 bg-gradient-to-b from-navy to-navy/90 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-travel.jpg')] bg-cover bg-center opacity-20" />
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <span className="text-sm font-semibold text-[#e63946] uppercase tracking-wider">New York</span>
          <h1 className="text-4xl md:text-6xl font-bold mt-3 mb-4">
            Travelyt <span className="text-[#e63946]">JFK</span>
          </h1>
          <p className="text-white/70 max-w-2xl mx-auto text-lg mb-8">
            Door-to-door baggage service for JFK International Airport. We collect your bags anywhere in the NYC metro area.
          </p>
          <Link href="/quote" className="inline-block bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#e63946] transition-colors">
            Get a Quote for JFK
          </Link>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-navy text-center mb-12">How it works in NYC</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "We come to you", desc: "Manhattan apartment, Brooklyn brownstone, hotel in Midtown — our agent meets you at your door." },
              { step: "02", title: "Bags tagged & checked in", desc: "We handle everything curbside. Bags weighed, tagged, sealed. Checked into your flight on the spot." },
              { step: "03", title: "You skip the chaos", desc: "Take the AirTrain hands-free. No hauling luggage through Penn Station or on the subway." },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="text-4xl font-bold text-[#c41e2a]/20 mb-3">{s.step}</div>
                <h3 className="text-lg font-bold text-navy mb-2">{s.title}</h3>
                <p className="text-sm text-navy/50 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#f5f0ee]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Coverage Area</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">50-mile radius from JFK</h2>
              <p className="text-navy/60 mb-6">All five boroughs, Long Island, Westchester, Northern New Jersey, and Southern Connecticut.</p>
              <div className="flex flex-wrap gap-2">
                {NEARBY.map((city) => (
                  <span key={city} className="bg-white px-3 py-1.5 rounded-full text-xs font-medium text-navy/70 border border-gray-100">{city}</span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider">Airlines at JFK</span>
              <h2 className="text-3xl font-bold text-navy mt-2 mb-4">All major carriers</h2>
              <p className="text-navy/60 mb-6">We handle baggage for flights on all major US airlines departing from JFK.</p>
              <div className="space-y-2">
                {AIRLINES.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-navy/70">
                    <svg className="w-4 h-4 text-[#c41e2a] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
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
          <h2 className="text-3xl font-bold text-navy mb-4">JFK Pricing</h2>
          <p className="text-navy/50 mb-10">Same transparent pricing everywhere we operate.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { name: "Departure", price: "$49", unit: "/bag" },
              { name: "Arrival", price: "$29", unit: "/bag" },
              { name: "Both Ways", price: "$69", unit: "/bag" },
            ].map((p) => (
              <div key={p.name} className="bg-[#f5f0ee] rounded-2xl p-6">
                <div className="text-sm font-semibold text-navy/50 mb-2">{p.name}</div>
                <div className="text-4xl font-bold text-navy">{p.price}<span className="text-lg text-navy/40">{p.unit}</span></div>
              </div>
            ))}
          </div>
          <Link href="/quote" className="inline-block mt-10 bg-[#c41e2a] text-white px-8 py-4 rounded-full font-bold hover:bg-[#e63946] transition-colors">
            Get Your JFK Quote
          </Link>
        </div>
      </section>

      <section className="py-16 bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { num: "62M+", label: "Annual JFK passengers" },
              { num: "50mi", label: "Service radius" },
              { num: "6", label: "JFK terminals covered" },
              { num: "4hr", label: "Max delivery window" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-[#e63946]">{s.num}</div>
                <div className="text-sm text-white/50 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
