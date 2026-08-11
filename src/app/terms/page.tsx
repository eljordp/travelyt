import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Travelyt terms covering baggage pickup, passenger terminal handoff, authorized carrier handoff, delivery, pricing, insurance, and customer responsibilities.",
  alternates: {
    canonical: "/terms",
  },
};

const sections = [
  {
    title: "What Travelyt does",
    body: "Travelyt provides quote requests and launch-market coordination for baggage logistics services including doorstep pickup, weighing, sealing, tracking, passenger-present terminal handoff, and arrival delivery where available. In the standard departure service, Travelyt returns the sealed bags to the verified ticketed traveler at the terminal.",
  },
  {
    title: "What Travelyt does not do",
    body: "Travelyt is not an airline, TSA screening provider, or substitute for passenger check-in. Travelyt does not x-ray, clear, open a bag for screening, issue an airline baggage tag, or move a bag into a secure or badge-controlled area. The traveler remains responsible for airline check-in, document checks, baggage declarations, fees, and airline acceptance. Travelyt will tender a bag without the passenger present only when the carrier and station have explicitly authorized the receiving role, public handoff location, timing, carrier screening and tagging process, exceptions, and systems process for that service.",
  },
  {
    title: "Customer responsibilities",
    body: "Customers are responsible for accurate booking details, accessible pickup and delivery locations, compliance with airline and TSA baggage rules, completing required identity verification before custody handoff, and excluding restricted, illegal, unsafe, or undeclared high-value items.",
  },
  {
    title: "Identity verification",
    body: "Travelyt may require customers, travelers, drivers, employees, or handlers to complete an approved identity check before a live custody event. The available method may be manual during controlled launch operations or may use a configured identity provider. Refusal, mismatch, incomplete adult-traveler consent, or failed verification may delay, modify, or cancel service.",
  },
  {
    title: "Chain of custody",
    body: "Travelyt custody records may include verified account identity, driver or handler identity, GPS checkpoints, tamper-evident seal IDs, bag photos, customer approvals, passenger receipt, and authorized airline or airport receiving-party details when applicable. A handoff is not complete until the required proof for that operating mode is recorded. Carrier acceptance, screening, and baggage control remain with the carrier and TSA-controlled process.",
  },
  {
    title: "Restricted items",
    body: "Customers must follow the current TSA, PHMSA, airline, airport, and destination rules that apply to their trip. Travelyt may use a stricter controlled-custody exclusion list and may refuse a bag that contains, appears to contain, or is declared to contain prohibited, hazardous, illegal, perishable, fragile, irreplaceable, or inadequately documented items. Customer acceptance does not override a carrier or government restriction.",
  },
  {
    title: "Operating authorization",
    body: "Travelyt will not open a live service lane until the operating model, required state or federal carrier authority, commercial vehicle and airport access rules, insurance filings, driver classification and screening, and local permits have been reviewed for that lane. A carrier partnership does not replace those requirements, and the absence of a carrier integration does not authorize passenger-absent airline tender.",
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
