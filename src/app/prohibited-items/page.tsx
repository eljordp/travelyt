import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Prohibited Items",
  description:
    "Travelyt prohibited and restricted baggage items for pickup, custody, airport handoff, and delivery.",
  alternates: {
    canonical: "/prohibited-items",
  },
};

const itemGroups = [
  {
    title: "Explosives, weapons, and ammunition",
    items: [
      "Fireworks, flares, blasting caps, gunpowder, replica explosives, and other explosive materials.",
      "Firearms, firearm parts, realistic weapons, knives, stun devices, pepper spray, and ammunition unless Travelyt has explicitly approved the handling plan in writing.",
    ],
  },
  {
    title: "Hazardous materials",
    items: [
      "Gasoline, lighter fluid, fuels, torch fuel, paints, paint thinner, solvents, and flammable liquids.",
      "Compressed gas cylinders, camping gas, oxygen cylinders, propane, butane, and aerosol products that are not allowed by the airline.",
      "Bleach, corrosives, oxidizers, poisons, toxic materials, infectious materials, dry ice outside airline limits, and radioactive materials.",
    ],
  },
  {
    title: "Batteries and powered devices",
    items: [
      "Loose lithium batteries, spare lithium batteries, and power banks may not be placed in bags Travelyt handles for checked-bag custody.",
      "Smart bags, scooters, hoverboards, mobility devices, or battery-powered equipment must follow the airline and FAA rules before Travelyt can accept custody.",
    ],
  },
  {
    title: "Illegal, controlled, or regulated items",
    items: [
      "Illegal drugs, marijuana where transport is not legally allowed, controlled substances, drug paraphernalia, counterfeit goods, and any item prohibited by law.",
      "Alcohol, tobacco, vape products, medicines, medical devices, and regulated products must be declared and may be refused if Travelyt cannot verify that transport is permitted.",
    ],
  },
  {
    title: "Items that should stay with the passenger",
    items: [
      "Passports, IDs, travel documents, visas, boarding passes, keys, wallets, cash, checks, jewelry, watches, and irreplaceable documents.",
      "Prescription medication, medical necessities, electronics, laptops, camera gear, fragile valuables, family heirlooms, and other high-value items unless Travelyt approves declared-value handling before pickup.",
    ],
  },
  {
    title: "Fragile, leaking, or perishable items",
    items: [
      "Perishable food, plants, live animals, biological samples, liquids that can leak, and fragile items that are not packed to survive normal airline baggage handling.",
      "Oversized, overweight, or unusual items may require manual review before Travelyt accepts custody.",
    ],
  },
];

const checkSteps = [
  "Review your airline's baggage rules for the exact flight and destination.",
  "Check TSA and FAA guidance before packing batteries, liquids, aerosols, tools, or sports equipment.",
  "Tell Travelyt before pickup if a bag contains unusual, fragile, regulated, or high-value contents.",
  "Keep IDs, medicines, cash, passports, keys, electronics, and irreplaceable items with you.",
];

export default function ProhibitedItemsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#ff6868]">
            Bag safety
          </p>
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <section>
              <h1 className="text-4xl font-bold text-navy md:text-5xl">
                Prohibited items
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-relaxed text-navy/70">
                Travelyt can only accept bags that comply with airport, TSA,
                FAA, airline, and local rules. Airlines and security agencies
                have final authority; if a bag cannot be verified, Travelyt may
                refuse pickup, pause custody, cancel service, or require manual
                review.
              </p>

              <div className="mt-8 grid gap-4">
                {itemGroups.map((group) => (
                  <section
                    key={group.title}
                    className="rounded-2xl border border-navy/10 p-5"
                  >
                    <h2 className="text-lg font-bold text-navy">
                      {group.title}
                    </h2>
                    <ul className="mt-3 space-y-2 text-sm leading-relaxed text-navy/70">
                      {group.items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff6868]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>

            <aside className="rounded-2xl bg-[#f6f7fb] p-5 lg:sticky lg:top-28">
              <h2 className="text-lg font-bold text-navy">
                Before Travelyt pickup
              </h2>
              <ol className="mt-4 space-y-3 text-sm leading-relaxed text-navy/70">
                {checkSteps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[#ff6868]">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                If you are unsure, do not pack it. Ask Travelyt before pickup
                or keep the item with you.
              </div>

              <div className="mt-6 space-y-3 text-sm font-semibold">
                <a
                  href="https://www.tsa.gov/travel/security-screening/whatcanibring/all"
                  className="block text-[#ff6868] underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  TSA: What Can I Bring?
                </a>
                <a
                  href="https://www.faa.gov/hazmat/packsafe"
                  className="block text-[#ff6868] underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  FAA PackSafe
                </a>
                <Link
                  href="/quote"
                  className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[#ff6868] px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Back to booking
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
