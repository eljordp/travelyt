"use client";

import Image from "next/image";

export default function BusinessCardsPage() {
  return (
    <>
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .card-screen-wrap { padding: 0 !important; background: white !important; min-height: auto !important; }
          .card-controls, .card-note { display: none !important; }
          .card-pair { gap: 0.25in !important; page-break-inside: avoid; }
          .card-face { box-shadow: none !important; }
        }
        .card-face {
          width: 3.5in;
          height: 2in;
          position: relative;
          overflow: hidden;
          color: #081546;
          font-family: var(--font-geist-sans), Inter, sans-serif;
        }
        .card-face-front {
          background: #ffffff;
          border: 1px solid #e6e6e6;
        }
        .card-face-back {
          background: #081546;
          color: #ffffff;
        }
        .card-bleed-guide {
          position: absolute;
          inset: 0.125in;
          border: 1px dashed rgba(0, 0, 0, 0.15);
          pointer-events: none;
        }
        @media print {
          .card-bleed-guide { display: none; }
        }
      `}</style>

      <div className="card-screen-wrap min-h-screen bg-[#1a1a1a] py-10 px-4">
        {/* Screen-only controls */}
        <div className="card-controls max-w-[8in] mx-auto mb-6 flex flex-wrap items-center justify-between gap-2 text-white/70 text-xs">
          <span>Print-ready business card · 3.5&quot; × 2&quot; (US standard)</span>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            Print / Save PDF →
          </button>
        </div>

        {/* Card pair: Front + Back side by side */}
        <div className="card-pair mx-auto flex w-full max-w-[8in] flex-wrap items-start justify-center gap-8">
          {/* FRONT */}
          <div className="card-face card-face-front shadow-2xl">
            <div className="card-bleed-guide" />

            <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
              {/* Logo */}
              <div className="relative w-[2in] h-[0.9in]">
                <Image
                  src="/logo.png"
                  alt="Travelyt"
                  fill
                  className="object-contain"
                  sizes="200px"
                  priority
                />
              </div>

              {/* Slogan */}
              <p className="mt-[0.05in] text-[10pt] font-medium italic text-[#ff6868] tracking-wide">
                Travel light, arrive smart.
              </p>
            </div>

            {/* Small coral mark bottom-right */}
            <div className="absolute bottom-[0.18in] right-[0.22in] flex items-center gap-1.5">
              <span className="block w-1 h-1 rounded-full bg-[#ff6868]" />
              <span className="block w-1 h-1 rounded-full bg-[#ff6868]/60" />
              <span className="block w-1 h-1 rounded-full bg-[#ff6868]/30" />
            </div>
          </div>

          {/* BACK */}
          <div className="card-face card-face-back shadow-2xl">
            <div className="card-bleed-guide" />

            {/* Top: wordmark */}
            <div className="absolute top-[0.22in] left-[0.28in] flex items-center gap-1.5">
              <span className="text-[9pt] font-bold tracking-tight text-white">Travelyt</span>
              <span className="block w-1 h-1 rounded-full bg-[#ff6868]" />
            </div>

            {/* Middle: team identity */}
            <div className="absolute left-[0.28in] top-[0.55in]">
              <p className="text-[11pt] font-bold leading-tight tracking-tight text-white">
                Travelyt Operations
              </p>
              <p className="mt-[0.02in] text-[8pt] font-medium uppercase tracking-[0.15em] text-[#ff6868]">
                Baggage Service Team
              </p>
            </div>

            {/* Bottom: contact */}
            <div className="absolute bottom-[0.22in] left-[0.28in] right-[0.28in] flex items-end justify-between gap-3">
              <div className="space-y-[0.04in] text-[8pt] text-white/85 leading-tight">
                <p>support@travelyt.us</p>
                <p className="text-white/65">travelyt.us</p>
              </div>

              <p className="text-[6.5pt] text-right text-white/60 max-w-[1.2in] leading-tight italic">
                We move your bags.<br />You move freely.
              </p>
            </div>
          </div>
        </div>

        {/* Screen-only note */}
        <div className="card-note max-w-[8in] mx-auto mt-10 text-white/55 text-xs leading-relaxed space-y-2">
          <p>
            <strong className="text-white/80">Print notes:</strong> Cards are sized to US standard 3.5&quot; × 2&quot;. The dashed border is a safe-area guide that prints invisibly — keep critical content inside it.
          </p>
          <p>
            For a print shop, export this page as PDF (Cmd/Ctrl+P → Save as PDF) and request &quot;double-sided business card, 3.5×2 inch, no bleed required.&quot;
          </p>
          <p>
            This generic operations card is ready for internal print tests. Duplicate it for named team members only after confirming the exact title, email, and phone number to print.
          </p>
        </div>
      </div>
    </>
  );
}
