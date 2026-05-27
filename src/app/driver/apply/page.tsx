"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, DollarSign, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Form = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  vehicleMakeModel: string;
  licensePlate: string;
  driversLicenseState: string;
  driversLicenseLast4: string;
  hasCleanRecord: boolean;
  backgroundCheckConsent: boolean;
  availability: string;
  referralSource: string;
  notes: string;
};

const empty: Form = {
  fullName: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  vehicleMakeModel: "",
  licensePlate: "",
  driversLicenseState: "",
  driversLicenseLast4: "",
  hasCleanRecord: false,
  backgroundCheckConsent: false,
  availability: "",
  referralSource: "",
  notes: "",
};

const availabilityOptions = [
  "Weekdays (mornings)",
  "Weekdays (evenings)",
  "Weekends",
  "Full-time / flexible",
];

export default function DriverApplyPage() {
  const [form, setForm] = useState<Form>(empty);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const res = await fetch("/api/driver-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !data.ok) {
      setStatus("error");
      setMessage(data.error || "Something went wrong. Try again.");
      return;
    }

    setStatus("success");
    setMessage("Application received. We'll reach out within 5 business days.");
    setForm(empty);
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-[#f6f7fb]">
        <Navbar />
        <main className="mx-auto max-w-3xl px-6 pt-32 pb-20">
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm shadow-navy/5">
            <CheckCircle2 className="mx-auto h-14 w-14 text-[#c41e2a]" strokeWidth={1.8} />
            <h1 className="mt-5 text-3xl font-bold text-navy">Application received</h1>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-navy/65">
              {message}
            </p>
            <Link
              href="/"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90"
            >
              Back to home <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-navy outline-none transition-all focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10";

  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 pt-28 pb-20">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
            Drive with Travelyt
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-navy sm:text-5xl">
            Apply to be a Travelyt courier
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-navy/65">
            We pay per job, not per hour. Most pickups take 30 to 60 minutes door to airport. You set your own availability and use your own vehicle.
          </p>
        </header>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Perk
            icon={DollarSign}
            title="Per-job pay"
            body="Flat base per job set by distance, bag count, and service type, same gig model used by Roadie. You see the payout before claiming the job."
          />
          <Perk
            icon={ShieldCheck}
            title="Background check"
            body="Third-party check (industry-standard provider such as Checkr) covering motor vehicle records, identity, and criminal history. Travelyt pays the fee."
          />
          <Perk
            icon={CheckCircle2}
            title="Your schedule"
            body="Claim jobs that fit your day. No quotas, no shifts."
          />
        </div>

        <form
          onSubmit={submit}
          className="space-y-6 rounded-3xl bg-white p-6 shadow-sm shadow-navy/5 sm:p-8"
        >
          <Section title="About you">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="fullName" label="Full legal name" required>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  className={input}
                />
              </Field>
              <Field id="email" label="Email" required>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={input}
                />
              </Field>
              <Field id="phone" label="Phone" required>
                <input
                  id="phone"
                  type="tel"
                  required
                  placeholder="+1 (555) 000-0000"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className={input}
                />
              </Field>
              <Field id="city" label="City" required>
                <input
                  id="city"
                  type="text"
                  required
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={input}
                />
              </Field>
              <Field id="state" label="State (2-letter)" required>
                <input
                  id="state"
                  type="text"
                  required
                  maxLength={2}
                  placeholder="CA"
                  value={form.state}
                  onChange={(e) => set("state", e.target.value.toUpperCase())}
                  className={input}
                />
              </Field>
              <Field id="availability" label="Availability" required>
                <select
                  id="availability"
                  required
                  value={form.availability}
                  onChange={(e) => set("availability", e.target.value)}
                  className={`${input} bg-white`}
                >
                  <option value="">Select</option>
                  {availabilityOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Your vehicle">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="vehicleMakeModel" label="Make and model" required>
                <input
                  id="vehicleMakeModel"
                  type="text"
                  required
                  placeholder="2022 Toyota Camry"
                  value={form.vehicleMakeModel}
                  onChange={(e) => set("vehicleMakeModel", e.target.value)}
                  className={input}
                />
              </Field>
              <Field id="licensePlate" label="License plate" required>
                <input
                  id="licensePlate"
                  type="text"
                  required
                  value={form.licensePlate}
                  onChange={(e) => set("licensePlate", e.target.value.toUpperCase())}
                  className={input}
                />
              </Field>
            </div>
          </Section>

          <Section title="Driver's license">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="driversLicenseState" label="Issuing state (2-letter)" required>
                <input
                  id="driversLicenseState"
                  type="text"
                  required
                  maxLength={2}
                  placeholder="CA"
                  value={form.driversLicenseState}
                  onChange={(e) =>
                    set("driversLicenseState", e.target.value.toUpperCase())
                  }
                  className={input}
                />
              </Field>
              <Field id="driversLicenseLast4" label="Last 4 of license number" required>
                <input
                  id="driversLicenseLast4"
                  type="text"
                  required
                  maxLength={4}
                  inputMode="numeric"
                  pattern="\d{4}"
                  value={form.driversLicenseLast4}
                  onChange={(e) =>
                    set("driversLicenseLast4", e.target.value.replace(/\D/g, ""))
                  }
                  className={input}
                />
              </Field>
            </div>
            <p className="text-xs leading-relaxed text-navy/55">
              We collect the last 4 only at this step. Full ID + background check happens after we contact you.
            </p>
          </Section>

          <Section title="Consent">
            <Checkbox
              checked={form.hasCleanRecord}
              onChange={(v) => set("hasCleanRecord", v)}
            >
              I have a clean driving record (no DUIs, no reckless driving in the last 5 years).
            </Checkbox>
            <Checkbox
              checked={form.backgroundCheckConsent}
              onChange={(v) => set("backgroundCheckConsent", v)}
            >
              I consent to a third-party background check (industry-standard provider such as Checkr, which also screens drivers for Uber, Lyft, DoorDash, and Roadie) covering motor vehicle records (MVR), Social Security Number verification, and criminal history focused on violent offenses, theft, and fraud. I understand a separate identity step (photo of my driver&apos;s license and a live selfie) will be required before approval.
            </Checkbox>
          </Section>

          <Section title="Anything else">
            <div className="grid gap-4">
              <Field id="referralSource" label="How did you hear about us">
                <input
                  id="referralSource"
                  type="text"
                  value={form.referralSource}
                  onChange={(e) => set("referralSource", e.target.value)}
                  className={input}
                />
              </Field>
              <Field id="notes" label="Anything we should know">
                <textarea
                  id="notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className={`${input} resize-none`}
                />
              </Field>
            </div>
          </Section>

          {status === "error" && message && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
            </p>
          )}

          <div className="flex flex-col items-stretch gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-navy/55">
              Already a Travelyt courier?{" "}
              <Link href="/driver" className="font-semibold text-navy underline">
                Sign in to your dashboard
              </Link>
            </p>
            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#c41e2a] px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === "loading" ? "Submitting…" : "Submit application"}
              {status !== "loading" && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c41e2a]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-navy/70"
      >
        {label} {required && <span className="text-[#c41e2a]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl bg-[#f6f7fb] p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-navy/20 text-[#c41e2a] focus:ring-[#c41e2a]"
      />
      <span className="text-sm leading-relaxed text-navy/75">{children}</span>
    </label>
  );
}

function Perk({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#c41e2a]/10 text-[#c41e2a]">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <p className="mt-3 font-bold text-navy">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-navy/65">{body}</p>
    </div>
  );
}
