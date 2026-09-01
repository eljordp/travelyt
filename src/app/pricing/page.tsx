import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleDollarSign, ShieldCheck } from "lucide-react";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import {
  ARRIVAL_ADDITIONAL_BAG_CENTS,
  ARRIVAL_INCLUDED_BAGS,
  EXPRESS_DISTANCE_RATE_CENTS,
  INCLUDED_DISTANCE_MILES,
  SERVICE_PRICES_CENTS,
  STANDARD_DISTANCE_RATE_CENTS,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Launch Pricing",
  description:
    "Travelyt planning prices for requested launch routes. A quote remains subject to route, capacity, coverage, and authorized handoff confirmation.",
  alternates: {
    canonical: "/pricing",
  },
};

const plans = [
  {
    name: "Departure pickup",
    price: SERVICE_PRICES_CENTS.departure / 100,
    unit: "planned base per bag",
    body: "The current request estimate covers departure pickup. It does not confirm a seamless carrier handoff; the exact service model and final price must be confirmed for the route.",
    features: [
      "Traveler, trip, and bag match",
      "Weight + condition evidence",
      "Numbered tamper-evident seal",
      "Recorded custody checkpoints",
      "Authorized receiving gate required",
    ],
  },
  {
    name: "Arrival delivery",
    price: SERVICE_PRICES_CENTS.arrival / 100,
    unit: `planned base for ${ARRIVAL_INCLUDED_BAGS} bags`,
    body: "A separate post-flight service, offered only where airport release authority and the delivery operating window are confirmed.",
    features: [
      "Airport release path confirmed first",
      "Recorded release evidence",
      "Delivery to an eligible address",
      "Customer receipt confirmation",
      `$${ARRIVAL_ADDITIONAL_BAG_CENTS / 100} planned additional-bag price`,
    ],
  },
];

const routeGates = [
  "Operating market and capacity",
  "Named agent, vehicle, and route",
  "Coverage bound for the final custody model",
  "Carrier and station receiving authorization where required",
  "Final timing, exceptions, and service price",
];

export default function PricingPage() {
  const standardDistanceRate = (STANDARD_DISTANCE_RATE_CENTS / 100).toFixed(2);
  const expressDistanceRate = (EXPRESS_DISTANCE_RATE_CENTS / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main>
        <section className="bg-gradient-to-b from-[#f5f0ee] to-white pb-16 pt-28">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6868]">
              Launch pricing
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight text-navy md:text-6xl">
              Clear planning prices. Confirmed route before custody.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-navy/70">
              These prices help travelers plan and submit a route request. They
              are not proof that a city, airline lane, delivery SLA, or insurance
              benefit is live.
            </p>
          </div>
        </section>

        <section className="pb-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid gap-6 md:grid-cols-2">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className="rounded-3xl border border-navy/10 bg-white p-8 shadow-lg shadow-navy/5"
                >
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ff6868]">
                    {plan.name}
                  </p>
                  <div className="mt-5 flex items-end gap-2 text-navy">
                    <span className="text-5xl font-bold">${plan.price}</span>
                    <span className="pb-1 text-sm text-navy/60">{plan.unit}</span>
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-navy/70">
                    {plan.body}
                  </p>
                  <ul className="mt-7 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm text-navy/70">
                        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ff6868]" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <div className="mt-8 rounded-2xl bg-[#f5f0ee] p-6 text-sm leading-relaxed text-navy/70">
              The first {INCLUDED_DISTANCE_MILES} route miles are included in the
              current planning model. Proposed distance pricing is ${standardDistanceRate}/mile
              standard or ${expressDistanceRate}/mile with express coordination
              beyond that radius. Airline baggage fees and other third-party charges
              remain separate.
            </div>
          </div>
        </section>

        <section className="bg-navy py-20 text-white">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#ff6868]">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-3xl font-bold md:text-4xl">
                A price does not open a custody lane.
              </h2>
              <p className="mt-4 leading-relaxed text-white/70">
                Travelyt confirms the operating path before a live customer bag
                moves. Missing authority, coverage, capacity, or receiving details
                means the request is held, changed, or declined.
              </p>
            </div>
            <div className="space-y-3">
              {routeGates.map((gate) => (
                <div
                  key={gate}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4"
                >
                  <CircleDollarSign className="h-5 w-5 shrink-0 text-[#ff6868]" />
                  <span className="text-sm font-semibold text-white/85">{gate}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 text-center">
          <div className="mx-auto max-w-2xl px-6">
            <h2 className="text-3xl font-bold text-navy">Tell us the route first.</h2>
            <p className="mt-4 text-navy/70">
              Submit the trip for review or join the launch list for market updates.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/quote"
                className="rounded-full bg-navy px-8 py-4 font-bold text-white"
              >
                Request Route Review
              </Link>
              <Link
                href="/#route-updates"
                className="rounded-full bg-[#ff6868] px-8 py-4 font-bold text-white"
              >
                Join the Launch
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
