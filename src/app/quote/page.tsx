"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Home, PlaneLanding, Repeat2 } from "lucide-react";
import { calcPriceCents, createBooking, formatPrice, type ServiceType as BookingServiceType } from "@/lib/bookings";
import AppChrome from "@/components/AppChrome";

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

interface DateParts {
  month: string;
  day: string;
  year: string;
}

const STEPS = ["Service", "Trip Details", "Contact", "Review"];
const MONTHS = [
  ["01", "Jan"],
  ["02", "Feb"],
  ["03", "Mar"],
  ["04", "Apr"],
  ["05", "May"],
  ["06", "Jun"],
  ["07", "Jul"],
  ["08", "Aug"],
  ["09", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
];
const YEARS = Array.from(
  { length: 3 },
  (_, i) => String(new Date().getFullYear() + i)
);

const emptyForm: FormData = {
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
};

export default function QuotePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormData>(emptyForm);
  const [dateParts, setDateParts] = useState<DateParts>({
    month: "",
    day: "",
    year: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const airport = params.get("airport");
      const date = params.get("date");
      const service = params.get("service");
      const nextForm: Partial<FormData> = {};

      if (airport && AIRPORTS.some((a) => a.code === airport)) {
        nextForm.airport = airport;
      }
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        nextForm.date = date;
        const [year, month, day] = date.split("-");
        setDateParts({ month, day, year });
      }
      if (service === "departure" || service === "arrival" || service === "both") {
        nextForm.service = service;
        setStep(1);
      }

      if (Object.keys(nextForm).length > 0) {
        setForm((f) => ({ ...f, ...nextForm }));
      }
    }, 0);

    return () => window.clearTimeout(handle);
  }, []);

  function set(field: keyof FormData, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  function setDatePart(part: "month" | "day" | "year", value: string) {
    setDateParts((current) => {
      const next = { ...current, [part]: value };
      const nextDate =
        next.year && next.month && next.day
          ? `${next.year}-${next.month}-${next.day}`
          : "";
      set("date", nextDate);
      return next;
    });
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

  async function submitBooking() {
    if (!form.service || submitting) return;
    setSubmitting(true);

    try {
      const b = await createBooking({
        service: form.service as BookingServiceType,
        airport: form.airport,
        address: form.address,
        date: form.date,
        flight: form.flight || undefined,
        bags: form.bags,
        name: form.name,
        email: form.email,
        phone: form.phone,
        notes: form.notes || undefined,
      });
      router.push(`/booking/${b.id}/pay`);
    } catch (err) {
      console.error("Booking submit network error", err);
      setSubmitting(false);
    }
  }

  const serviceLabels: Record<string, string> = {
    departure: "Departure Pickup",
    arrival: "Arrival Delivery",
    both: "Both Ways",
  };
  const estimate =
    form.service && form.bags
      ? formatPrice(calcPriceCents(form.bags, form.service as BookingServiceType))
      : "";
  const labelClass = "block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5";
  const dateSelectClass = `w-full px-3 py-3 rounded-xl border ${errors.date ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all bg-white text-navy`;

  return (
    <AppChrome title="Book bags">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-navy">Book your handoff</h1>
          <p className="mt-1 text-sm text-navy/65">
            Door pickup, arrival delivery, or both.
          </p>
        </div>

        {(
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-navy/5">
            {/* Progress Bar */}
            <div className="border-b border-gray-100 px-4 pb-5 pt-5 sm:px-8 sm:pt-8">
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
                          <Check className="w-4 h-4" strokeWidth={2.5} />
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

            <div className="px-4 py-6 sm:px-8 sm:py-8">
              {/* Step 0 — Service Type */}
              {step === 0 && (
                <div>
                  <h2 className="text-xl font-bold text-navy mb-2">What do you need?</h2>
                  <p className="text-navy/70 text-sm mb-6">Select the baggage service that fits your trip.</p>
                  <div className="grid grid-cols-1 gap-4">
                    {[
                      { value: "departure", icon: <Home className="h-5 w-5" strokeWidth={1.8} />, title: "Departure Pickup", desc: "Door pickup, airport handoff." },
                      { value: "arrival", icon: <PlaneLanding className="h-5 w-5" strokeWidth={1.8} />, title: "Arrival Delivery", desc: "Baggage claim to your address." },
                      { value: "both", icon: <Repeat2 className="h-5 w-5" strokeWidth={1.8} />, title: "Both Ways", desc: "Round-trip bag handling." },
                    ].map((opt) => (
                      <button key={opt.value} type="button"
                        onClick={() => set("service", opt.value)}
                        aria-pressed={form.service === opt.value}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          form.service === opt.value
                            ? "border-[#c41e2a] bg-[#c41e2a]/5"
                            : "border-gray-100 hover:border-gray-200"
                        }`}>
                        <div className="flex items-start gap-4">
                          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                            form.service === opt.value ? "bg-[#c41e2a] text-white" : "bg-[#f5f0ee] text-navy"
                          }`}>
                            {opt.icon}
                          </span>
                          <div>
                            <div className={`font-bold mb-1 ${form.service === opt.value ? "text-[#c41e2a]" : "text-navy"}`}>{opt.title}</div>
                            <div className="text-sm text-navy/70">{opt.desc}</div>
                          </div>
                          <div className={`ml-auto w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all ${
                            form.service === opt.value ? "border-[#c41e2a] bg-[#c41e2a]" : "border-gray-200"
                          }`}>
                            {form.service === opt.value && (
                              <Check className="w-full h-full p-0.5 text-white" strokeWidth={3} />
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
                    <p className="text-navy/70 text-sm mb-6">Tell us about your bags and travel plans.</p>
                  </div>

                  {/* Airport */}
                  <div>
                    <label htmlFor="quote-airport" className={labelClass}>Airport <span className="text-[#c41e2a]">*</span></label>
                    <select id="quote-airport" name="airport" required value={form.airport} onChange={(e) => set("airport", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border ${errors.airport ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all bg-white appearance-none text-navy`}>
                      <option value="">Select airport...</option>
                      {AIRPORTS.map((a) => (
                        <option key={a.code} value={a.code}>{a.name} ({a.code})</option>
                      ))}
                    </select>
                    {errors.airport ? <p className="text-xs text-red-500 mt-1">{errors.airport}</p>
                      : <p className="text-xs text-navy/70 mt-1">We serve within 50 miles of each airport</p>}
                  </div>

                  {/* Address */}
                  <div>
                    <label htmlFor="quote-address" className={labelClass}>
                      {form.service === "arrival" ? "Delivery Address" : "Pickup Address"} <span className="text-[#c41e2a]">*</span>
                    </label>
                    <input id="quote-address" name="address" required type="text"
                      placeholder={form.service === "arrival" ? "Where should we deliver your bags?" : "Where should we collect your bags?"}
                      value={form.address} onChange={(e) => set("address", e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border ${errors.address ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all text-navy`} />
                    {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                  </div>

                  {/* Date + Flight */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Travel Date <span className="text-[#c41e2a]">*</span></label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          id="quote-date-month"
                          aria-label="Travel month"
                          value={dateParts.month}
                          onChange={(e) => setDatePart("month", e.target.value)}
                          className={dateSelectClass}
                        >
                          <option value="">Month</option>
                          {MONTHS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <select
                          id="quote-date-day"
                          aria-label="Travel day"
                          value={dateParts.day}
                          onChange={(e) => setDatePart("day", e.target.value)}
                          className={dateSelectClass}
                        >
                          <option value="">Day</option>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d).padStart(2, "0")}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <select
                          id="quote-date-year"
                          aria-label="Travel year"
                          value={dateParts.year}
                          onChange={(e) => setDatePart("year", e.target.value)}
                          className={dateSelectClass}
                        >
                          <option value="">Year</option>
                          {YEARS.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                      {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                    </div>
                    <div>
                      <label htmlFor="quote-flight" className={labelClass}>Flight Number <span className="text-navy/70 font-normal normal-case">(optional)</span></label>
                      <input id="quote-flight" name="flight" type="text" placeholder="e.g. AA 1234" value={form.flight} onChange={(e) => set("flight", e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all text-navy" />
                    </div>
                  </div>

                  {/* Bags counter */}
                  <div>
                    <label className={labelClass}>Number of Bags</label>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => set("bags", Math.max(1, form.bags - 1))}
                        className="w-10 h-10 rounded-xl bg-gray-100 text-navy font-bold text-lg hover:bg-gray-200 transition-colors cursor-pointer flex items-center justify-center">−</button>
                      <span className="text-2xl font-bold text-navy w-8 text-center">{form.bags}</span>
                      <button type="button" onClick={() => set("bags", Math.min(10, form.bags + 1))}
                        className="w-10 h-10 rounded-xl bg-gray-100 text-navy font-bold text-lg hover:bg-gray-200 transition-colors cursor-pointer flex items-center justify-center">+</button>
                      <span className="text-sm text-navy/70">bags</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 — Contact */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-navy mb-2">Your contact info</h2>
                    <p className="text-navy/70 text-sm mb-6">We&apos;ll send your quote here and coordinate pickup details.</p>
                  </div>

                  {[
                    { id: "name", label: "Full Name", type: "text", placeholder: "Jordan Williams" },
                    { id: "email", label: "Email Address", type: "email", placeholder: "you@example.com" },
                    { id: "phone", label: "Phone Number", type: "tel", placeholder: "+1 (555) 000-0000" },
                  ].map((f) => (
                    <div key={f.id}>
                      <label htmlFor={`quote-${f.id}`} className={labelClass}>{f.label} <span className="text-[#c41e2a]">*</span></label>
                      <input id={`quote-${f.id}`} name={f.id} required type={f.type} placeholder={f.placeholder}
                        value={form[f.id as keyof FormData] as string}
                        onChange={(e) => set(f.id as keyof FormData, e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border ${errors[f.id] ? "border-red-400 bg-red-50" : "border-gray-200"} focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all text-navy`} />
                      {errors[f.id] && <p className="text-xs text-red-500 mt-1">{errors[f.id]}</p>}
                    </div>
                  ))}

                  <div>
                    <label htmlFor="quote-notes" className={labelClass}>Special Instructions <span className="text-navy/70 font-normal normal-case">(optional)</span></label>
                    <textarea id="quote-notes" name="notes" rows={3} placeholder="Fragile items, oversized bags, gate code, etc."
                      value={form.notes} onChange={(e) => set("notes", e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all resize-none text-navy" />
                  </div>
                </div>
              )}

              {/* Step 3 — Review */}
              {step === 3 && (
                <div>
                  <h2 className="text-xl font-bold text-navy mb-2">Review your request</h2>
                  <p className="text-navy/70 text-sm mb-6">Everything look right? Submit and we&apos;ll be in touch within 2 hours.</p>

                  <div className="bg-[#f5f0ee] rounded-xl p-6 space-y-4 text-sm">
                    <Row label="Service" value={serviceLabels[form.service] || form.service} />
                    <Row label="Airport" value={`${AIRPORTS.find(a => a.code === form.airport)?.name} (${form.airport})`} />
                    <Row label={form.service === "arrival" ? "Delivery Address" : "Pickup Address"} value={form.address} />
                    <Row label="Travel Date" value={form.date} />
                    {form.flight && <Row label="Flight" value={form.flight} />}
                    <Row label="Bags" value={`${form.bags} bag${form.bags > 1 ? "s" : ""}`} />
                    {estimate && <Row label="Estimated Total" value={estimate} />}
                    <div className="border-t border-gray-200 pt-4 mt-2 space-y-4">
                      <Row label="Name" value={form.name} />
                      <Row label="Email" value={form.email} />
                      <Row label="Phone" value={form.phone} />
                      {form.notes && <Row label="Notes" value={form.notes} />}
                    </div>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-navy/70">
                    Estimate includes pickup or delivery, sealing, tracking, and
                    standard coverage. Airline baggage fees, if any, are paid
                    separately to the airline.
                  </p>
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
                  <button type="button" onClick={submitBooking}
                    disabled={submitting}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                    {submitting ? "Submitting…" : "Continue to Payment →"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppChrome>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-navy/70 font-medium shrink-0">{label}</span>
      <span className="text-navy font-semibold text-right">{value}</span>
    </div>
  );
}
