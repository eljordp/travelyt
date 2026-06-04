const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const AIRLINE_BAG_CUTOFF_MINUTES = 40;
const DEFAULT_OPERATIONAL_BUFFER_MINUTES = 75;
const MIN_OPERATIONAL_BUFFER_MINUTES = 45;
const DRIVER_PREP_BUFFER_MINUTES = 20;
const ESTIMATED_CITY_SPEED_MPH = 35;

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

export function validateFlightCutoff(
  date: string,
  time: string | undefined,
  service: "departure" | "arrival" | "both" | string | undefined,
  distanceMiles?: number,
  now = new Date()
): string | undefined {
  if (!service || service === "arrival") return undefined;
  if (!time?.trim()) return "Select a departure time";

  const baseError = validateTravelDateTime(date, time, now);
  if (baseError) return baseError;

  const flightAt = new Date(`${date}T${time}`);
  if (Number.isNaN(flightAt.getTime())) return "Select a valid departure time";

  const bufferMinutes = estimateOperationalBufferMinutes(distanceMiles);
  const latestBookAt = new Date(
    flightAt.getTime() -
      (AIRLINE_BAG_CUTOFF_MINUTES + bufferMinutes) * 60_000
  );

  if (now > latestBookAt) {
    return `This departure is too close for Travelyt custody. Book at least ${AIRLINE_BAG_CUTOFF_MINUTES + bufferMinutes} minutes before departure so bags can reach airline acceptance before the ${AIRLINE_BAG_CUTOFF_MINUTES}-minute cutoff.`;
  }

  return undefined;
}
