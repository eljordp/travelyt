import Link from "next/link";
import { BadgeCheck, Handshake, MapPinned, ShieldCheck } from "lucide-react";

const proofPoints = [
  {
    icon: <MapPinned className="h-6 w-6" strokeWidth={1.7} />,
    title: "Launching market by market",
    body: "Starting with major airport metros where doorstep pickup and arrival delivery can be operated reliably.",
  },
  {
    icon: <ShieldCheck className="h-6 w-6" strokeWidth={1.7} />,
    title: "Security-first operation",
    body: "Tamper-evident seals, live tracking, insured transport, and chain-of-custody logs are core to the service.",
  },
  {
    icon: <Handshake className="h-6 w-6" strokeWidth={1.7} />,
    title: "Partner conversations open",
    body: "Hotels, travel operators, and airport-adjacent teams can reach us now for launch coordination.",
  },
];

export default function LaunchStatus() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple/20 bg-purple/5 px-4 py-2 text-sm font-semibold text-purple">
              <BadgeCheck className="h-4 w-4" />
              Pre-launch, built in public
            </div>
            <h2 className="text-3xl font-bold text-navy md:text-4xl">
              Honest launch status, clear expectations
            </h2>
            <p className="mt-4 text-navy/70 leading-relaxed">
              Travelyt is opening early access before public rollout. We are not
              claiming airline partnerships or volume we have not earned. We are
              building the baggage layer travelers keep wishing existed.
            </p>
            <Link
              href="/trust"
              className="mt-6 inline-flex rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy/90"
            >
              Review trust details
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {proofPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-2xl border border-gray-100 bg-[#f8fbff] p-6"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-purple shadow-sm shadow-navy/5">
                  {point.icon}
                </div>
                <h3 className="text-base font-bold text-navy">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy/70">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
