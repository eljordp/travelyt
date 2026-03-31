"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

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
    <div className="min-h-screen bg-[#f5f0ee]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-16">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy">Welcome back, Jordan</h1>
          <p className="text-navy/50 mt-1">Manage your baggage pickups and account settings.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm shadow-navy/5 w-fit mb-8">
          {(["overview", "bookings", "settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all cursor-pointer ${tab === t ? "bg-navy text-white shadow-sm" : "text-navy/50 hover:text-navy"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-8">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { label: "Active Bookings", value: "2", icon: "📦" },
                { label: "Bags Moved", value: "7", icon: "✈️" },
                { label: "Next Pickup", value: "Apr 3", icon: "📅" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-2xl p-6 shadow-sm shadow-navy/5">
                  <div className="text-3xl mb-3">{s.icon}</div>
                  <div className="text-3xl font-bold text-navy">{s.value}</div>
                  <div className="text-sm text-navy/50 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent bookings */}
            <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-navy">Recent Bookings</h2>
                <button onClick={() => setTab("bookings")} className="text-sm text-[#c41e2a] hover:underline cursor-pointer">View all</button>
              </div>
              <BookingsTable bookings={mockBookings.slice(0, 2)} />
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a href="/quote" className="bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white rounded-2xl p-6 flex items-center gap-4 hover:opacity-90 transition-opacity">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-xl">📦</div>
                <div>
                  <div className="font-bold">Book a Pickup</div>
                  <div className="text-sm text-white/70">Get an instant quote</div>
                </div>
              </a>
              <a href="#" className="bg-white text-navy rounded-2xl p-6 flex items-center gap-4 hover:shadow-md transition-shadow shadow-sm shadow-navy/5">
                <div className="w-12 h-12 rounded-xl bg-[#f5f0ee] flex items-center justify-center text-xl">📍</div>
                <div>
                  <div className="font-bold">Track My Bags</div>
                  <div className="text-sm text-navy/50">Live GPS tracking</div>
                </div>
              </a>
            </div>
          </div>
        )}

        {/* Bookings */}
        {tab === "bookings" && (
          <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-navy">All Bookings</h2>
            </div>
            <BookingsTable bookings={mockBookings} />
          </div>
        )}

        {/* Settings */}
        {tab === "settings" && (
          <div className="bg-white rounded-2xl shadow-sm shadow-navy/5 p-8 max-w-xl">
            <h2 className="font-bold text-navy text-lg mb-6">Profile Settings</h2>
            <div className="space-y-5">
              {(["name", "email", "phone", "address"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-navy/50 uppercase tracking-wider mb-1.5 capitalize">
                    {field === "address" ? "Home Address" : field}
                  </label>
                  <input
                    type={field === "email" ? "email" : "text"}
                    value={settings[field]}
                    onChange={(e) => setSettings((s) => ({ ...s, [field]: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all"
                  />
                </div>
              ))}
              <button className="bg-gradient-to-r from-[#c41e2a] to-[#e63946] text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity cursor-pointer">
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BookingsTable({ bookings }: { bookings: typeof mockBookings }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {["Booking ID", "Date", "Service", "Airport", "Bags", "Status"].map((h) => (
              <th key={h} className="text-left text-xs font-semibold text-navy/40 uppercase tracking-wider px-6 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {bookings.map((b) => (
            <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-6 py-4 font-mono text-xs text-navy/60">{b.id}</td>
              <td className="px-6 py-4 text-navy/70">{b.date}</td>
              <td className="px-6 py-4 text-navy font-medium">{b.service}</td>
              <td className="px-6 py-4 font-semibold text-navy">{b.airport}</td>
              <td className="px-6 py-4 text-navy/70">{b.bags}</td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[b.status]}`}>{b.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
