export type OperationalMode = "rehearsal" | "live";

export function configuredOperationalMode(
  env: NodeJS.ProcessEnv = process.env,
): OperationalMode {
  return env.TRAVELYT_LIVE_OPERATIONS_ENABLED === "true"
    ? "live"
    : "rehearsal";
}

export function stripeLivemodeForOperationalMode(mode: OperationalMode) {
  return mode === "live";
}

export function isOperationalMode(value: unknown): value is OperationalMode {
  return value === "rehearsal" || value === "live";
}
