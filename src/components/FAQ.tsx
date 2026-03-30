"use client";

import { useState } from "react";

const faqs = [
  {
    q: "How far in advance do I need to book?",
    a: "We recommend booking at least 24 hours before your flight. Same-day bookings may be available depending on your location and availability.",
  },
  {
    q: "What airports do you serve?",
    a: "We currently operate in major airports across the US, UK, and UAE, with rapid expansion planned. Check our booking tool for availability in your area.",
  },
  {
    q: "Is my luggage insured?",
    a: "Yes. Every bag is fully insured from the moment we collect it until delivery. We also use tamper-proof seals and GPS tracking for complete peace of mind.",
  },
  {
    q: "Can I track my bags in real time?",
    a: "Absolutely. You'll receive a tracking link via SMS and email. Follow your bags on a live map with status updates at every checkpoint.",
  },
  {
    q: "What if my flight is delayed or cancelled?",
    a: "We monitor flight status in real time. If your flight changes, we automatically adjust pickup and delivery schedules. No action needed from you.",
  },
  {
    q: "How does doorstep check-in work with different airlines?",
    a: "We're integrated with major airline departure control systems. Our agents can check you in, print boarding passes, and tag bags for most major carriers.",
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
                <svg
                  className={`w-5 h-5 text-navy/30 flex-shrink-0 transition-transform duration-200 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5 text-sm text-navy/60 leading-relaxed">
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
