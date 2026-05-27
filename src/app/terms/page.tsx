import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Travelyt terms covering baggage pickup, airport handoff, delivery, restricted items, pricing, insurance, and customer responsibilities.",
  alternates: {
    canonical: "/terms",
  },
};

const sections = [
  {
    title: "What Travelyt does",
    body: "Travelyt provides quote requests and launch-market coordination for baggage logistics services including doorstep pickup, weighing, sealing, tracking, airport curbside or designated-area handoff, and arrival delivery where available.",
  },
  {
    title: "What Travelyt does not do",
    body: "Travelyt is not an airline and does not check bags at the airline counter on behalf of a ticketed passenger. Airline baggage fees, counter acceptance, and airline baggage rules remain separate from Travelyt service fees.",
  },
  {
    title: "Customer responsibilities",
    body: "Customers are responsible for accurate booking details, accessible pickup and delivery locations, compliance with airline and TSA baggage rules, and excluding restricted, illegal, unsafe, or undeclared high-value items.",
  },
  {
    title: "Restricted items",
    body: "Travelyt follows the same restricted-item baseline used across the luggage shipping industry (Luggage Forward, Send My Bag, My Baggage). Do not pack: firearms, explosives, ammunition, flammable liquids, aerosols and pressurized containers (deodorant, hairspray, spray paint), loose batteries and power banks, perishable food (produce, dairy, meat, fish, nuts, seeds), cash, money orders, irreplaceable documents, medications, tobacco, alcohol, jewelry, precious metals, artwork, musical instruments, or fragile valuables. Lithium batteries are accepted only when installed in a working device and limited to one such device per shipment, consistent with unaccompanied baggage air security regulations. Items shipped against this list move at the customer's own risk and are excluded from coverage.",
  },
  {
    title: "Insurance and claims",
    body: "Standard coverage is capped at $500 per bag while in Travelyt custody, requires the tamper-evident seal to be intact at delivery, and applies only to adequately packaged contents. This cap mirrors industry practice for door-to-airport baggage couriers (for example, Luggage Forward also caps at $500 per item). Higher coverage is available through a declared-value upsell at booking; the upsell cap, premium, and required documentation are confirmed before pickup. Damage claims must be filed within 15 days of the actual delivery date and lost-item claims within 30 days of the expected delivery date, both with photos, receipts, and the chain-of-custody record. The following are excluded from coverage regardless of declared value: damage to protruding or external parts of luggage (wheels, handles, straps, pockets), damage caused by inadequate packaging, normal wear and tear, cosmetic damage (scratches, dents, scuffs, stains, residue from tape or labels), and any item category listed under Restricted items.",
  },
  {
    title: "AI and automated processing",
    body: "Travelyt uses automated systems and artificial intelligence to support internal operations — including booking triage, chain-of-custody reporting, route and dispatch optimization, anomaly detection on bag photos and seal scans, and aggregate service analytics. These systems operate on booking and operational data described in our Privacy Policy and are restricted to internal use. Travelyt does not use customer trip data to train third-party AI models, and any AI features that interact directly with customers (such as a support assistant) are clearly identified and run on a separate, scoped system without access to full account or payment records.",
  },
  {
    title: "Limitations of AI outputs",
    body: "Automated outputs — including estimated arrival windows, suggested routes, dispatch decisions, status summaries, and reporting — are provided for operational convenience and may contain errors. Travelyt does not warrant that automated outputs are complete, accurate, or current, and customers should rely on confirmed booking records, chain-of-custody scans, and direct communications from Travelyt staff for binding service details. Travelyt's liability for any AI-generated output is limited to the same caps that apply to the underlying service under these terms.",
  },
  {
    title: "Pre-launch status",
    body: "Travelyt is onboarding early customers, partners, and launch markets. In this launch version, users can request service and receive confirmation before any payment is collected. Availability, timing, pricing, coverage, and service areas may change as operations are finalized.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider mb-3">
            Legal
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mb-4">
            Terms of Service
          </h1>
          <p className="text-navy/70 leading-relaxed mb-10">
            These terms provide a plain-language operating baseline for the
            current Travelyt site. They should be reviewed and finalized by
            counsel before broad paid public launch.
          </p>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold text-navy mb-2">
                  {section.title}
                </h2>
                <p className="text-navy/70 leading-relaxed">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
