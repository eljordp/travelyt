export const RJ_PROVIDER_ID = "royal-jordanian";
export const RJ_CHECK_IN_SCHEMA_VERSION = "travelyt.rj-check-in.v2";
export type RjIntegrationMode = "disabled" | "sandbox" | "production";
export type RjCheckInState = "requested" | "tags_issued_inactive" | "handoff_ready" | "tags_activated" | "manual_review" | "failed";

type Environment = Record<string, string | undefined>;
type RjModeConfiguration = {
  gateway: string;
  allowedHosts: string[];
  token: string;
  webhookSecret: string;
  apiProfile: string;
};
export type RjCheckInInput = {
  bookingId: string; pnr: string; flightNumber: string; travelDate: string; departureAirport: string;
  bagCount: number; idempotencyKey: string;
  passengers: Array<{ passengerId: string; firstName: string; lastName: string; bags: number; identityReference: string; identityVerifiedAt: string }>;
};
export type RjBagTag = {
  tagReference: string;
  passengerId: string;
  bagIndex: number;
  bagReference: string;
};
export class RjIntegrationError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, message: string, httpStatus = 409) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
function value(env: Environment, key: string) { return env[key]?.trim() ?? ""; }
function enabled(env: Environment, key: string) { return value(env, key).toLowerCase() === "true"; }
function modePrefix(mode: Exclude<RjIntegrationMode, "disabled">) {
  return mode === "sandbox" ? "RJ_SANDBOX" : "RJ_PRODUCTION";
}
export function rjIntegrationExplicitlyEnabled(env: Environment = process.env) {
  return enabled(env, "RJ_INTEGRATION_ENABLED");
}
export function getRjIntegrationMode(env: Environment = process.env): RjIntegrationMode {
  if (!rjIntegrationExplicitlyEnabled(env)) return "disabled";
  const mode = value(env, "RJ_INTEGRATION_MODE").toLowerCase(); return mode === "sandbox" || mode === "production" ? mode : "disabled";
}
export function getRjModeConfiguration(
  env: Environment = process.env,
  mode: RjIntegrationMode = getRjIntegrationMode(env),
): RjModeConfiguration {
  if (mode === "disabled") {
    return { gateway: "", allowedHosts: [], token: "", webhookSecret: "", apiProfile: "" };
  }
  const prefix = modePrefix(mode);
  return {
    gateway: value(env, `${prefix}_API_GATEWAY_URL`),
    allowedHosts: value(env, `${prefix}_API_ALLOWED_HOSTS`)
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    token: value(env, `${prefix}_API_TOKEN`),
    webhookSecret: value(env, `${prefix}_WEBHOOK_SECRET`),
    apiProfile: value(env, `${prefix}_API_PROFILE`),
  };
}
export function getRjIntegrationReadiness(env: Environment = process.env) {
  const mode = getRjIntegrationMode(env);
  const config = getRjModeConfiguration(env, mode);
  let safeGateway = false;
  try {
    const url = new URL(config.gateway);
    safeGateway =
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      config.allowedHosts.includes(url.hostname.toLowerCase());
  } catch {}
  const prefix = mode === "disabled" ? null : modePrefix(mode);
  const gates = [
    ["integration-enabled", rjIntegrationExplicitlyEnabled(env), "Travelyt explicitly enables the otherwise dormant RJ adapter."],
    ["authorization", Boolean(prefix && enabled(env, `${prefix}_INTEGRATION_AUTHORIZED`)), "RJ authorizes the selected environment scope and names owners."],
    ["station-workflow", Boolean(prefix && enabled(env, `${prefix}_STATION_WORKFLOW_APPROVED`)), "RJ approves passenger presence, screening, receiving point, refusal and return workflow."],
    ["idempotency", Boolean(prefix && enabled(env, `${prefix}_IDEMPOTENCY_RECONCILIATION_APPROVED`)), "RJ documents replay, lookup, and timeout reconciliation for the selected environment."],
    ["api-profile", Boolean(config.apiProfile), "RJ approves the selected environment's DCS message mapping."],
    ["gateway", safeGateway, "Travelyt configures the approved HTTPS gateway allowlist."],
    ["credentials", Boolean(config.token), "RJ issues least-privilege credentials dedicated to the selected environment."],
    ["webhook", Boolean(config.webhookSecret), "RJ and Travelyt exchange a signed webhook secret dedicated to the selected environment."],
    ["insurance", enabled(env, "TRAVELYT_CUSTODY_INSURANCE_BOUND"), "Travelyt records the final custody insurance binder."],
  ].map(([key, complete, pathToCompletion]) => ({ key, complete: Boolean(complete), pathToCompletion }));
  const sandboxGateKeys = new Set(["integration-enabled", "authorization", "idempotency", "api-profile", "gateway", "credentials", "webhook"]);
  const readyForSandbox = mode === "sandbox" && env.NODE_ENV !== "production" && gates.filter((gate) => sandboxGateKeys.has(String(gate.key))).every((gate) => gate.complete);
  const readyForProduction = mode === "production" && gates.every((gate) => gate.complete);
  return { enabled: rjIntegrationExplicitlyEnabled(env), mode, gates, readyForSandbox, readyForProduction, readyForConfiguredMode: readyForSandbox || readyForProduction };
}
export function validateRjCheckInInput(input: RjCheckInInput) {
  const normalized = { ...input, pnr: input.pnr.trim().toUpperCase(), flightNumber: input.flightNumber.replace(/\s+/g, "").toUpperCase(), departureAirport: input.departureAirport.trim().toUpperCase() };
  if (!/^[A-Z0-9]{5,8}$/.test(normalized.pnr)) throw new RjIntegrationError("invalid_pnr", "RJ reservation number is invalid.", 400);
  if (!/^RJ\d{2,4}$/.test(normalized.flightNumber)) throw new RjIntegrationError("invalid_flight", "RJ flight number is invalid.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.travelDate) || !/^[A-Z]{3}$/.test(normalized.departureAirport)) throw new RjIntegrationError("invalid_route", "Departure route is invalid.", 400);
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(normalized.idempotencyKey)) throw new RjIntegrationError("invalid_idempotency_key", "Idempotency key is invalid.", 400);
  if (!Number.isInteger(normalized.bagCount) || normalized.bagCount < 1 || normalized.passengers.length < 1 || normalized.passengers.length > 50) throw new RjIntegrationError("invalid_manifest", "Passenger manifest or bag count is invalid.", 400);
  const ids = new Set<string>(); const total = normalized.passengers.reduce((sum, passenger) => {
    if (!/^[0-9a-f-]{36}$/i.test(passenger.passengerId) || ids.has(passenger.passengerId) || !passenger.identityReference || Number.isNaN(Date.parse(passenger.identityVerifiedAt)) || !Number.isInteger(passenger.bags) || passenger.bags < 0) throw new RjIntegrationError("identity_incomplete", "Every traveler needs a unique verified identity reference.", 409);
    ids.add(passenger.passengerId); return sum + passenger.bags;
  }, 0);
  if (total !== normalized.bagCount) throw new RjIntegrationError("passenger_bag_mismatch", "Passenger bag assignments do not match the booking total.", 409);
  return normalized;
}
function expectedBagReferences(request: RjCheckInInput) {
  return new Map(request.passengers.flatMap((passenger) =>
    Array.from({ length: passenger.bags }, (_, offset) => {
      const bagIndex = offset + 1;
      const bagReference = `${request.bookingId}:${passenger.passengerId}:${bagIndex}`;
      return [bagReference, { passengerId: passenger.passengerId, bagIndex }] as const;
    })
  ));
}
function validatedBagTags(value: unknown, request: RjCheckInInput): RjBagTag[] | null {
  if (!Array.isArray(value) || value.length !== request.bagCount) return null;
  const expected = expectedBagReferences(request);
  const tagReferences = new Set<string>();
  const bagReferences = new Set<string>();
  const tags: RjBagTag[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const tag = candidate as Partial<RjBagTag>;
    if (
      typeof tag.tagReference !== "string" ||
      !/^[A-Za-z0-9:_-]{1,120}$/.test(tag.tagReference) ||
      typeof tag.passengerId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(tag.passengerId) ||
      !Number.isInteger(tag.bagIndex) ||
      Number(tag.bagIndex) < 1 ||
      typeof tag.bagReference !== "string"
    ) return null;
    const expectedBinding = expected.get(tag.bagReference);
    if (
      !expectedBinding ||
      expectedBinding.passengerId !== tag.passengerId ||
      expectedBinding.bagIndex !== tag.bagIndex ||
      tagReferences.has(tag.tagReference) ||
      bagReferences.has(tag.bagReference)
    ) return null;
    tagReferences.add(tag.tagReference);
    bagReferences.add(tag.bagReference);
    tags.push(tag as RjBagTag);
  }
  return bagReferences.size === expected.size ? tags : null;
}
export async function executeRjGatewayCheckIn(input: RjCheckInInput, env: Environment = process.env) {
  const readiness = getRjIntegrationReadiness(env); if (!readiness.readyForConfiguredMode) throw new RjIntegrationError("integration_not_ready", "RJ check-in is locked until every gate required for the configured mode is complete.");
  const request = validateRjCheckInInput(input);
  const config = getRjModeConfiguration(env, readiness.mode);
  let response: Response;
  try { response = await fetch(config.gateway, { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, "Idempotency-Key": request.idempotencyKey, "X-Travelyt-Contract": RJ_CHECK_IN_SCHEMA_VERSION, "X-Travelyt-Integration-Mode": readiness.mode }, body: JSON.stringify({ schemaVersion: RJ_CHECK_IN_SCHEMA_VERSION, integrationMode: readiness.mode, operation: "offsite-check-in", ...request }) }); }
  catch { throw new RjIntegrationError("gateway_outcome_unknown", "The RJ gateway did not return a safe result. Operations must reconcile the idempotency key before any retry.", 503); }
  if (!response.ok) throw new RjIntegrationError("gateway_rejected", "RJ gateway rejected the request; operations review is required.", response.status >= 500 ? 502 : 409);
  const result = await response.json().catch(() => null) as { schemaVersion?: string; integrationMode?: string; bookingId?: string; idempotencyKey?: string; checkInReference?: string; state?: string; bagTags?: unknown; tagActivationState?: string } | null;
  const bagTags = validatedBagTags(result?.bagTags, request);
  if (
    !result?.checkInReference ||
    result.schemaVersion !== RJ_CHECK_IN_SCHEMA_VERSION ||
    result.integrationMode !== readiness.mode ||
    result.bookingId !== request.bookingId ||
    result.idempotencyKey !== request.idempotencyKey ||
    !["tags_issued_inactive", "handoff_ready"].includes(result.state || "") ||
    result.tagActivationState !== "inactive_until_airline_acceptance" ||
    !bagTags
  ) throw new RjIntegrationError("unsafe_gateway_response", "RJ response failed exact booking, mode, idempotency, or inactive-tag correlation.", 502);
  return { ...result, bagTags };
}
