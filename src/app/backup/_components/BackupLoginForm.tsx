"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BackupLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not sign in.");
      }
      router.push("/backup/bookings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
          Admin email
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          placeholder="ops@travelyt.us"
          autoComplete="email"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy/60">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-navy/10 px-4 py-3 text-sm outline-none transition focus:border-coral focus:ring-2 focus:ring-coral/10"
          placeholder="Emergency access password"
          autoComplete="current-password"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-navy px-5 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Opening backup ops..." : "Open Backup Ops"}
      </button>
    </form>
  );
}
