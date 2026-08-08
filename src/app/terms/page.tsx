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
    body: "Customers are responsible for accurate booking details, accessible pickup and delivery locations, compliance with airline and TSA baggage rules, completing required identity verification before custody handoff, and excluding restricted, illegal, unsafe, or undeclared high-value items.",
  },
  {
    title: "Identity verification",
    body: "Travelyt may require customers, drivers, employees, or handlers to verify identity using a driver's license, passport, employee credential, selfie, liveness video, or similar check before a live custody event. Refusal or failed verification may delay, modify, or cancel service.",
  },
  {
    title: "Chain of custody",
    body: "Travelyt custody records may include verified account identity, driver or handler identity, GPS checkpoints, tamper-evident seal IDs, bag photos, customer approvals, and airline or airport receiving-party details. A bag handoff is not considered complete until Travelyt records the required proof for that stage, including airline or airport acceptance when applicable.",
  },
  {
    title: "Restricted items",
    body: "Travelyt follows the same restricted-item baseline used across the luggage shipping industry (Luggage Forward, Send My Bag, My Baggage). Do not pack: firearms, explosives, ammunition, flammable liquids, aerosols and pressurized containers (deodorant, hairspray, spray paint), loose batteries and power banks, perishable food (produce, dairy, meat, fish, nuts, seeds), cash, money orders, irreplaceable documents, medications, tobacco, alcohol, jewelry, precious metals, artwork, musical instruments, or fragile valuables. Lithium batteries are accepted only when installed in a working device and limited to one such device per shipment, consistent with unaccompanied baggage air security regulations. Items shipped against this list move at the customer's own risk and are excluded from coverage.",
  },
  {
    title: "Coverage and claims",
    body: "Travelyt will not begin live custody until insurance is bound for the final driver, vehicle, route, and custody model. A value entered during booking is a request for manual review and does not itself create or increase coverage. The final binder, policy, confirmed booking terms, exclusions, limits, documentation requirements, and claim deadlines control. If those terms are not confirmed before pickup, Travelyt must cancel or reschedule the custody event. Restricted items remain excluded and prohibited regardless of any declared value.",
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
    title: "Launch status and payment",
    body: "Travelyt is onboarding customers, partners, and service markets in phases. Users can request service, see an estimated total, and pay through secure third-party checkout where available. Payment reserves the request; Travelyt still confirms operational availability, timing, pricing, coverage, and service-area constraints before custody begins. If a route cannot be served, Travelyt may modify, cancel, or refund the request as appropriate.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-sm font-semibold text-[#ff6868] uppercase tracking-wider mb-3">
            Legal
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mb-4">
            Terms of Service
          </h1>
          <p className="text-navy/70 leading-relaxed mb-10">
            These terms explain how Travelyt quotes, confirms, and operates
            baggage pickup, custody, tracking, and delivery services.
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
