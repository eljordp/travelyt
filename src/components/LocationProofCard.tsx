import { ExternalLink, MapPin } from "lucide-react";

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function mapsUrl(latitude: number, longitude: number) {
  const coords = `${latitude},${longitude}`;
  return `https://maps.google.com/?q=${encodeURIComponent(coords)}`;
}

function embedUrl(latitude: number, longitude: number) {
  const coords = `${latitude},${longitude}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(coords)}&z=18&output=embed`;
}

export default function LocationProofCard({
  label,
  latitude,
  longitude,
  accuracyMeters,
  capturedAt,
  actorName,
  className = "",
  compact = false,
}: {
  label: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt?: string;
  actorName?: string;
  className?: string;
  compact?: boolean;
}) {
  const openUrl = mapsUrl(latitude, longitude);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-navy/10 bg-white shadow-sm shadow-navy/5 ${className}`}
    >
      <div className={compact ? "px-3 py-3" : "px-4 py-3"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-bold text-navy">
              <MapPin className="h-4 w-4 shrink-0 text-[#ff6868]" strokeWidth={2.2} />
              <span className="truncate">{label}</span>
            </div>
            {(capturedAt || actorName) && (
              <div className="mt-1 text-xs text-navy/60">
                {capturedAt ? new Date(capturedAt).toLocaleString() : ""}
                {capturedAt && actorName ? " · " : ""}
                {actorName ?? ""}
              </div>
            )}
          </div>
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ff6868]/10 px-2.5 py-1 text-[11px] font-bold text-[#c41e2a] transition-colors hover:bg-[#ff6868]/15"
          >
            Open <ExternalLink className="h-3 w-3" strokeWidth={2.3} />
          </a>
        </div>
        <div className="mt-2 text-xs leading-relaxed text-navy/65">
          {accuracyMeters
            ? `Captured within about ${accuracyMeters} meters of this pin.`
            : "GPS checkpoint captured at this pin."}
        </div>
      </div>

      <div className={compact ? "h-32" : "h-40"}>
        <iframe
          title={`${label} map`}
          src={embedUrl(latitude, longitude)}
          loading="lazy"
          className="h-full w-full border-0"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="border-t border-navy/10 bg-navy/[0.03] px-4 py-2 text-[11px] font-semibold text-navy/55">
        GPS {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
      </div>
    </div>
  );
}
