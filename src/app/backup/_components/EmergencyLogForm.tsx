"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BACKUP_LOG_CATEGORIES,
  BACKUP_STATUS_LABELS,
  BACKUP_STATUS_OPTIONS,
  type BackupLogCategory,
} from "@/lib/backup-ops";
import type { BookingStatus } from "@/lib/bookings";

export default function EmergencyLogForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<BackupLogCategory>("note");
  const [note, setNote] = useState("");
  const [sealId, setSealId] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");

    try {
      const response = await fetch(`/api/backup/bookings/${bookingId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          category,
          note,
          sealId,
          status: status || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not save emergency log.");
      }
      setNote("");
      setSealId("");
      setStatus("");
      setSaved("Emergency log saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save emergency log.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-navy/10 bg-white p-5 shadow-sm shadow-navy/5">
      <h2 className="text-lg font-black text-navy">Emergency log</h2>
      <p className="mt-1 text-sm leading-6 text-navy/60">
        Use this when normal app proof, driver actions, or customer tracking are
        unavailable. This writes to the booking audit history.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
            Log type
          </label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as BackupLogCategory)}
            className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          >
            {BACKUP_LOG_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
            Manual status override
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as BookingStatus | "")}
            className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          >
            <option value="">No status change</option>
            {BACKUP_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {BACKUP_STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
          Seal ID or outside proof reference
        </label>
        <input
          value={sealId}
          onChange={(event) => setSealId(event.target.value.toUpperCase())}
          className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm uppercase tracking-wide outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          placeholder="Example: TVT-483921 or text thread ref"
        />
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
          What happened
        </label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          className="w-full resize-none rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          placeholder="Example: Driver texted seal photo at 4:12 PM. Customer approved by phone. Airline counter asked for later handoff."
        />
      </div>
      {error && (
        <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          {saved}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded-xl bg-coral px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save emergency log"}
      </button>
    </form>
  );
}
