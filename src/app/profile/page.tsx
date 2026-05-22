"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CreditCard,
  MapPin,
  Package,
  PlusCircle,
  Settings,
} from "lucide-react";
import AppChrome from "@/components/AppChrome";

type Tab = "overview" | "bookings" | "settings";

const mockBookings = [
  { id: "TVT-001", date: "Apr 3, 2026", service: "Departure", airport: "LAX", bags: 2, status: "Scheduled" },
  { id: "TVT-002", date: "Mar 22, 2026", service: "Arrival", airport: "JFK", bags: 3, status: "Completed" },
  { id: "TVT-003", date: "Mar 10, 2026", service: "Departure", airport: "ORD", bags: 1, status: "Completed" },
];

const statusColors: Record<string, string> = {
  Scheduled: "bg-blue-100 text-blue-700",
  Completed: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-600",
};

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [settings, setSettings] = useState({ name: "Jordan Williams", email: "jordan@example.com", phone: "+1 (555) 012-3456", address: "123 Main St, Los Angeles, CA 90001" });

  return (
    <AppChrome title="Trips">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-navy">Welcome back, Jordan</h1>
          <p className="mt-1 text-sm text-navy/65">
            Your bag handoffs, payments, and profile details.
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 shadow-sm shadow-navy/5">
          {(["overview", "bookings", "settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold capitalize transition-all cursor-pointer ${tab === t ? "bg-navy text-white shadow-sm" : "text-navy/70 hover:text-navy"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Active", value: "2", icon: Package },
                { label: "Moved", value: "7", icon: MapPin },
                { label: "Next", value: "Apr 3", icon: CalendarDays },
              ].map((s) => {
                const Icon = s.icon;
                return (
                <div key={s.label} className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
                  <Icon className="mb-3 h-5 w-5 text-[#ff6b6b]" strokeWidth={2} />
                  <div className="text-2xl font-bold text-navy">{s.value}</div>
                  <div className="mt-1 text-xs text-navy/60">{s.label}</div>
                </div>
                );
              })}
            </div>

            {/* Recent bookings */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-navy/5">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
                <h2 className="font-bold text-navy">Recent Bookings</h2>
                <button onClick={() => setTab("bookings")} className="text-sm text-[#ff6b6b] hover:underline cursor-pointer">View all</button>
              </div>
              <BookingsList bookings={mockBookings.slice(0, 2)} />
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/quote" className="flex items-center gap-3 rounded-2xl bg-[#ff6b6b] p-4 text-white transition-opacity hover:opacity-90">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <PlusCircle className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="font-bold">Book a Pickup</div>
                  <div className="text-sm text-white/70">Get an instant quote</div>
                </div>
              </Link>
              <Link href="/booking/demo" className="flex items-center gap-3 rounded-2xl bg-white p-4 text-navy shadow-sm shadow-navy/5 transition-shadow hover:shadow-md">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f6f7fb]">
                  <MapPin className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="font-bold">Track My Bags</div>
                  <div className="text-sm text-navy/70">Live GPS tracking</div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Bookings */}
        {tab === "bookings" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-navy/5">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="font-bold text-navy">All Bookings</h2>
            </div>
            <BookingsList bookings={mockBookings} />
          </div>
        )}

        {/* Settings */}
        {tab === "settings" && (
          <div className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5 text-navy">
                <Settings className="h-5 w-5" strokeWidth={2} />
              </span>
              <h2 className="text-lg font-bold text-navy">Profile Settings</h2>
            </div>
            <div className="space-y-5">
              {(["name", "email", "phone", "address"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5 capitalize">
                    {field === "address" ? "Home Address" : field}
                  </label>
                  <input
                    type={field === "email" ? "email" : "text"}
                    value={settings[field]}
                    onChange={(e) => setSettings((s) => ({ ...s, [field]: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#ff6b6b] focus:ring-2 focus:ring-[#ff6b6b]/10 outline-none text-sm transition-all"
                  />
                </div>
              ))}
              <button className="w-full rounded-xl bg-[#ff6b6b] px-8 py-3 font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer">
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </AppChrome>
  );
}

function BookingsList({ bookings }: { bookings: typeof mockBookings }) {
  return (
    <div className="divide-y divide-gray-100">
      {bookings.map((b) => (
        <Link
          key={b.id}
          href="/profile"
          className="flex items-center gap-3 p-4 transition-colors hover:bg-gray-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f6f7fb] text-navy">
            <CreditCard className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-navy">
              {b.service} · {b.airport}
            </span>
            <span className="mt-0.5 block text-xs text-navy/55">
              {b.date} · {b.bags} bag{b.bags > 1 ? "s" : ""} · {b.id}
            </span>
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[b.status]}`}>
            {b.status}
          </span>
        </Link>
      ))}
    </div>
  );
}
