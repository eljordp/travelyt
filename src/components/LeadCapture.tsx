"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type LeadCaptureProps = {
  source: string;
  variant?: "cta" | "footer";
  defaultInterest?: string;
};

const interestOptions = [
  { value: "early-customer", label: "Early customer" },
  { value: "business-travel", label: "Business travel" },
  { value: "family-trip", label: "Family trip" },
  { value: "frequent-traveler", label: "Frequent traveler" },
  { value: "corporate-team", label: "Corporate team" },
  { value: "embassy-consular", label: "Embassy or consular team" },
  { value: "hotel-partner", label: "Hotel partner" },
  { value: "airport-partner", label: "Airport partner" },
];

function saveLocalLead(email: string, interest: string, source: string) {
  try {
    const key = "travelyt:leads";
    const raw = window.localStorage.getItem(key);
    const rows = raw ? (JSON.parse(raw) as unknown[]) : [];
    rows.push({ email, interest, source, createdAt: new Date().toISOString() });
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Local backup is best-effort; the API request is the primary action.
  }
}

export default function LeadCapture({
  source,
  variant = "cta",
  defaultInterest = interestOptions[0].value,
}: LeadCaptureProps) {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState(defaultInterest);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setStatus("error");
      setMessage("Enter a valid email.");
      return;
    }

    setStatus("loading");
    setMessage("");
    saveLocalLead(cleanEmail, interest, source);

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, interest, source }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to notify");
      }

      setStatus("success");
      setMessage("You're on the list. We'll reach out with route availability.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Saved on this device. Live email capture still needs setup.");
    }
  }

  if (variant === "footer") {
    return (
      <form onSubmit={submit} className="space-y-3">
        <div className="flex">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="your@email.com"
            aria-label="Email address"
            className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded-l-xl px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-cyan/50 transition-colors"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="bg-purple text-white font-semibold px-5 py-3 rounded-r-xl text-sm hover:bg-purple-light transition-colors disabled:opacity-60"
          >
            Join
          </button>
        </div>
        {message && (
          <p className={`text-xs ${status === "error" ? "text-red-200" : "text-white/70"}`}>
            {message}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto grid max-w-3xl grid-cols-1 gap-3 rounded-2xl bg-white p-3 shadow-xl shadow-navy/10 sm:grid-cols-[1fr_180px_auto]"
    >
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="your@email.com"
        aria-label="Email address"
        className="min-w-0 rounded-xl border border-gray-200 px-4 py-3 text-sm text-navy outline-none transition-all focus:border-purple focus:ring-2 focus:ring-purple/20"
      />
      <select
        value={interest}
        onChange={(event) => setInterest(event.target.value)}
        aria-label="Interest"
        className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-navy outline-none transition-all focus:border-purple focus:ring-2 focus:ring-purple/20"
      >
        {interestOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-xl bg-navy px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {status === "loading" ? "Joining..." : "Get updates"}
      </button>
      {message && (
        <p className={`sm:col-span-3 text-sm ${status === "error" ? "text-red-600" : "text-navy/70"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
