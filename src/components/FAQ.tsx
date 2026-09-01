"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  {
    q: "How do I request a trip?",
    a: "Start in the Travelyt app or join the route list. Tell us the airport, date, pickup address and bag count. We confirm market availability, capacity, timing and the exact handoff path before a request becomes a live service booking.",
  },
  {
    q: "What airports and cities do you serve?",
    a: "We're preparing launch lanes market by market. Selecting an airport in the request form does not confirm live service. Submit your route for review or join the launch list; we confirm availability directly.",
  },
  {
    q: "How does the seamless departure path work?",
    a: "Travelyt picks up, verifies, weighs and seals each bag at the traveler’s door. A passenger-absent airline handoff is offered only where the carrier and station authorize the receiving location, recipient and procedure. If that acceptance path is not confirmed, the request is not released into the seamless lane.",
  },
  {
    q: "Does Travelyt change passenger screening?",
    a: "No. The traveler still follows normal passenger screening, and TSA PreCheck applies only when the traveler is eligible. Travelyt’s role is to separate the checked-bag custody journey from the passenger journey before the airport.",
  },
  {
    q: "What if the seamless airline lane is not available for my route?",
    a: "A seamless carrier handoff will not be confirmed without the required authorization. Any different service model must be identified in your request and confirmed directly; a quote or payment does not create carrier authority.",
  },
  {
    q: "Is my luggage insured?",
    a: "Live custody will begin only after coverage is bound for the final driver, vehicle, and custody model. Any quote or declared-value option shown before launch is proposed and subject to the controlling policy terms.",
  },
  {
    q: "Can I track my bags in real time?",
    a: "The system records status updates and custody checkpoints. Continuous customer-facing live GPS is a future launch feature and will not be advertised as active until it passes end-to-end testing.",
  },
  {
    q: "What if my flight is delayed or cancelled?",
    a: "Tell Travelyt as soon as your flight changes. The team reviews the pickup window, receiving cutoff, and route capacity, then confirms revised arrangements. Do not assume the original plan still applies.",
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
