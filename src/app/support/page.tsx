import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Contact Travelyt support for quote requests, booking help, privacy questions, and account deletion.",
  alternates: {
    canonical: "/support",
  },
};

const SUPPORT_EMAIL = "support@travelyt.app";
const PRIVACY_EMAIL = "privacy@travelyt.app";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#c41e2a]">
            Support
          </p>
          <h1 className="mb-4 text-4xl font-bold text-navy md:text-5xl">
            How can we help?
          </h1>
          <p className="mb-10 leading-relaxed text-navy/70">
            Travelyt is currently accepting quote requests and coordinating
            early launch routes. Send us your booking, account, or privacy
            question and we&apos;ll route it to the right person.
          </p>

          <div className="grid gap-4">
            <section className="rounded-2xl border border-navy/10 p-5">
              <h2 className="text-lg font-bold text-navy">Booking support</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy/70">
                For quote requests, route availability, bag handoff questions,
                or launch timing, email{" "}
                <a className="font-semibold text-[#c41e2a]" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>

            <section className="rounded-2xl border border-navy/10 p-5">
              <h2 className="text-lg font-bold text-navy">Account and data</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy/70">
                You can delete your account from Profile → Settings in the app.
                For privacy requests or help deleting data, email{" "}
                <a className="font-semibold text-[#c41e2a]" href={`mailto:${PRIVACY_EMAIL}`}>
                  {PRIVACY_EMAIL}
                </a>
                .
              </p>
            </section>

            <section className="rounded-2xl border border-navy/10 p-5">
              <h2 className="text-lg font-bold text-navy">Legal links</h2>
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                <Link className="text-[#c41e2a]" href="/privacy">
                  Privacy Policy
                </Link>
                <Link className="text-[#c41e2a]" href="/terms">
                  Terms of Service
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
