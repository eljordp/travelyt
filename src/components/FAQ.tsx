"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { AIRLINE_BAG_CUTOFF_MINUTES } from "@/lib/service-rules";

const faqs = [
  {
    q: "How far in advance do I need to book?",
    a: `We recommend booking at least 24 hours before your flight. Same-day bookings may be available depending on your distance from the airport, driver availability, traffic, and airline baggage cutoff rules. For departures, Travelyt targets bag acceptance at least ${AIRLINE_BAG_CUTOFF_MINUTES} minutes before departure unless an airline or airport approves a shorter Travelyt-specific cutoff.`,
  },
  {
    q: "What airports and cities do you serve?",
    a: "We're rolling out service market by market. Check our booking tool for availability in your area — and if we're not in your city yet, sign up and we'll let you know when we launch there.",
  },
  {
    q: "How does the handoff to my airline work?",
    a: "We're not a ticketed-passenger counter check-in — after 9/11, only you can do that. What we do is take the lugging out: we pick up your bags at your door and deliver them straight to your airline at the airport on your behalf, so they fly with you. You walk in with nothing to carry.",
  },
  {
    q: "Is my luggage insured?",
    a: "Yes. Every bag we touch is covered from pickup to delivery. Our standard coverage applies automatically; additional declared-value coverage is available for high-value items. Full details are in our Terms.",
  },
  {
    q: "Can I track my bags in real time?",
    a: "Yes. You get a tracking link via SMS and email. Follow your bags on a live map with status updates at every checkpoint.",
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
