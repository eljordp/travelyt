"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowRight, Plane } from "lucide-react";

type VariantId = "field" | "boarding" | "plane" | "split";

const VARIANTS: { id: VariantId; name: string; description: string }[] = [
  { id: "field", name: "Field Trip", description: "Photo front, deep navy gradient, coral mark — feels like the airport corridor itself." },
  { id: "boarding", name: "Boarding Pass", description: "Designed like a Travelyt boarding pass. Travel-coded, instantly recognizable." },
  { id: "plane", name: "The Plane", description: "Bold coral plane on deep navy. Brand-mark forward — for when the logo speaks for itself." },
  { id: "split", name: "Split", description: "Half photo, half coral block. Asymmetric, modern — feels designed, not stock." },
];

export default function BusinessCardVariantsPage() {
  const [printing, setPrinting] = useState<VariantId | null>(null);

  function printVariant(id: VariantId) {
    setPrinting(id);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 300);
    }, 50);
  }

  return (
    <>
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .gallery-wrap { padding: 0 !important; background: white !important; min-height: auto !important; }
          .gallery-controls, .gallery-note, .variant-header { display: none !important; }
          .variant-block { display: none !important; page-break-inside: avoid; }
          .variant-block[data-printing="true"] { display: block !important; }
          .card-face { box-shadow: none !important; }
        }
        .card-face {
          width: 3.5in;
          height: 2in;
          position: relative;
          overflow: hidden;
          color: #081546;
          font-family: var(--font-geist-sans), Inter, sans-serif;
          border-radius: 0;
        }
      `}</style>

      <div className="gallery-wrap min-h-screen bg-[#0a0f1f] py-10 px-4">
        {/* Header */}
        <div className="gallery-controls max-w-[8in] mx-auto mb-10 text-white/80">
          <h1 className="text-2xl font-bold text-white">Travelyt — card variants</h1>
          <p className="mt-2 text-sm text-white/55">
            Four directions. Each prints standalone — pick a favorite and run with it. The clean minimal version lives at{" "}
            <a href="/business-cards" className="text-[#ff6868] underline hover:text-[#ff8a8a]">
              /business-cards
            </a>
            .
          </p>
        </div>

        <div className="max-w-[8in] mx-auto space-y-16">
          {/* VARIANT 1 — FIELD TRIP (Photo Front) */}
          <div className="variant-block" data-printing={printing === "field"}>
            <div className="variant-header mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#ff6868]">Variant 01</p>
                <h2 className="mt-1 text-lg font-bold text-white">{VARIANTS[0].name}</h2>
                <p className="mt-1 text-xs text-white/55 max-w-md">{VARIANTS[0].description}</p>
              </div>
              <button
                onClick={() => printVariant("field")}
                className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white transition-colors"
              >
                Print this variant
              </button>
            </div>

            <div className="flex items-start justify-center gap-8 flex-wrap">
              {/* Front — Photo */}
              <div className="card-face shadow-2xl">
                <Image
                  src="/carousel/pexels-business-traveler.jpg"
                  alt=""
                  fill
                  className="object-cover"
                  sizes="350px"
                  style={{ objectPosition: "center 25%" }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#081546]/40 via-[#081546]/30 to-[#081546]/95" />

                {/* Top: coral mark */}
                <div className="absolute top-[0.22in] left-[0.28in] flex items-center gap-1.5">
                  <span className="block w-1.5 h-1.5 rounded-full bg-[#ff6868]" />
                  <span className="text-[7pt] uppercase tracking-[0.22em] text-white/85 font-semibold">
                    Travelyt
                  </span>
                </div>

                {/* Bottom: slogan */}
                <div className="absolute bottom-[0.24in] left-[0.28in] right-[0.28in]">
                  <p className="text-[14pt] font-bold leading-tight text-white tracking-tight">
                    Travel light,
                  </p>
                  <p className="text-[14pt] font-bold leading-tight text-[#ff6868] tracking-tight italic">
                    arrive smart.
                  </p>
                </div>
              </div>

              {/* Back — White contact */}
              <div className="card-face shadow-2xl bg-white border border-gray-200">
                <div className="absolute top-[0.22in] left-[0.28in] flex items-center gap-1.5">
                  <span className="text-[9pt] font-bold tracking-tight text-[#081546]">Travelyt</span>
                  <span className="block w-1 h-1 rounded-full bg-[#ff6868]" />
                </div>

                <div className="absolute left-[0.28in] top-[0.55in]">
                  <p className="text-[11pt] font-bold leading-tight tracking-tight text-[#081546]">
                    [ Full Name ]
                  </p>
                  <p className="mt-[0.02in] text-[8pt] font-medium uppercase tracking-[0.15em] text-[#ff6868]">
                    [ Role / Title ]
                  </p>
                </div>

                <div className="absolute bottom-[0.22in] left-[0.28in] right-[0.28in]">
                  <div className="space-y-[0.04in] text-[8pt] text-[#081546]/85 leading-tight">
                    <p>[ +1 (000) 000-0000 ]</p>
                    <p>[ name@travelyt.com ]</p>
                    <p className="text-[#081546]/60">travelyt.app</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VARIANT 2 — BOARDING PASS */}
          <div className="variant-block" data-printing={printing === "boarding"}>
            <div className="variant-header mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#ff6868]">Variant 02</p>
                <h2 className="mt-1 text-lg font-bold text-white">{VARIANTS[1].name}</h2>
                <p className="mt-1 text-xs text-white/55 max-w-md">{VARIANTS[1].description}</p>
              </div>
              <button
                onClick={() => printVariant("boarding")}
                className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white transition-colors"
              >
                Print this variant
              </button>
            </div>

            <div className="flex items-start justify-center gap-8 flex-wrap">
              {/* Front — Boarding pass */}
              <div className="card-face shadow-2xl bg-[#fdfbf7] border border-gray-200 flex">
                {/* Main pass area */}
                <div className="relative flex-1 px-[0.22in] py-[0.18in]">
                  {/* Header strip */}
                  <div className="flex items-center justify-between">
                    <p className="text-[7pt] uppercase tracking-[0.22em] text-[#081546]/55 font-semibold">
                      Travelyt Boarding Pass
                    </p>
                    <span className="block w-1.5 h-1.5 rounded-full bg-[#ff6868]" />
                  </div>

                  {/* Center: large brand */}
                  <div className="mt-[0.18in]">
                    <p className="text-[7pt] uppercase tracking-[0.18em] text-[#081546]/55 font-semibold">Passenger</p>
                    <p className="text-[12pt] font-bold leading-tight text-[#081546] tracking-tight">
                      [ Full Name ]
                    </p>
                  </div>

                  {/* Bottom row: from/to style codes */}
                  <div className="absolute bottom-[0.18in] left-[0.22in] right-[0.22in] flex items-end justify-between">
                    <div>
                      <p className="text-[6.5pt] uppercase tracking-[0.18em] text-[#081546]/55 font-semibold">Door</p>
                      <p className="text-[14pt] font-bold leading-none text-[#081546] tracking-tight">
                        HOME
                      </p>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 text-[#ff6868] mb-1" strokeWidth={3} />

                    <div className="text-right">
                      <p className="text-[6.5pt] uppercase tracking-[0.18em] text-[#081546]/55 font-semibold">Gate</p>
                      <p className="text-[14pt] font-bold leading-none text-[#ff6868] tracking-tight">
                        TVT
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stub — perforated edge */}
                <div className="relative w-[0.85in] bg-[#081546] text-white px-[0.14in] py-[0.18in]">
                  {/* Notches */}
                  <div className="absolute -left-[0.06in] top-1/2 -translate-y-1/2 w-[0.12in] h-[0.12in] rounded-full bg-[#0a0f1f]" />
                  <div className="absolute -left-[0.04in] top-0 bottom-0 flex flex-col justify-around py-[0.05in]">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <span key={i} className="block w-[0.04in] h-[0.04in] rounded-full bg-[#0a0f1f]" />
                    ))}
                  </div>

                  <div className="flex h-full flex-col justify-between">
                    <div>
                      <p className="text-[6pt] uppercase tracking-[0.18em] text-white/55 font-semibold">Class</p>
                      <p className="text-[8pt] font-bold leading-tight text-[#ff6868]">Hands-free</p>
                    </div>

                    <div>
                      <p className="text-[6pt] uppercase tracking-[0.18em] text-white/55 font-semibold">Status</p>
                      <p className="text-[8pt] font-bold leading-tight text-white">Sealed ✓</p>
                    </div>

                    <div>
                      <p className="text-[6pt] uppercase tracking-[0.18em] text-white/55 font-semibold">Seat</p>
                      <p className="text-[8pt] font-bold leading-tight text-white">[ Role ]</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Back — Contact */}
              <div className="card-face shadow-2xl bg-[#fdfbf7] border border-gray-200">
                <div className="absolute top-[0.22in] left-[0.28in] flex items-center gap-1.5">
                  <Plane className="h-3 w-3 text-[#ff6868]" fill="currentColor" strokeWidth={1} />
                  <span className="text-[9pt] font-bold tracking-tight text-[#081546]">Travelyt</span>
                </div>

                <div className="absolute right-[0.28in] top-[0.22in]">
                  <p className="text-[6.5pt] uppercase tracking-[0.18em] text-[#081546]/55 font-semibold">Travel light</p>
                  <p className="text-[6.5pt] uppercase tracking-[0.18em] text-[#ff6868] font-semibold text-right">Arrive smart</p>
                </div>

                <div className="absolute left-[0.28in] right-[0.28in] top-[0.65in] border-t border-dashed border-[#081546]/15" />

                <div className="absolute left-[0.28in] right-[0.28in] bottom-[0.24in] flex items-end justify-between">
                  <div className="space-y-[0.04in] text-[8pt] text-[#081546]/85 leading-tight">
                    <p>[ +1 (000) 000-0000 ]</p>
                    <p>[ name@travelyt.com ]</p>
                    <p className="text-[#081546]/60">travelyt.app</p>
                  </div>

                  <p className="text-[6pt] uppercase tracking-[0.2em] text-[#081546]/45 text-right max-w-[1in] leading-snug">
                    We move<br />your bags
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* VARIANT 3 — THE PLANE */}
          <div className="variant-block" data-printing={printing === "plane"}>
            <div className="variant-header mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#ff6868]">Variant 03</p>
                <h2 className="mt-1 text-lg font-bold text-white">{VARIANTS[2].name}</h2>
                <p className="mt-1 text-xs text-white/55 max-w-md">{VARIANTS[2].description}</p>
              </div>
              <button
                onClick={() => printVariant("plane")}
                className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white transition-colors"
              >
                Print this variant
              </button>
            </div>

            <div className="flex items-start justify-center gap-8 flex-wrap">
              {/* Front — Plane on Navy */}
              <div className="card-face shadow-2xl bg-[#081546] text-white">
                {/* Coral plane silhouette + contrail */}
                <svg
                  viewBox="0 0 350 200"
                  className="absolute inset-0 w-full h-full"
                  preserveAspectRatio="xMidYMid slice"
                >
                  <path
                    d="M -20 180 Q 90 130 180 95 T 380 30"
                    stroke="#ff6868"
                    strokeWidth="2.5"
                    fill="none"
                    opacity="0.55"
                    strokeLinecap="round"
                  />
                </svg>

                <Plane
                  className="absolute h-9 w-9 text-[#ff6868]"
                  style={{ top: "0.32in", right: "0.5in", transform: "rotate(-18deg)" }}
                  fill="currentColor"
                  strokeWidth={0.5}
                />

                {/* Wordmark */}
                <div className="absolute bottom-[0.32in] left-[0.32in]">
                  <p className="text-[20pt] font-bold leading-none tracking-tight text-white">
                    Travel<span className="text-[#ff6868]">yt</span>
                  </p>
                  <p className="mt-[0.06in] text-[7pt] uppercase tracking-[0.22em] text-white/65 font-semibold">
                    Travel light, arrive smart
                  </p>
                </div>
              </div>

              {/* Back — Coral with contact */}
              <div className="card-face shadow-2xl bg-[#ff6868] text-white">
                <div className="absolute top-[0.22in] left-[0.28in] flex items-center gap-1.5">
                  <Plane className="h-3 w-3 text-white" fill="currentColor" strokeWidth={1} />
                  <span className="text-[9pt] font-bold tracking-tight text-white">Travelyt</span>
                </div>

                <div className="absolute left-[0.28in] top-[0.6in]">
                  <p className="text-[11pt] font-bold leading-tight tracking-tight text-white">
                    [ Full Name ]
                  </p>
                  <p className="mt-[0.02in] text-[8pt] font-medium uppercase tracking-[0.15em] text-white/85">
                    [ Role / Title ]
                  </p>
                </div>

                <div className="absolute bottom-[0.22in] left-[0.28in] right-[0.28in]">
                  <div className="space-y-[0.04in] text-[8pt] text-white/95 leading-tight">
                    <p>[ +1 (000) 000-0000 ]</p>
                    <p>[ name@travelyt.com ]</p>
                    <p className="text-white/75">travelyt.app</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VARIANT 4 — SPLIT */}
          <div className="variant-block" data-printing={printing === "split"}>
            <div className="variant-header mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#ff6868]">Variant 04</p>
                <h2 className="mt-1 text-lg font-bold text-white">{VARIANTS[3].name}</h2>
                <p className="mt-1 text-xs text-white/55 max-w-md">{VARIANTS[3].description}</p>
              </div>
              <button
                onClick={() => printVariant("split")}
                className="rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs text-white transition-colors"
              >
                Print this variant
              </button>
            </div>

            <div className="flex items-start justify-center gap-8 flex-wrap">
              {/* Front — Split: photo + coral block */}
              <div className="card-face shadow-2xl flex">
                <div className="relative w-[1.5in] h-full">
                  <Image
                    src="/carousel/pexels-frequent-flyer.jpg"
                    alt=""
                    fill
                    className="object-cover"
                    sizes="150px"
                    style={{ objectPosition: "center 30%" }}
                  />
                </div>
                <div className="relative flex-1 bg-[#ff6868] text-white px-[0.22in] py-[0.2in] flex flex-col justify-between">
                  <div>
                    <p className="text-[6.5pt] uppercase tracking-[0.22em] font-semibold text-white/85">
                      Travelyt
                    </p>
                  </div>
                  <div>
                    <p className="text-[12pt] font-bold leading-[1.05] tracking-tight">
                      Travel<br />light,
                    </p>
                    <p className="text-[12pt] font-bold leading-[1.05] tracking-tight italic text-white">
                      arrive<br />smart.
                    </p>
                  </div>
                </div>
              </div>

              {/* Back — Navy with horizontal divider */}
              <div className="card-face shadow-2xl bg-[#081546] text-white">
                <div className="absolute top-[0.22in] left-[0.28in] right-[0.28in] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9pt] font-bold tracking-tight text-white">Travelyt</span>
                    <span className="block w-1 h-1 rounded-full bg-[#ff6868]" />
                  </div>
                  <p className="text-[6pt] uppercase tracking-[0.2em] text-white/55 font-semibold">
                    Door to gate
                  </p>
                </div>

                <div className="absolute left-[0.28in] right-[0.28in] top-[0.55in]">
                  <p className="text-[11pt] font-bold leading-tight tracking-tight text-white">
                    [ Full Name ]
                  </p>
                  <p className="mt-[0.02in] text-[8pt] font-medium uppercase tracking-[0.15em] text-[#ff6868]">
                    [ Role / Title ]
                  </p>
                </div>

                <div className="absolute left-[0.28in] right-[0.28in] top-[1.15in] border-t border-[#ff6868]/30" />

                <div className="absolute bottom-[0.22in] left-[0.28in] right-[0.28in]">
                  <div className="space-y-[0.04in] text-[8pt] text-white/85 leading-tight">
                    <p>[ +1 (000) 000-0000 ]</p>
                    <p>[ name@travelyt.com ]</p>
                    <p className="text-white/60">travelyt.app</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="gallery-note max-w-[8in] mx-auto mt-16 text-white/55 text-xs leading-relaxed space-y-2">
          <p>
            <strong className="text-white/80">How to print one:</strong> Hit the &quot;Print this variant&quot; button on the card you want. The browser print dialog will only render that variant — pick &quot;Save as PDF&quot; for a print-shop file.
          </p>
          <p>
            Cards are 3.5&quot; × 2&quot; US standard. Replace placeholders before printing.
          </p>
        </div>
      </div>
    </>
  );
}
