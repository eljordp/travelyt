import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Travelyt privacy policy covering quote requests, booking information, tracking updates, and customer communications.",
  alternates: {
    canonical: "/privacy",
  },
};

const sections = [
  {
    title: "Information we collect",
    body: "When you request a quote or create a booking, we collect the contact, trip, address, flight, baggage, and instruction details needed to price and coordinate the service.",
  },
  {
    title: "How we use it",
    body: "We use this information to respond to quote requests, coordinate pickups and deliveries, send status updates, maintain chain-of-custody records, prevent misuse, and improve Travelyt operations.",
  },
  {
    title: "Sharing",
    body: "We share booking details only with people and providers needed to operate the service, such as assigned agents, communications providers, payment processors, and insurance or claims partners when applicable.",
  },
  {
    title: "Tracking and custody data",
    body: "For active bookings, we may generate timestamps, location checkpoints, seal IDs, bag photos, and proof-of-service records so customers can verify the status of their luggage.",
  },
  {
    title: "Your choices",
    body: "You can request access, correction, or deletion of your personal information through the quote or early-access forms while Travelyt is in pre-launch. Some operational records may be retained when needed for security, legal, accounting, or dispute-resolution reasons.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-sm font-semibold text-[#c41e2a] uppercase tracking-wider mb-3">
            Legal
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-navy mb-4">
            Privacy Policy
          </h1>
          <p className="text-navy/70 leading-relaxed mb-10">
            This page summarizes how Travelyt handles customer information for
            quotes, bookings, tracking, and support. It is written for launch
            clarity and should be reviewed by counsel before broad commercial
            rollout.
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

          <section id="cookies" className="mt-12 rounded-2xl bg-[#f5f0ee] p-6">
            <h2 className="text-xl font-bold text-navy mb-2">Cookies</h2>
            <p className="text-navy/70 leading-relaxed">
              Travelyt may use essential cookies or local storage to support
              login state, demo bookings, quote progress, analytics, and site
              security. You can control cookies through your browser settings.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
