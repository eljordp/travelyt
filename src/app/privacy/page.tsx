import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Travelyt privacy policy covering quote requests, booking information, tracking updates, payments, and customer communications.",
  alternates: {
    canonical: "/privacy",
  },
};

const LAST_UPDATED = "May 15, 2026";
const CONTACT_EMAIL = "privacy@travelyt.app";

const sections: { title: string; body: string }[] = [
  {
    title: "Information we collect",
    body:
      "When you request a quote, create a booking, or contact support, we collect identifiers and trip details you provide directly: full name, email address, phone number, pickup and delivery addresses, travel dates, flight numbers, number and description of bags, and any handling notes. When you pay, our payment processor collects card or wallet details on our behalf — we do not store full card numbers on our systems. For active bookings, we also generate operational records (timestamps, location checkpoints, seal IDs, bag photos, signatures, and proof-of-service images) needed to maintain chain of custody. If you create an account, we store your login credentials and account preferences. We may also collect basic device information (browser type, IP address, app version, crash logs) for security, fraud prevention, and product improvement.",
  },
  {
    title: "How we use it",
    body:
      "We use your information to respond to quotes, coordinate pickups and deliveries, complete payments, send service updates (SMS, email, and push notifications), maintain chain-of-custody and insurance records, support claims and disputes, prevent misuse and fraud, comply with legal obligations, and improve Travelyt operations. We do not sell your personal information, and we do not use it for cross-context behavioral advertising.",
  },
  {
    title: "Who we share it with",
    body:
      "We share booking and contact details only with the people and providers required to operate the service: assigned drivers and handlers, our shipping and carrier partners (including MEA-Ship and DHL when bags are tendered for air transport), our payment processor (Stripe), our communications providers (SMS and email delivery), our hosting and analytics providers, our insurance and claims partners, and our legal and accounting advisors. We may disclose information to law enforcement or other authorities when required by law, subpoena, or court order, or when needed to protect Travelyt, our customers, or the public.",
  },
  {
    title: "Tracking and custody data",
    body:
      "For active bookings, we generate and retain timestamps, GPS location checkpoints, tamper-evident seal IDs, bag photos, driver and handler IDs, and proof-of-service signatures or photos. This data is used to verify chain of custody, support insurance claims, and let you and authorized recipients track your bags in real time.",
  },
  {
    title: "Push notifications",
    body:
      "If you opt in, we send push notifications for booking confirmations, pickup and delivery status, driver assignments, exception alerts, and limited service announcements. You can disable push notifications at any time from your device's notification settings or your in-app preferences.",
  },
  {
    title: "Cookies and local storage",
    body:
      "Travelyt uses essential cookies and local storage to support login state, save in-progress quotes, remember preferences, and protect against abuse. We may also use analytics tools that set cookies to measure aggregate usage. You can control cookies through your browser settings; disabling essential cookies may prevent parts of Travelyt from working.",
  },
  {
    title: "Data retention",
    body:
      "We retain quote requests for up to 24 months. We retain completed booking records, chain-of-custody data, and payment records for as long as needed to provide service, handle claims, comply with tax and accounting laws, and resolve disputes — typically 7 years for financial records and 3 years for operational records, unless a longer period is required by law. Account data is retained while your account is active and deleted on request as described below.",
  },
  {
    title: "Security",
    body:
      "We protect personal information using HTTPS in transit, encrypted databases at rest, access controls on internal systems, role-based permissions, audit logs, and vetted handlers with background checks. No system is perfectly secure; if a breach affects you, we will notify you and the relevant authorities as required by law.",
  },
  {
    title: "Your rights",
    body:
      "You have the right to access, correct, delete, or export your personal information, and to object to or restrict certain processing. California residents have additional rights under the CCPA, including the right to know what we collect, the right to delete, the right to correct, the right to opt out of sale or sharing (we do not sell), and the right to non-discrimination. Residents of the EU/EEA and UK have rights under the GDPR and UK GDPR, including the right to lodge a complaint with your local supervisory authority. To exercise any of these rights, email " +
      CONTACT_EMAIL +
      ".",
  },
  {
    title: "Account and data deletion",
    body:
      "You can delete your account and request deletion of your personal information at any time. From the app or website, go to Profile → Settings → Delete Account, or email " +
      CONTACT_EMAIL +
      ". We will confirm your identity, delete your account and personal information within 30 days, and retain only the records we are legally required to keep (such as financial records and chain-of-custody logs for completed bookings).",
  },
  {
    title: "Children's privacy",
    body:
      "Travelyt is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us information, contact us at " +
      CONTACT_EMAIL +
      " and we will delete it.",
  },
  {
    title: "International transfers",
    body:
      "Travelyt is operated from the United States. If you use Travelyt from outside the US, your information may be transferred to, stored, and processed in the US and other countries where our service providers operate. Where required, we rely on appropriate safeguards such as Standard Contractual Clauses.",
  },
  {
    title: "Third-party services",
    body:
      "Travelyt integrates with third-party services including Stripe (payments), our SMS and email providers, our hosting and analytics providers, MEA-Ship and DHL (carrier partners), and mobile platform services from Apple and Google when you use our app. These providers process information under their own privacy policies and our data-processing agreements with them.",
  },
  {
    title: "Changes to this policy",
    body:
      "We may update this policy as Travelyt evolves. When we make material changes, we will update the date below and, where appropriate, notify you by email or in-app notice before the changes take effect.",
  },
  {
    title: "Contact",
    body:
      "Questions, requests, or complaints about privacy can be sent to " +
      CONTACT_EMAIL +
      ". We respond to verified requests within 30 days.",
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
          <p className="text-sm text-navy/60 mb-2">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="text-navy/70 leading-relaxed mb-10">
            This policy explains what information Travelyt collects when you
            use our website, mobile app, or service, how we use it, who we
            share it with, and your rights. It applies to all Travelyt
            customers, account holders, and visitors.
          </p>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold text-navy mb-2">
                  {section.title}
                </h2>
                <p className="text-navy/70 leading-relaxed whitespace-pre-line">
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          <p className="mt-12 text-sm text-navy/50">
            This summary is written for clarity and operational use. Final
            review by counsel is recommended before broad commercial rollout.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
