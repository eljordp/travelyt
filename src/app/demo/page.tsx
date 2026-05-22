import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Car, CreditCard, FileText, Route, Send } from "lucide-react";

const demoSteps = [
  {
    icon: <Send className="h-6 w-6" strokeWidth={1.7} />,
    title: "Create a sample quote",
    body: "Starts the traveler flow with LAX and departure pickup prefilled.",
    href: "/quote?service=departure&airport=LAX&date=2026-06-15",
    cta: "Start quote",
  },
  {
    icon: <CreditCard className="h-6 w-6" strokeWidth={1.7} />,
    title: "Continue to payment",
    body: "The quote flow creates a demo booking and sends you to the payment screen.",
    href: "/quote?service=departure&airport=LAX&date=2026-06-15",
    cta: "Create booking",
  },
  {
    icon: <Car className="h-6 w-6" strokeWidth={1.7} />,
    title: "Open driver console",
    body: "Use the courier view to assign, update, and upload proof for demo bookings.",
    href: "/driver",
    cta: "Open driver",
  },
  {
    icon: <FileText className="h-6 w-6" strokeWidth={1.7} />,
    title: "Print the flyer",
    body: "A shareable one-page handout for partner conversations and demos.",
    href: "/flyer",
    cta: "View flyer",
  },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#f5f0ee]">
      <Navbar />

      <main className="pt-28">
        <section className="px-6 pb-16 pt-10">
          <div className="mx-auto max-w-5xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#ff6b6b]">
              Prototype Demo
            </span>
            <h1 className="mt-3 text-4xl font-bold text-navy md:text-6xl">
              Try the working Travelyt flow
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-navy/70">
              The public site explains the service. This page surfaces the
              actual demo: quote request, booking/payment prototype, courier
              console, tracking updates, proof upload, and print flyer.
            </p>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
            {demoSteps.map((step) => (
              <Link
                key={step.title}
                href={step.href}
                className="group rounded-2xl border border-gray-100 bg-white p-7 shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy/10"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#ff6b6b]/10 text-[#ff6b6b]">
                  {step.icon}
                </div>
                <h2 className="text-xl font-bold text-navy">{step.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-navy/70">
                  {step.body}
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#ff6b6b]">
                  {step.cta}
                  <Route className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
