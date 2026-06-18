import { notFound } from "next/navigation";
import {
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Package,
  Plane,
} from "lucide-react";
import {
  getBagByBadge,
  getCustodyChain,
  verifyChain,
  EVENT_LABELS,
  VERIFIED_METHOD_LABELS,
  type BagStatus,
} from "@/lib/custody";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<BagStatus, string> = {
  issued: "Badge issued",
  in_custody: "In Travelyt custody",
  handed_off: "Handed to security",
  delivered: "Delivered",
  exception: "Needs attention",
};

function fmt(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function BadgePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const bag = await getBagByBadge(code);
  if (!bag) notFound();

  const [chain, verification] = await Promise.all([
    getCustodyChain(bag.id),
    verifyChain(bag.id),
  ]);

  const intact = verification.ok;

  return (
    <div className="min-h-screen bg-[#081546] text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Plane
          className="absolute -top-12 -right-16 w-[26rem] h-[26rem] text-[#ff6868]/[0.06] -rotate-12"
          strokeWidth={1}
        />
      </div>

      <div className="relative mx-auto max-w-xl px-5 py-10">
        <div className="flex items-center gap-2 text-[#ff6868] text-sm font-semibold tracking-wide">
          <Plane className="w-4 h-4" />
          TRAVELYT CHAIN OF CUSTODY
        </div>

        <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-white/50">Badge</div>
              <div className="text-2xl font-bold tracking-tight">
                {bag.badge_code}
              </div>
              <div className="mt-1 text-sm text-white/70">
                {bag.label ?? "Bag"} · {STATUS_LABELS[bag.status]}
              </div>
            </div>
            <Package className="w-8 h-8 text-white/30" />
          </div>

          <div
            className={`mt-5 flex items-center gap-3 rounded-xl px-4 py-3 ${
              intact
                ? "bg-emerald-500/10 border border-emerald-400/30"
                : "bg-[#ff6868]/10 border border-[#ff6868]/40"
            }`}
          >
            {intact ? (
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-[#ff6868] shrink-0" />
            )}
            <div>
              <div className="font-semibold">
                {intact
                  ? "Custody chain verified"
                  : "Custody chain integrity failed"}
              </div>
              <div className="text-xs text-white/60">
                {intact
                  ? `${verification.total} sealed event${
                      verification.total === 1 ? "" : "s"
                    }, cryptographically intact`
                  : `Tampering detected at step ${verification.broken_seq ?? "?"}`}
              </div>
            </div>
          </div>
        </div>

        <ol className="mt-6 space-y-3">
          {chain.map((ev) => (
            <li
              key={ev.id}
              className="relative rounded-xl bg-white/[0.03] border border-white/10 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-[#ff6868]" />
                  {EVENT_LABELS[ev.event_type]}
                </div>
                <div className="text-xs text-white/50">{fmt(ev.created_at)}</div>
              </div>

              <div className="mt-2 text-sm text-white/70">
                {ev.actor_name ?? "Travelyt"}{" "}
                <span className="text-white/40">({ev.actor_role})</span>
                {" · "}
                {VERIFIED_METHOD_LABELS[ev.verified_method]}
              </div>

              {ev.location_lat != null && ev.location_lng != null && (
                <div className="mt-1 flex items-center gap-1 text-xs text-white/40">
                  <MapPin className="w-3 h-3" />
                  {ev.location_lat.toFixed(4)}, {ev.location_lng.toFixed(4)}
                </div>
              )}

              {ev.note && (
                <div className="mt-1 text-xs text-white/50">{ev.note}</div>
              )}

              <div className="mt-2 font-mono text-[10px] text-white/25 break-all">
                #{ev.seq} · {ev.event_hash.slice(0, 24)}…
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-center text-xs text-white/30">
          Every handoff is sealed into an append-only ledger. Scan verifies the
          full history end to end.
        </p>
      </div>
    </div>
  );
}
