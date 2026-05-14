"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  type Booking,
  formatPrice,
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDriver(localStorage.getItem(DRIVER_KEY));
    const refresh = () => setBookings(getBookings());
    refresh();
    const unsub = subscribe(refresh);
    return unsub;
  }, []);

  function chooseDriver(name: string) {
    localStorage.setItem(DRIVER_KEY, name);
    setDriver(name);
  }

  function signOut() {
    localStorage.removeItem(DRIVER_KEY);
    setDriver(null);
  }

  function resetDemo() {
    if (!confirm("Clear all demo bookings on this device?")) return;
    localStorage.removeItem("travelyt:bookings");
    localStorage.removeItem(DRIVER_KEY);
    window.location.reload();
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen bg-[#f5f0ee]">
        <Navbar />
        <div className="max-w-md mx-auto px-4 pt-28 pb-16">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-navy mb-2">Courier Login</h1>
            <p className="text-navy/50 text-sm">Pick a driver to sign in as for the demo.</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg shadow-navy/5 p-6 space-y-3">
            {DRIVER_OPTIONS.map((name) => (
              <button
                key={name}
                onClick={() => chooseDriver(name)}
                className="w-full text-left px-5 py-4 rounded-xl border border-gray-100 hover:border-[#c41e2a] hover:bg-[#c41e2a]/5 transition-all cursor-pointer flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center font-bold text-sm">
                  {name.split(" ").map((p) => p[0]).join("")}
                </div>
                <div>
                  <div className="font-semibold text-navy">{name}</div>
                  <div className="text-xs text-navy/40">Courier · Demo account</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
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
    <div className="min-h-screen bg-[#f5f0ee]">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 pt-28 pb-16">
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs text-navy/40 uppercase tracking-wider font-semibold mb-1">
              Courier dashboard
            </p>
            <h1 className="text-2xl font-bold text-navy">Hi, {driver.split(" ")[0]}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={resetDemo} className="text-xs text-navy/40 hover:text-navy underline cursor-pointer">
              Reset demo
            </button>
            <button onClick={signOut} className="text-xs text-navy/40 hover:text-navy underline cursor-pointer">
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
          <div className="bg-white/60 border border-dashed border-navy/15 rounded-2xl p-8 text-center text-sm text-navy/50">
            No bookings yet on this device.{" "}
            <Link href="/quote" className="underline font-semibold">
              Create one as a customer
            </Link>{" "}
            to see it appear here.
          </div>
        )}
      </div>
    </div>
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
      <h2 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-3">
        {title}
      </h2>
      {hasChildren ? (
        <div className="space-y-3">{children}</div>
      ) : empty ? (
        <div className="bg-white/60 rounded-xl p-5 text-sm text-navy/40 text-center border border-dashed border-navy/10">
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
      className={`block bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-[#c41e2a]/30 ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="font-semibold text-navy">{booking.name}</div>
          <div className="text-xs text-navy/40 mt-0.5">{booking.id}</div>
        </div>
        <span className="text-xs font-semibold text-[#c41e2a] bg-[#c41e2a]/10 px-2.5 py-1 rounded-full">
          {STATUS_LABELS[booking.status]}
        </span>
      </div>
      <div className="space-y-1 text-sm text-navy/60">
        <div>
          <span className="text-navy/40">Service:</span>{" "}
          {SERVICE_LABELS[booking.service]} · {booking.bags} bag
          {booking.bags > 1 ? "s" : ""}
        </div>
        <div>
          <span className="text-navy/40">Address:</span> {booking.address}
        </div>
        <div>
          <span className="text-navy/40">Airport:</span> {booking.airport} · {booking.date}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
        <span className="text-navy/40">Payout</span>
        <span className="font-semibold text-navy">
          {formatPrice(Math.round(booking.priceCents * 0.65))}
        </span>
      </div>
    </Link>
  );
}
