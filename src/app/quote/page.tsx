"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

const AIRPORTS = [
  { code: "ATL", name: "Atlanta Hartsfield-Jackson" },
  { code: "BOS", name: "Boston Logan" },
  { code: "BWI", name: "Baltimore/Washington" },
  { code: "DCA", name: "Washington Reagan National" },
  { code: "DEN", name: "Denver International" },
  { code: "DFW", name: "Dallas/Fort Worth" },
  { code: "DTW", name: "Detroit Metropolitan" },
  { code: "EWR", name: "New York Newark" },
  { code: "HOU", name: "Houston Hobby" },
  { code: "IAD", name: "Washington Dulles" },
  { code: "IAH", name: "Houston Intercontinental" },
  { code: "JFK", name: "New York JFK" },
  { code: "LAS", name: "Las Vegas Harry Reid" },
  { code: "LAX", name: "Los Angeles International" },
  { code: "MCO", name: "Orlando International" },
  { code: "MDW", name: "Chicago Midway" },
  { code: "MIA", name: "Miami International" },
  { code: "MSP", name: "Minneapolis-Saint Paul" },
  { code: "ORD", name: "Chicago O'Hare" },
  { code: "ORF", name: "Norfolk International" },
  { code: "PDX", name: "Portland International" },
  { code: "PHX", name: "Phoenix Sky Harbor" },
  { code: "RIC", name: "Richmond International" },
  { code: "SEA", name: "Seattle-Tacoma" },
  { code: "SFO", name: "San Francisco International" },
];

type ServiceType = "departure" | "arrival" | "both" | "";

interface FormData {
  service: ServiceType;
  airport: string;
  address: string;
  date: string;
  flight: string;
  bags: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

const STEPS = ["Service", "Trip Details", "Contact", "Review"];

export default function QuotePage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormData>({
    service: "",
    airport: "",
    address: "",
    date: "",
    flight: "",
    bags: 2,
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  function set(field: keyof FormData, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 0 && !form.service) e.service = "Please select a service";
    if (step === 1) {
      if (!form.airport) e.airport = "Select an airport";
      if (!form.address.trim()) e.address = "Enter your pickup or delivery address";
      if (!form.date) e.date = "Select a travel date";
    }
    if (step === 2) {
      if (!form.name.trim()) e.name = "Full name required";
      if (!form.email.trim()) e.email = "Email required";
      else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
      if (!form.phone.trim()) e.phone = "Phone number required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() { if (validate()) setStep((s) => s + 1); }
  function back() { setStep((s) => s - 1); setErrors({}); }

  const serviceLabels: Record<string, string> = {
    departure: "Departure Pickup",
    arrival: "Arrival Delivery",
    both: "Both Ways",
  };

  return (
    <div className="min-h-screen bg-[#f5f0ee]">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 pt-28 pb-16">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-navy mb-2">Request a Quote</h1>
          <p className="text-navy/50">We&apos;ll get back to you within 2 hours.</p>
        </div>

        {!submitted ? (
          <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 overflow-hidden">
            {/* Progress Bar */}
            <div className="px-8 pt-8 pb-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                {STEPS.map((label, i) => (
                  <div key={label} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        i < step ? "bg-[#c41e2a] text-white" :
                        i === step ? "bg-navy text-white" :
                        "bg-gray-100 text-navy/30"
                      }`}>
                        {i < step ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : i + 1}
                      </div>
                      <span className={`text-xs mt-1 font-medium hidden sm:block ${i === step ? "text-navy" : "text-navy/30"}`}>{label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${i < step ? "bg-[#c41e2a]" : "bg-gray-100"}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-8 py-8">
              {/* Step 0 — Service Type */}
              {step === 0 && (
                <div>
                  <h2 className="text-xl font-bold text-navy mb-2">What do you need?</h2>
                  <p className="text-navy/50 text-sm mb-6">Select the baggage service that fits your trip.</p>
                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { value: "departure", icon: "🏠→✈️", title: "Departure Pickup", desc: "We collect your bags from your door, tag and check them in. You go straight to your gate." },
                      { value: "arrival", icon: "✈️→🏠", title: "Arrival Delivery", desc: "We collect your bags from the carousel and deliver them to your door. Walk off the plane free." },
                      { value: "both", icon: "🔄", title: "Both Ways", desc: "Full round-trip baggage handling. Your bags leave with you and come back to you." },
                    ].map((opt) => (
                      <button key={opt.value} type="button"
                        onClick={() => set("service", opt.value)}
                        className={`w-full text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${
                          form.service === opt.value
                            ? "border-[#c41e2a] bg-[#c41e2a]/5"
                            : "border-gray-100 hover:border-gray-200"
                        }`}>
                        <div className="flex items-start gap-4">
                          <span className="text-2xl">{opt.icon}</span>
                          <div>
                            <div className={`font-bold mb-1 ${form.service === opt.value ? "text-[#c41e2a]" : "text-navy"}`}>{opt.title}</div>
                            <div className="text-sm text-navy/50">{opt.desc}</div>
                          </div>
                          <div className={`ml-auto w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all ${
                            form.service === opt.value ? "border-[#c41e2a] bg-[#c41e2a]" : "border-gray-200"
                          }`}>
                            {form.service === opt.value && (
                              <svg className="w-full h-full p-0.5" fill="none" stroke="white" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {errors.service && <p className="text-xs text-red-500 mt-3">{errors.service}</p>}
                </div>
              )}

              {/* Step 1 — Trip Details */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-navy mb-2">Trip details</h2>
                    <p className="text-navy/50 text-sm mb-6">Tell us about your bags and travel plans.</p>
                  </div>

                  {/* Airport */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Airport <span className="text-[#c41e2a]">*</span></label>
                    <select value={form.airport} onChange={(e) => set("airport", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border ${errors.airport ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all bg-white appearance-none`}>
                      <option value="">Select airport...</option>
                      {AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                    {errors.airport ? <p className="text-xs text-red-500 mt-1">{errors.airport}</p>
                      : <p className="text-xs text-navy/40 mt-1">We serve within 50 miles of each airport</p>}
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">
                      {form.service === "arrival" ? "Delivery Address" : "Pickup Address"} <span className="text-[#c41e2a]">*</span>
                    </label>
                    <input type="text"
                      placeholder={form.service === "arrival" ? "Where should we deliver your bags?" : "Where should we collect your bags?"}
                      value={form.address} onChange={(e) => set("address", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border ${errors.address ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
                    {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                  </div>

                  {/* Date + Flight */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Travel Date <span className="text-[#c41e2a]">*</span></label>
                      <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border ${errors.date ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all text-navy/70`} />
                      {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Flight Number <span className="text-navy/30 font-normal normal-case">(optional)</span></label>
                      <input type="text" placeholder="e.g. AA 1234" value={form.flight} onChange={(e) => set("flight", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all" />
                    </div>
                  </div>

                  {/* Bags counter */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Number of Bags</label>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => set("bags", Math.max(1, form.bags - 1))}
                        className="w-10 h-10 rounded-xl bg-gray-100 text-navy font-bold text-lg hover:bg-gray-200 transition-colors cursor-pointer flex items-center justify-center">−</button>
                      <span className="text-2xl font-bold text-navy w-8 text-center">{form.bags}</span>
                      <button type="button" onClick={() => set("bags", Math.min(10, form.bags + 1))}
                        className="w-10 h-10 rounded-xl bg-gray-100 text-navy font-bold text-lg hover:bg-gray-200 transition-colors cursor-pointer flex items-center justify-center">+</button>
                      <span className="text-sm text-navy/40">bags</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 — Contact */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-navy mb-2">Your contact info</h2>
                    <p className="text-navy/50 text-sm mb-6">We&apos;ll send your quote here and coordinate pickup details.</p>
                  </div>

                  {[
                    { id: "name", label: "Full Name", type: "text", placeholder: "Jordan Williams" },
                    { id: "email", label: "Email Address", type: "email", placeholder: "you@example.com" },
                    { id: "phone", label: "Phone Number", type: "tel", placeholder: "+1 (555) 000-0000" },
                  ].map((f) => (
                    <div key={f.id}>
                      <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">{f.label} <span className="text-[#c41e2a]">*</span></label>
                      <input type={f.type} placeholder={f.placeholder}
                        value={form[f.id as keyof FormData] as string}
                        onChange={(e) => set(f.id as keyof FormData, e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border ${errors[f.id] ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all`} />
                      {errors[f.id] && <p className="text-xs text-red-500 mt-1">{errors[f.id]}</p>}
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5">Special Instructions <span className="text-navy/30 font-normal normal-case">(optional)</span></label>
                    <textarea rows={3} placeholder="Fragile items, oversized bags, gate code, etc."
                      value={form.notes} onChange={(e) => set("notes", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all resize-none" />
                  </div>
                </div>
              )}

              {/* Step 3 — Review */}
              {step === 3 && (
                <div>
                  <h2 className="text-xl font-bold text-navy mb-2">Review your request</h2>
                  <p className="text-navy/50 text-sm mb-6">Everything look right? Submit and we&apos;ll be in touch within 2 hours.</p>

                  <div className="bg-[#f5f0ee] rounded-xl p-6 space-y-4 text-sm">
                    <Row label="Service" value={serviceLabels[form.service] || form.service} />
                    <Row label="Airport" value={`${AIRPORTS.find(a => a.code === form.airport)?.name} (${form.airport})`} />
                    <Row label={form.service === "arrival" ? "Delivery Address" : "Pickup Address"} value={form.address} />
                    <Row label="Travel Date" value={form.date} />
                    {form.flight && <Row label="Flight" value={form.flight} />}
                    <Row label="Bags" value={`${form.bags} bag${form.bags > 1 ? "s" : ""}`} />
                    <div className="border-t border-gray-200 pt-4 mt-2 space-y-4">
                      <Row label="Name" value={form.name} />
                      <Row label="Email" value={form.email} />
                      <Row label="Phone" value={form.phone} />
                      {form.notes && <Row label="Notes" value={form.notes} />}
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className={`flex mt-8 ${step > 0 ? "justify-between" : "justify-end"}`}>
                {step > 0 && (
                  <button type="button" onClick={back}
                    className="px-6 py-3 rounded-xl border border-gray-200 text-navy font-semibold text-sm hover:bg-gray-50 transition-colors cursor-pointer">
                    ← Back
                  </button>
                )}
                {step < 3 ? (
                  <button type="button" onClick={next}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer">
                    Continue →
                  </button>
                ) : (
                  <button type="button" onClick={() => setSubmitted(true)}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer">
                    Request My Quote
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Success state */
          <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-navy mb-3">Quote request sent!</h2>
            <p className="text-navy/60 mb-2">We&apos;ll contact <strong>{form.email}</strong> within 2 hours with your quote.</p>
            <p className="text-navy/40 text-sm mb-8">Reference: TVT-{Math.random().toString(36).slice(2, 8).toUpperCase()}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/" className="px-6 py-3 rounded-xl border border-gray-200 text-navy font-semibold text-sm hover:bg-gray-50 transition-colors">
                Back to Home
              </Link>
              <Link href="/register" className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-semibold text-sm hover:opacity-90 transition-opacity">
                Create an Account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy/40 font-medium shrink-0">{label}</span>
      <span className="text-navy font-semibold text-right">{value}</span>
    </div>
  );
}
