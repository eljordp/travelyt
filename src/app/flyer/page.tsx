"use client";

import { Send } from "lucide-react";
import { SITE_HOST } from "@/lib/site";

export default function FlyerPage() {
  return (
    <>
      <style>{`
        @page { size: letter; margin: 0; }
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .flyer-screen-wrap { padding: 0 !important; background: white !important; min-height: auto !important; }
          .flyer-page { box-shadow: none !important; margin: 0 !important; }
          .flyer-controls { display: none !important; }
        }
        .flyer-page {
          width: 8.5in;
          min-height: 11in;
          background: #fdfbf7;
          color: #081546;
          position: relative;
          overflow: hidden;
        }
      `}</style>

      <div className="flyer-screen-wrap min-h-screen bg-[#1a1a1a] py-10 px-4">
        {/* Screen-only controls */}
        <div className="flyer-controls max-w-[8.5in] mx-auto mb-4 flex items-center justify-between text-white/70 text-xs">
          <span>Print-ready flyer · 8.5&quot; × 11&quot;</span>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            Print / Save PDF →
          </button>
        </div>

        <div className="flyer-page mx-auto shadow-2xl">
          {/* Top navy band */}
          <div className="bg-[#081546] text-white px-12 py-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Send className="w-[34px] h-[34px] text-[#c41e2a]" fill="currentColor" strokeWidth={1.2} />
              <div className="text-2xl font-bold tracking-tight">Travelyt</div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">
              Pre-Launch · 2026
            </div>
          </div>

          {/* Hero */}
          <div className="px-12 pt-14 pb-10">
            <div className="text-xs uppercase tracking-[0.3em] text-[#c41e2a] font-bold mb-5">
              Door-to-Door Baggage Service
            </div>
            <h1
              style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
              className="text-[68px] leading-[0.95] tracking-tight font-bold mb-6"
            >
              We move
              <br />
              your bags.
              <br />
              <span className="text-[#c41e2a]">You move freely.</span>
            </h1>
            <p className="text-lg leading-relaxed max-w-[5.5in] text-[#081546]/75">
              Travelyt picks up your luggage at home, transports it to the
              airport, and delivers it to your destination — so you never lug a
              suitcase through a terminal again.
            </p>
            <p className="italic text-[#081546]/55 mt-5 text-base">
              Travel light, arrive smart.
            </p>
          </div>

          {/* Divider */}
          <div className="px-12">
            <div className="h-px bg-[#081546]/15" />
          </div>

          {/* How it works */}
          <div className="px-12 py-10">
            <div className="text-xs uppercase tracking-[0.3em] text-[#081546]/50 font-bold mb-6">
              How it works
            </div>
            <div className="grid grid-cols-3 gap-6">
              {[
                {
                  n: "01",
                  title: "Doorstep pickup",
                  body:
                    "A vetted Travelyt agent comes to your door, weighs your bags, and seals each one.",
                },
                {
                  n: "02",
                  title: "Tracked transit",
                  body:
                    "Bags are transported to the airport with GPS tracking and a tamper-evident seal log.",
                },
                {
                  n: "03",
                  title: "Hands-free arrival",
                  body:
                    "Meet your bags curbside on departure or have them delivered to your destination.",
                },
              ].map((step) => (
                <div key={step.n}>
                  <div className="text-[#c41e2a] text-2xl font-bold mb-2">
                    {step.n}
                  </div>
                  <div className="font-bold text-base mb-1.5">{step.title}</div>
                  <p className="text-sm leading-relaxed text-[#081546]/65">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Built for */}
          <div className="bg-[#081546] text-white px-12 py-9">
            <div className="text-xs uppercase tracking-[0.3em] text-white/50 font-bold mb-5">
              Built for
            </div>
            <div className="grid grid-cols-3 gap-6 text-sm leading-relaxed">
              <div>
                <div className="font-bold text-base mb-1.5 text-white">
                  Business travelers
                </div>
                <p className="text-white/70">
                  Move bag-free between meetings, hotels, and flights.
                </p>
              </div>
              <div>
                <div className="font-bold text-base mb-1.5 text-white">
                  Families
                </div>
                <p className="text-white/70">
                  Six bags, two kids, one stroller? Hand it off.
                </p>
              </div>
              <div>
                <div className="font-bold text-base mb-1.5 text-white">
                  Diplomats &amp; teams
                </div>
                <p className="text-white/70">
                  Coordinated handling for delegations and consular travel.
                </p>
              </div>
            </div>
          </div>

          {/* Promise + CTA */}
          <div className="px-12 py-10 flex items-end justify-between gap-12">
            <div className="max-w-[4.5in]">
              <div className="text-xs uppercase tracking-[0.3em] text-[#081546]/50 font-bold mb-3">
                Our promise
              </div>
              <p className="text-base leading-relaxed text-[#081546]/80">
                One job, done well. We pick up your bags. We move them with
                care. We deliver them where you&apos;re going. Tracked at every
                step. Sealed in transit. Fully insured.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.3em] text-[#c41e2a] font-bold mb-2">
                Reserve early
              </div>
              <div
                style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
                className="text-3xl font-bold leading-tight"
              >
                travelyt
                <br />
                .us
              </div>
            </div>
          </div>

          {/* Bottom band */}
          <div className="bg-[#c41e2a] text-white px-12 py-3 flex items-center justify-between text-[11px] uppercase tracking-[0.2em]">
            <span>Doorstep · Airport · Destination</span>
            <span>{SITE_HOST}</span>
          </div>
        </div>
      </div>
    </>
  );
}
