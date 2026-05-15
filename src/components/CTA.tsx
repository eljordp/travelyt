import Link from "next/link";
import LeadCapture from "./LeadCapture";

export default function CTA() {
  return (
    <section id="early-access" className="py-20 md:py-28 bg-gradient-to-r from-purple to-purple-light text-white">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-6">
          Ready to travel differently?
        </h2>
        <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Pre-launch — early customers and partner inquiries welcome. Tell us
          where you&apos;re flying and we&apos;ll be in touch.
        </p>
        <LeadCapture source="bottom-cta" />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/quote"
            className="mt-6 bg-white/10 border border-white/25 text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-white/15 transition-colors"
          >
            Go straight to quote
          </Link>
          <Link
            href="/#how-it-works"
            className="mt-6 border border-white/25 text-white px-6 py-3 rounded-full font-semibold text-sm hover:bg-white/10 transition-colors"
          >
            See how it works
          </Link>
        </div>
      </div>
    </section>
  );
}
