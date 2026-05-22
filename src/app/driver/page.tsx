"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppChrome from "@/components/AppChrome";
import {
  type Booking,
  clearLocalBookings,
  clearDriverAccessCode,
  formatPrice,
  setDriverAccessCode,
  getBookings,
  subscribe,
  SERVICE_LABELS,
  STATUS_LABELS,
} from "@/lib/bookings";

const DRIVER_KEY = "travelyt:driver";

const DRIVER_OPTIONS = [
  "Marcus J.",
  "Diane R.",
  "Anwar K.",
  "Sophia L.",
];

export default function DriverDashboard() {
  const [driver, setDriver] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await getBookings();
      if (!cancelled) setBookings(rows);
    };
    const handle = window.setTimeout(() => {
      setMounted(true);
      setDriver(localStorage.getItem(DRIVER_KEY));
      refresh();
    }, 0);
    const unsub = subscribe(refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      unsub();
    };
  }, []);

  function chooseDriver(name: string) {
    if (accessCode.trim()) setDriverAccessCode(accessCode.trim());
    localStorage.setItem(DRIVER_KEY, name);
    setDriver(name);
  }

  function signOut() {
    localStorage.removeItem(DRIVER_KEY);
    clearDriverAccessCode();
    setDriver(null);
  }

  function resetDemo() {
    if (!confirm("Clear local demo cache on this device? Backend bookings stay intact.")) return;
    clearLocalBookings();
    localStorage.removeItem(DRIVER_KEY);
    clearDriverAccessCode();
    window.location.reload();
  }

  if (!mounted) {
    return (
      <AppChrome title="Driver">
        <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
          <div className="h-4 w-32 rounded-full bg-navy/10" />
          <div className="mt-4 h-20 rounded-xl bg-navy/5" />
        </div>
      </AppChrome>
    );
  }

  if (!driver) {
    return (
      <AppChrome title="Driver">
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-navy">Courier Login</h1>
            <p className="mt-1 text-sm text-navy/65">Select a courier profile.</p>
          </div>
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
            <div>
              <label htmlFor="driver-access-code" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                Access code
              </label>
              <input
                id="driver-access-code"
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Required when production driver lock is enabled"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all"
              />
            </div>
            {DRIVER_OPTIONS.map((name) => (
              <button
                key={name}
                onClick={() => chooseDriver(name)}
                className="w-full text-left px-5 py-4 rounded-xl border border-gray-100 hover:border-[#ff6b6b] hover:bg-[#ff6b6b]/5 transition-all cursor-pointer flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center font-bold text-sm">
                  {name.split(" ").map((p) => p[0]).join("")}
                </div>
                <div>
                  <div className="font-semibold text-navy">{name}</div>
                  <div className="text-xs text-navy/70">Courier · Demo account</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </AppChrome>
    );
  }

  const available = bookings.filter((b) => b.status === "paid");
  const mine = bookings.filter(
    (b) =>
      b.driverName === driver &&
      b.status !== "delivered" &&
      b.status !== "paid"
  );
  const completed = bookings.filter(
    (b) => b.driverName === driver && b.status === "delivered"
  );

  return (
    <AppChrome title="Driver">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-navy/70 uppercase tracking-wider font-semibold mb-1">
              Courier dashboard
            </p>
            <h1 className="text-2xl font-bold text-navy">Hi, {driver.split(" ")[0]}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={resetDemo} className="text-xs text-navy/70 hover:text-navy underline cursor-pointer">
              Reset demo
            </button>
            <button onClick={signOut} className="text-xs text-navy/70 hover:text-navy underline cursor-pointer">
              Sign out
            </button>
          </div>
        </div>

        <Section title="My active jobs" empty="Nothing assigned yet — claim one below.">
          {mine.map((b) => (
            <JobCard key={b.id} booking={b} />
          ))}
        </Section>

        <Section title="Available pickups" empty="No new jobs right now.">
          {available.map((b) => (
            <JobCard key={b.id} booking={b} />
          ))}
        </Section>

        {completed.length > 0 && (
          <Section title={`Completed (${completed.length})`} empty="">
            {completed.map((b) => (
              <JobCard key={b.id} booking={b} muted />
            ))}
          </Section>
        )}

        {bookings.length === 0 && (
          <div className="bg-white/60 border border-dashed border-navy/15 rounded-2xl p-8 text-center text-sm text-navy/70">
            No bookings are available yet.{" "}
            <Link href="/quote" className="underline font-semibold">
              Create one as a customer
            </Link>{" "}
            to see it appear here.
          </div>
        )}
      </div>
    </AppChrome>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: string;
}) {
  const hasChildren =
    Array.isArray(children) && children.filter(Boolean).length > 0;
  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-navy/70 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {hasChildren ? (
        <div className="space-y-3">{children}</div>
      ) : empty ? (
        <div className="bg-white/60 rounded-xl p-5 text-sm text-navy/70 text-center border border-dashed border-navy/10">
          {empty}
        </div>
      ) : null}
    </div>
  );
}

function JobCard({ booking, muted = false }: { booking: Booking; muted?: boolean }) {
  return (
    <Link
      href={`/driver/job/${booking.id}`}
      className={`block bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-[#ff6b6b]/30 ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="font-semibold text-navy">{booking.name}</div>
          <div className="text-xs text-navy/70 mt-0.5">{booking.id}</div>
        </div>
        <span className="text-xs font-semibold text-[#ff6b6b] bg-[#ff6b6b]/10 px-2.5 py-1 rounded-full">
          {STATUS_LABELS[booking.status]}
        </span>
      </div>
      <div className="space-y-1 text-sm text-navy/70">
        <div>
          <span className="text-navy/70">Service:</span>{" "}
          {SERVICE_LABELS[booking.service]} · {booking.bags} bag
          {booking.bags > 1 ? "s" : ""}
        </div>
        <div>
          <span className="text-navy/70">Address:</span> {booking.address}
        </div>
        <div>
          <span className="text-navy/70">Airport:</span> {booking.airport} · {booking.date}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
        <span className="text-navy/70">Payout</span>
        <span className="font-semibold text-navy">
          {formatPrice(Math.round(booking.priceCents * 0.65))}
        </span>
      </div>
    </Link>
  );
}
