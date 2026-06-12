"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import AppChrome from "@/components/AppChrome";
import {
  type Booking,
  clearLocalBookings,
  clearDriverAccessCode,
  formatPrice,
  getBookingStatusLabel,
  getBookings,
  subscribe,
  SERVICE_LABELS,
} from "@/lib/bookings";
import {
  driverInitials,
  driverNameMatches,
} from "@/lib/drivers";

const DRIVER_KEY = "travelyt:driver";

type DriverSessionResponse = {
  ok?: boolean;
  authenticated?: boolean;
  error?: string;
  driver?: {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  } | null;
};

function isPastTrip(booking: Booking) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsed = Date.parse(`${booking.date}T00:00:00`);
  return !Number.isNaN(parsed) && parsed < today.getTime();
}

export default function DriverDashboard() {
  const [driver, setDriver] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [customDriverName, setCustomDriverName] = useState("");
  const [loginError, setLoginError] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setLoadingBookings(true);
      const rows = await getBookings();
      if (!cancelled) {
        setBookings(rows);
        setLoadingBookings(false);
      }
    };
    const handle = window.setTimeout(() => {
      setMounted(true);
      void (async () => {
        try {
          const response = await fetch("/api/drivers/session", {
            credentials: "same-origin",
          });
          const data = (await response.json()) as DriverSessionResponse;
          if (response.ok && data.authenticated && data.driver?.name) {
            localStorage.setItem(DRIVER_KEY, data.driver.name);
            setDriver(data.driver.name);
          } else {
            localStorage.removeItem(DRIVER_KEY);
          }
        } catch {
          localStorage.removeItem(DRIVER_KEY);
        }
        await refresh();
      })();
    }, 0);
    const unsub = subscribe(refresh);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      unsub();
    };
  }, []);

  async function chooseDriver(name: string) {
    const cleanName = name.trim();
    if (!cleanName) {
      setLoginError("Enter the courier name assigned by ops.");
      return;
    }
    const cleanCode = accessCode.trim();
    if (!cleanCode) {
      setLoginError("Enter the access code ops gave you.");
      return;
    }
    setLoginError("");
    setLoadingBookings(true);
    try {
      const response = await fetch("/api/drivers/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          driverName: cleanName,
          accessCode: cleanCode,
        }),
      });
      const data = (await response.json()) as DriverSessionResponse;
      if (!response.ok || !data.driver?.name) {
        throw new Error(data.error || "Driver name or access code is incorrect.");
      }
      clearDriverAccessCode();
      localStorage.setItem(DRIVER_KEY, data.driver.name);
      setDriver(data.driver.name);
      setAccessCode("");
      setBookings(await getBookings());
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Could not open courier session.");
    } finally {
      setLoadingBookings(false);
    }
  }

  async function signOut() {
    await fetch("/api/drivers/session", {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => undefined);
    localStorage.removeItem(DRIVER_KEY);
    clearDriverAccessCode();
    setProfileOpen(false);
    setDriver(null);
  }

  function resetLocalSession() {
    if (!confirm("Clear the local courier session on this device? Backend bookings stay intact.")) return;
    clearLocalBookings();
    localStorage.removeItem(DRIVER_KEY);
    clearDriverAccessCode();
    void fetch("/api/drivers/session", {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => undefined);
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
            <p className="mt-1 text-sm text-navy/65">Enter the courier profile and access code issued by ops.</p>
          </div>
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
            {loginError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {loginError}
              </p>
            )}
            <div>
              <label htmlFor="driver-access-code" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                Access code
              </label>
              <input
                id="driver-access-code"
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="TVT-..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all"
              />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void chooseDriver(customDriverName);
              }}
              className="grid gap-3 sm:grid-cols-[1fr_auto]"
            >
              <div>
                <label htmlFor="driver-name" className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5">
                  Courier name
                </label>
                <input
                  id="driver-name"
                  value={customDriverName}
                  onChange={(event) => setCustomDriverName(event.target.value)}
                  placeholder="Your courier name"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6868] focus:ring-2 focus:ring-[#ff6868]/10 outline-none text-sm transition-all"
                />
              </div>
              <button
                type="submit"
                className="self-end rounded-xl bg-navy px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            </form>
          </div>
          <div className="rounded-2xl border border-dashed border-navy/15 bg-white/60 p-5 text-center text-sm text-navy/70">
            Not a courier yet?{" "}
            <Link
              href="/driver/apply"
              className="font-semibold text-[#ff6868] underline"
            >
              Apply to drive
            </Link>
          </div>
        </div>
      </AppChrome>
    );
  }

  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const available = bookings.filter(
    (b) => b.status === "paid" && !b.driverName && !isPastTrip(b)
  );
  const mine = bookings.filter(
    (b) =>
      driverNameMatches(b.driverName, driver) &&
      [
        "assigned",
        "accepted",
        "en_route",
        "arrived",
        "picked_up",
        "in_transit",
        "delivery_pending",
      ].includes(b.status)
  );
  const completed = bookings.filter(
    (b) =>
      driverNameMatches(b.driverName, driver) &&
      (b.status === "delivered" || b.status === "closed")
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
          <div className="relative">
            <button
              onClick={() => setProfileOpen((open) => !open)}
              className="flex h-11 items-center gap-2 rounded-full bg-white px-2.5 text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
              aria-label="Open courier profile"
              aria-expanded={profileOpen}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                {driverInitials(driver)}
              </span>
              <ChevronDown className="h-4 w-4 text-navy/55" strokeWidth={2} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-20 w-72 overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-xl shadow-navy/10">
                <div className="border-b border-gray-100 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                      {driverInitials(driver)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy">
                        {driver}
                      </p>
                      <p className="truncate text-xs text-navy/55">Courier profile</p>
                    </div>
                  </div>
                  <span className="mt-3 inline-flex rounded-full bg-[#ff6868]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#ff6868]">
                    Role: driver
                  </span>
                </div>
                <Link
                  href="/driver/apply"
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-navy transition-colors hover:bg-navy/5"
                >
                  <UserRound className="h-4 w-4" strokeWidth={2} />
                  Account details
                </Link>
                <button
                  type="button"
                  onClick={resetLocalSession}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-navy transition-colors hover:bg-navy/5"
                >
                  <Settings className="h-4 w-4" strokeWidth={2} />
                  Reset local session
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2} />
                  Logout
                </button>
              </div>
            )}
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

        {pendingCount > 0 && (
          <div className="rounded-2xl border border-dashed border-navy/15 bg-white/70 p-5 text-sm leading-relaxed text-navy/70">
            {pendingCount} booking{pendingCount === 1 ? " is" : "s are"} still
            pending payment or manual confirmation. Customer details stay
            hidden from couriers until Travelyt confirms the job.
          </div>
        )}

        {completed.length > 0 && (
          <Section title={`Completed (${completed.length})`} empty="">
            {completed.map((b) => (
              <JobCard key={b.id} booking={b} muted />
            ))}
          </Section>
        )}

        {loadingBookings && (
          <div className="bg-white/60 rounded-xl p-5 text-sm text-navy/70 text-center border border-dashed border-navy/10">
            Loading dispatch board...
          </div>
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

function JobCard({
  booking,
  muted = false,
  note,
}: {
  booking: Booking;
  muted?: boolean;
  note?: string;
}) {
  const isPending = booking.status === "pending";
  const title = isPending ? "Customer hidden" : booking.name;
  const address = isPending
    ? "Hidden until Travelyt confirms this booking."
    : booking.address;
  const payout = isPending ? "Pending" : formatPrice(Math.round(booking.priceCents * 0.65));

  return (
    <Link
      href={`/driver/job/${booking.id}`}
      className={`block bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-[#ff6868]/30 ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="font-semibold text-navy">{title}</div>
          <div className="text-xs text-navy/70 mt-0.5">{booking.id}</div>
        </div>
        <span className="text-xs font-semibold text-[#ff6868] bg-[#ff6868]/10 px-2.5 py-1 rounded-full">
          {note ?? getBookingStatusLabel(booking)}
        </span>
      </div>
      <div className="space-y-1 text-sm text-navy/70">
        <div>
          <span className="text-navy/70">Service:</span>{" "}
          {SERVICE_LABELS[booking.service]} · {booking.bags} bag
          {booking.bags > 1 ? "s" : ""}
        </div>
        <div>
          <span className="text-navy/70">Address:</span> {address}
        </div>
        <div>
          <span className="text-navy/70">Airport:</span> {booking.airport} · {booking.date}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
        <span className="text-navy/70">
          {booking.status === "pending" ? "Estimated payout" : "Payout"}
        </span>
        <span className="font-semibold text-navy">
          {payout}
        </span>
      </div>
    </Link>
  );
}
