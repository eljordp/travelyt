"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  LogOut,
  MapPin,
  Package,
  PlusCircle,
  Settings,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import AppChrome from "@/components/AppChrome";
import {
  formatPrice,
  getBookings,
  getBookingTrackingHref,
  SERVICE_LABELS,
  STATUS_LABELS,
  type Booking,
} from "@/lib/bookings";
import { getSupabaseBrowser } from "@/lib/supabase-client";

type Tab = "overview" | "bookings" | "settings";
type AuthState = "loading" | "ready" | "signed-out" | "unconfigured";

type ProfileSettings = {
  name: string;
  email: string;
  phone: string;
  address: string;
};

const emptySettings: ProfileSettings = {
  name: "",
  email: "",
  phone: "",
  address: "",
};

const statusColors: Record<Booking["status"], string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-blue-100 text-blue-700",
  assigned: "bg-indigo-100 text-indigo-700",
  picked_up: "bg-purple-100 text-purple-700",
  in_transit: "bg-cyan-100 text-cyan-700",
  delivered: "bg-green-100 text-green-700",
};

function loginUrl() {
  return `/login?next=${encodeURIComponent("/profile")}`;
}

function settingsFromUser(user: User): ProfileSettings {
  const metadata = user.user_metadata ?? {};
  const name =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : "";

  return {
    name,
    email: user.email ?? "",
    phone: typeof metadata.phone === "string" ? metadata.phone : "",
    address: typeof metadata.address === "string" ? metadata.address : "",
  };
}

function customerBookings(rows: Booking[], user: User) {
  const email = user.email?.toLowerCase();
  return rows.filter((booking) => {
    if (booking.customerUserId) return booking.customerUserId === user.id;
    return Boolean(email && booking.email.toLowerCase() === email);
  });
}

function bookingTime(booking: Booking) {
  const parsed = Date.parse(`${booking.date}T00:00:00`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatTripDate(value: string) {
  const parsed = Date.parse(`${value}T00:00:00`);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed));
}

function firstName(user: User | null, settings: ProfileSettings) {
  const source = settings.name || user?.email || "there";
  return source.trim().split(/\s+/)[0] || "there";
}

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [settings, setSettings] = useState<ProfileSettings>(emptySettings);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowser();

    async function loadProfile() {
      if (!supabase) {
        setAuthState("unconfigured");
        setBookingsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;

      if (cancelled) return;
      if (!sessionUser) {
        setAuthState("signed-out");
        window.location.href = loginUrl();
        return;
      }

      setUser(sessionUser);
      setSettings(settingsFromUser(sessionUser));
      setAuthState("ready");

      const rows = await getBookings();
      if (!cancelled) {
        setBookings(customerBookings(rows, sessionUser));
        setBookingsLoading(false);
      }
    }

    void loadProfile();

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          window.location.href = loginUrl();
          return;
        }
        setUser(session.user);
        setSettings(settingsFromUser(session.user));
      }) ?? { data: { subscription: null } };

    return () => {
      cancelled = true;
      listener.subscription?.unsubscribe();
    };
  }, []);

  const activeBookings = useMemo(
    () => bookings.filter((booking) => booking.status !== "delivered"),
    [bookings]
  );

  const nextBooking = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return activeBookings
      .filter((booking) => bookingTime(booking) >= today.getTime())
      .sort((a, b) => bookingTime(a) - bookingTime(b))[0];
  }, [activeBookings]);

  const stats = [
    { label: "Active", value: `${activeBookings.length}`, icon: Package },
    {
      label: "Bags",
      value: `${bookings.reduce((sum, booking) => sum + booking.bags, 0)}`,
      icon: MapPin,
    },
    {
      label: "Next",
      value: nextBooking ? formatTripDate(nextBooking.date).replace(", 2026", "") : "None",
      icon: CalendarDays,
    },
  ];

  const trackHref = activeBookings[0]
    ? getBookingTrackingHref(activeBookings[0])
    : "/quote";

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || !user) return;

    const name = settings.name.trim();
    const email = settings.email.trim().toLowerCase();
    const phone = settings.phone.trim();
    const address = settings.address.trim();

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError("Enter a valid email.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { data, error: updateError } = await supabase.auth.updateUser({
      email: email !== user.email ? email : undefined,
      data: {
        full_name: name,
        phone,
        address,
      },
    });

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (data.user) {
      setUser(data.user);
      setSettings(settingsFromUser(data.user));
    }

    setNotice(
      email !== user.email
        ? "Profile saved. Check your new email address to confirm the change."
        : "Profile saved."
    );
  }

  async function signOut() {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
    window.location.href = "/login";
  }

  async function deleteAccount() {
    const supabase = getSupabaseBrowser();
    const session = supabase
      ? (await supabase.auth.getSession()).data.session
      : null;

    if (!session?.access_token) {
      setError("Sign in again before deleting your account.");
      return;
    }

    const confirmed = window.confirm(
      "Delete your Travelyt account? This removes your login and profile. Booking records needed for operations, claims, legal, or safety reasons may be retained as described in the Privacy Policy."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    setNotice("");

    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    setDeleting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Could not delete account.");
      return;
    }

    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  if (authState === "loading" || authState === "signed-out") {
    return (
      <AppChrome title="Trips">
        <ProfileSkeleton />
      </AppChrome>
    );
  }

  if (authState === "unconfigured") {
    return (
      <AppChrome title="Trips">
        <div className="rounded-2xl bg-white p-6 text-sm text-navy/70 shadow-sm shadow-navy/5">
          Customer login is not configured yet. Add Supabase browser env vars to
          enable real accounts.
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title="Trips">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-navy">
              Welcome back, {firstName(user, settings)}
            </h1>
            <p className="mt-1 text-sm text-navy/65">
              Your bag handoffs, requests, and profile details.
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-navy shadow-sm shadow-navy/5 transition-colors hover:bg-navy/5"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 shadow-sm shadow-navy/5">
          {(["overview", "bookings", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold capitalize transition-all cursor-pointer ${
                tab === t
                  ? "bg-navy text-white shadow-sm"
                  : "text-navy/70 hover:text-navy"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5"
                  >
                    <Icon
                      className="mb-3 h-5 w-5 text-[#c41e2a]"
                      strokeWidth={2}
                    />
                    <div className="text-2xl font-bold text-navy">{s.value}</div>
                    <div className="mt-1 text-xs text-navy/60">{s.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-navy/5">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
                <h2 className="font-bold text-navy">Recent Bookings</h2>
                <button
                  onClick={() => setTab("bookings")}
                  className="text-sm text-[#c41e2a] hover:underline cursor-pointer"
                >
                  View all
                </button>
              </div>
              <BookingsList
                bookings={bookings.slice(0, 2)}
                loading={bookingsLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/quote"
                className="flex items-center gap-3 rounded-2xl bg-[#c41e2a] p-4 text-white transition-opacity hover:opacity-90"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <PlusCircle className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="font-bold">Book a Pickup</div>
                  <div className="text-sm text-white/70">Get an instant quote</div>
                </div>
              </Link>
              <Link
                href={trackHref}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 text-navy shadow-sm shadow-navy/5 transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f6f7fb]">
                  <MapPin className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="font-bold">Track My Bags</div>
                  <div className="text-sm text-navy/70">
                    {activeBookings[0] ? activeBookings[0].id : "Create a trip first"}
                  </div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {tab === "bookings" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm shadow-navy/5">
            <div className="border-b border-gray-100 px-4 py-4">
              <h2 className="font-bold text-navy">All Bookings</h2>
            </div>
            <BookingsList bookings={bookings} loading={bookingsLoading} />
          </div>
        )}

        {tab === "settings" && (
          <form
            onSubmit={saveSettings}
            className="rounded-2xl bg-white p-5 shadow-sm shadow-navy/5"
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/5 text-navy">
                <Settings className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-navy">Profile Settings</h2>
                <p className="text-xs text-navy/55">Stored on your Travelyt account.</p>
              </div>
            </div>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            )}
            {notice && (
              <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {notice}
              </p>
            )}

            <div className="space-y-5">
              {(["name", "email", "phone", "address"] as const).map((field) => (
                <div key={field}>
                  <label
                    htmlFor={`profile-${field}`}
                    className="block text-xs font-semibold text-navy/70 uppercase tracking-wider mb-1.5 capitalize"
                  >
                    {field === "address" ? "Home Address" : field}
                  </label>
                  <input
                    id={`profile-${field}`}
                    type={field === "email" ? "email" : "text"}
                    value={settings[field]}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, [field]: e.target.value }))
                    }
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#c41e2a] focus:ring-2 focus:ring-[#c41e2a]/10 outline-none text-sm transition-all"
                  />
                </div>
              ))}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-[#c41e2a] px-8 py-3 font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <div className="mt-8 rounded-xl border border-red-100 bg-red-50/60 p-4">
              <h3 className="text-sm font-bold text-red-700">
                Delete account
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-red-700/80">
                This removes your Travelyt login and profile. Some booking and
                chain-of-custody records may be retained where required for
                operations, claims, safety, or legal obligations.
              </p>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting}
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppChrome>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <div className="h-7 w-48 rounded-full bg-navy/10" />
        <div className="mt-3 h-4 w-64 rounded-full bg-navy/10" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl bg-white p-4 shadow-sm shadow-navy/5">
            <div className="h-5 w-5 rounded bg-navy/10" />
            <div className="mt-4 h-7 w-12 rounded bg-navy/10" />
            <div className="mt-2 h-3 w-14 rounded bg-navy/10" />
          </div>
        ))}
      </div>
      <div className="h-40 rounded-2xl bg-white shadow-sm shadow-navy/5" />
    </div>
  );
}

function BookingsList({
  bookings,
  loading,
}: {
  bookings: Booking[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1].map((item) => (
          <div key={item} className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-xl bg-navy/10" />
            <span className="flex-1">
              <span className="block h-4 w-36 rounded bg-navy/10" />
              <span className="mt-2 block h-3 w-52 rounded bg-navy/10" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (!bookings.length) {
    return (
      <div className="p-6 text-center text-sm text-navy/65">
        No bookings yet.{" "}
        <Link href="/quote" className="font-semibold text-[#c41e2a] underline">
          Book your first pickup
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {bookings.map((booking) => (
        <Link
          key={booking.id}
          href={getBookingTrackingHref(booking)}
          className="flex items-center gap-3 p-4 transition-colors hover:bg-gray-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f6f7fb] text-navy">
            <Package className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-navy">
              {SERVICE_LABELS[booking.service]} · {booking.airport}
            </span>
            <span className="mt-0.5 block text-xs text-navy/55">
              {formatTripDate(booking.date)} · {booking.bags} bag
              {booking.bags > 1 ? "s" : ""} · {formatPrice(booking.priceCents)}
            </span>
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              statusColors[booking.status]
            }`}
          >
            {STATUS_LABELS[booking.status]}
          </span>
        </Link>
      ))}
    </div>
  );
}
