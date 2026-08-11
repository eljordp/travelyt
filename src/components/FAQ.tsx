"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { TRAVELYT_HANDOFF_TARGET_MINUTES } from "@/lib/service-rules";

const faqs = [
  {
    q: "How far in advance do I need to book?",
    a: `We recommend booking at least 24 hours before your flight. Same-day bookings depend on distance, driver availability, traffic, and carrier rules. During controlled launch operations, Travelyt targets terminal handoff at least ${TRAVELYT_HANDOFF_TARGET_MINUTES / 60} hours before departure; airline- or station-specific earlier requirements always control.`,
  },
  {
    q: "What airports and cities do you serve?",
    a: "We're rolling out service market by market. Check our booking tool for availability in your area — and if we're not in your city yet, sign up and we'll let you know when we launch there.",
  },
  {
    q: "How does departure handoff work?",
    a: "Standard service returns the sealed bags to the verified ticketed traveler in the public ticketing area, and the traveler completes airline check-in and bag acceptance. Travelyt never performs screening, issues airline bag tags, or enters secure/badged areas. Passenger-absent tender is available only where the carrier and station authorize a named airline or ground-handler recipient and the full acceptance process.",
  },
  {
    q: "Is my luggage insured?",
    a: "Live custody will begin only after coverage is bound for the final driver, vehicle, and custody model. Any quote or declared-value option shown before launch is proposed and subject to the controlling policy terms.",
  },
  {
    q: "Can I track my bags in real time?",
    a: "The system records status updates and custody checkpoints. Live GPS visibility and automated SMS or email delivery depend on the configured launch environment and are not promised until they have passed end-to-end testing.",
  },
  {
    q: "What if my flight is delayed or cancelled?",
    a: "We monitor flight status and adjust pickup and delivery timing where possible. If a change requires rescheduling, we'll reach out directly to confirm new times.",
  },
  {
    q: "What about fragile items, liquids, or restricted goods?",
    a: "Same rules that apply to any checked bag apply to us: no lithium batteries loose in cargo, no flammable liquids, no restricted items. If you're unsure, ask us before pickup and we'll walk you through it.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 md:py-28 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-purple uppercase tracking-wider">
            FAQ
          </span>
          <h2 className="text-3xl md:text-5xl font-bold text-navy mt-3 mb-4">
            Questions? Answered.
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="border border-gray-100 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50/50 transition-colors"
              >
                <span className="font-semibold text-navy pr-4">{faq.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-navy/30 flex-shrink-0 transition-transform duration-200 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                  strokeWidth={2}
                />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5 text-sm text-navy/70 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
