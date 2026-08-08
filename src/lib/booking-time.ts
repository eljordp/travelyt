import { TRAVELYT_HANDOFF_TARGET_MINUTES } from "@/lib/service-rules";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DEFAULT_OPERATIONAL_BUFFER_MINUTES = 75;
const MIN_OPERATIONAL_BUFFER_MINUTES = 45;
const DRIVER_PREP_BUFFER_MINUTES = 20;
const ESTIMATED_CITY_SPEED_MPH = 35;
const AIRPORT_TIME_ZONES: Record<string, string> = {
  ATL: "America/New_York", BOS: "America/New_York", BWI: "America/New_York",
  DCA: "America/New_York", DEN: "America/Denver", DFW: "America/Chicago",
  DTW: "America/Detroit", EWR: "America/New_York", HOU: "America/Chicago",
  IAD: "America/New_York", IAH: "America/Chicago", JFK: "America/New_York",
  LAS: "America/Los_Angeles", LAX: "America/Los_Angeles", MCO: "America/New_York",
  MDW: "America/Chicago", MIA: "America/New_York", MSP: "America/Chicago",
  ORD: "America/Chicago", ORF: "America/New_York", PDX: "America/Los_Angeles",
  PHX: "America/Phoenix", RIC: "America/New_York", SEA: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function getTodayDateString(now = new Date()): string {
  return [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
  ].join("-");
}

export function getCurrentTimeString(now = new Date()): string {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function isValidTravelDate(date: string): boolean {
  if (!ISO_DATE_PATTERN.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

export function isValidTravelTime(time: string): boolean {
  if (!TIME_PATTERN.test(time)) return false;
  const [hour, minute] = time.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function validateTravelDateTime(
  date: string,
  time?: string,
  now = new Date()
): string | undefined {
  if (!date) return "Select a travel date";
  if (!isValidTravelDate(date)) return "Select a valid travel date";

  const today = getTodayDateString(now);
  if (date < today) return "Travel date cannot be in the past";

  const normalizedTime = time?.trim();
  if (!normalizedTime) return undefined;
  if (!isValidTravelTime(normalizedTime)) return "Select a valid travel time";
  if (date === today && normalizedTime <= getCurrentTimeString(now)) {
    return "Select a time later than now";
  }

  return undefined;
}

export function estimateOperationalBufferMinutes(distanceMiles?: number): number {
  if (typeof distanceMiles !== "number" || !Number.isFinite(distanceMiles)) {
    return DEFAULT_OPERATIONAL_BUFFER_MINUTES;
  }

  const driveMinutes = Math.ceil((Math.max(0, distanceMiles) / ESTIMATED_CITY_SPEED_MPH) * 60);
  return Math.max(
    MIN_OPERATIONAL_BUFFER_MINUTES,
    DRIVER_PREP_BUFFER_MINUTES + driveMinutes
  );
}

export function airportLocalTimeToInstant(date: string, time: string, airport?: string) {
  const timeZone = airport ? AIRPORT_TIME_ZONES[airport.trim().toUpperCase()] : undefined;
  if (!timeZone) return new Date(`${date}T${time}`);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let candidate = desiredWallTime;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const displayedWallTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    candidate -= displayedWallTime - desiredWallTime;
  }
  return new Date(candidate);
}

export function validateFlightCutoff(
  date: string,
  time: string | undefined,
  service: "departure" | "arrival" | "both" | string | undefined,
  distanceMiles?: number,
  airport?: string,
  now = new Date()
): string | undefined {
  if (!service || service === "arrival") return undefined;
  if (!time?.trim()) return "Select a departure time";

  const baseError = validateTravelDateTime(date, time, now);
  if (baseError) return baseError;

  const flightAt = airportLocalTimeToInstant(date, time, airport);
  if (Number.isNaN(flightAt.getTime())) return "Select a valid departure time";

  const bufferMinutes = estimateOperationalBufferMinutes(distanceMiles);
  const latestBookAt = new Date(
    flightAt.getTime() -
      (TRAVELYT_HANDOFF_TARGET_MINUTES + bufferMinutes) * 60_000
  );

  if (now > latestBookAt) {
    return `This departure is too close for Travelyt custody. Book at least ${TRAVELYT_HANDOFF_TARGET_MINUTES + bufferMinutes} minutes before departure so pickup and travel can finish before Travelyt's three-hour carrier-handoff target.`;
  }

  return undefined;
}
