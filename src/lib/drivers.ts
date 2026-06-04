export type DriverProfile = {
  name: string;
  role: string;
};

export const DRIVER_OPTIONS: DriverProfile[] = [
  { name: "Daniel Gyanor", role: "Co-Founder" },
  { name: "Mohammed", role: "Co-Founder" },
  { name: "Zaina Daoud", role: "Operations" },
  { name: "Danielle Gyanor", role: "CEO & Co-Founder" },
  { name: "Marcus J.", role: "Courier" },
  { name: "Diane R.", role: "Courier" },
  { name: "Anwar K.", role: "Courier" },
  { name: "Sophia L.", role: "Courier" },
];

const DRIVER_ALIASES = new Map<string, string>([
  ["daniel", "daniel gyanor"],
  ["daniel g", "daniel gyanor"],
  ["danielle", "danielle gyanor"],
  ["danielle g", "danielle gyanor"],
  ["mo", "mohammed"],
  ["moe", "mohammed"],
  ["mohammad", "mohammed"],
  ["mohamed", "mohammed"],
  ["zaina", "zaina daoud"],
]);

export function normalizeDriverName(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function canonicalDriverName(value?: string | null) {
  const normalized = normalizeDriverName(value);
  return DRIVER_ALIASES.get(normalized) ?? normalized;
}

export function driverNameMatches(
  left?: string | null,
  right?: string | null
) {
  const a = canonicalDriverName(left);
  const b = canonicalDriverName(right);
  return Boolean(a && b && a === b);
}

export function driverInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
