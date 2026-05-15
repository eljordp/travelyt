import Image from "next/image";
import { CircleCheck } from "lucide-react";

export default function Sustainability() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-br from-navy via-navy-light to-navy text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-cyan/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-sm font-semibold text-cyan uppercase tracking-wider">
              Sustainability
            </span>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 mb-6">
              Smarter logistics,
              <br />
              smaller footprint
            </h2>
            <p className="text-white/60 leading-relaxed mb-8">
              A single Travelyt van can consolidate trips that would otherwise
              each require a separate rideshare or taxi to the airport. Fewer
              vehicles on the curb, less idling, less fuel — and a calmer
              experience for everyone involved.
            </p>
            <div className="space-y-4">
              {[
                "Consolidated pickups reduce solo airport runs",
                "Route optimization cuts empty miles",
                "Reusable tags, sealed transit, minimal packaging",
                "Working toward lower-emissions vehicles over time",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CircleCheck
                    className="w-5 h-5 text-cyan mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    strokeWidth={1.5}
                  />
                  <span className="text-white/70 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual */}
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden aspect-square">
              <Image
                src="/sustainability.jpg"
                alt="Sustainable travel logistics"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-navy/40 flex items-center justify-center rounded-3xl">
                <div className="text-center px-6">
                  <div className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
                    One van.<br />Many trips.
                  </div>
                  <div className="text-sm text-white/60 mt-2 max-w-xs mx-auto">
                    Consolidated pickups replace individual rides to the airport.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
