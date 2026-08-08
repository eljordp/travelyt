export const RJ_PROVIDER_ID = "royal-jordanian";
export const RJ_CHECK_IN_SCHEMA_VERSION = "travelyt.rj-check-in.v1";
export type RjIntegrationMode = "disabled" | "sandbox" | "production";
export type RjCheckInState = "requested" | "tags_issued_inactive" | "handoff_ready" | "tags_activated" | "manual_review" | "failed";

type Environment = Record<string, string | undefined>;
export type RjCheckInInput = {
  bookingId: string; pnr: string; flightNumber: string; travelDate: string; departureAirport: string;
  bagCount: number; idempotencyKey: string;
  passengers: Array<{ passengerId: string; firstName: string; lastName: string; bags: number; identityReference: string; identityVerifiedAt: string }>;
};
export class RjIntegrationError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 409) { super(message); }
}
function value(env: Environment, key: string) { return env[key]?.trim() ?? ""; }
function enabled(env: Environment, key: string) { return value(env, key).toLowerCase() === "true"; }
export function getRjIntegrationMode(env: Environment = process.env): RjIntegrationMode {
  const mode = value(env, "RJ_INTEGRATION_MODE").toLowerCase(); return mode === "sandbox" || mode === "production" ? mode : "disabled";
}
export function getRjIntegrationReadiness(env: Environment = process.env) {
  const gateway = value(env, "RJ_API_GATEWAY_URL");
  let safeGateway = false;
  try { const url = new URL(gateway); safeGateway = url.protocol === "https:" && !url.username && !url.password && value(env, "RJ_API_ALLOWED_HOSTS").split(",").map((v) => v.trim()).includes(url.hostname); } catch {}
  const gates = [
    ["authorization", enabled(env, "RJ_INTEGRATION_AUTHORIZED"), "RJ authorizes sandbox/API scope and names owners."],
    ["station-workflow", enabled(env, "RJ_STATION_WORKFLOW_APPROVED"), "RJ approves passenger presence, screening, receiving point, refusal and return workflow."],
    ["idempotency", enabled(env, "RJ_API_IDEMPOTENCY_RECONCILIATION_APPROVED"), "RJ documents replay, lookup, and timeout reconciliation."],
    ["api-profile", Boolean(value(env, "RJ_API_PROFILE")), "RJ approves DCS message mapping in sandbox."],
    ["gateway", safeGateway, "Travelyt configures the approved HTTPS gateway allowlist."],
    ["credentials", Boolean(value(env, "RJ_API_TOKEN")), "RJ issues least-privilege server credentials."],
    ["webhook", Boolean(value(env, "RJ_WEBHOOK_SECRET")), "RJ and Travelyt exchange a signed webhook secret."],
    ["insurance", enabled(env, "TRAVELYT_CUSTODY_INSURANCE_BOUND"), "Travelyt records the final custody insurance binder."],
  ].map(([key, complete, pathToCompletion]) => ({ key, complete: Boolean(complete), pathToCompletion }));
  const mode = getRjIntegrationMode(env);
  const sandboxGateKeys = new Set(["authorization", "idempotency", "api-profile", "gateway", "credentials", "webhook"]);
  const readyForSandbox = mode === "sandbox" && env.NODE_ENV !== "production" && gates.filter((gate) => sandboxGateKeys.has(String(gate.key))).every((gate) => gate.complete);
  const readyForProduction = mode === "production" && gates.every((gate) => gate.complete);
  return { mode, gates, readyForSandbox, readyForProduction, readyForConfiguredMode: readyForSandbox || readyForProduction };
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
export async function executeRjGatewayCheckIn(input: RjCheckInInput, env: Environment = process.env) {
  const readiness = getRjIntegrationReadiness(env); if (!readiness.readyForConfiguredMode) throw new RjIntegrationError("integration_not_ready", "RJ check-in is locked until every gate required for the configured mode is complete.");
  const request = validateRjCheckInInput(input);
  let response: Response;
  try { response = await fetch(value(env, "RJ_API_GATEWAY_URL"), { method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${value(env, "RJ_API_TOKEN")}`, "Idempotency-Key": request.idempotencyKey, "X-Travelyt-Contract": RJ_CHECK_IN_SCHEMA_VERSION }, body: JSON.stringify({ schemaVersion: RJ_CHECK_IN_SCHEMA_VERSION, operation: "offsite-check-in", ...request }) }); }
  catch { throw new RjIntegrationError("gateway_outcome_unknown", "The RJ gateway did not return a safe result. Operations must reconcile the idempotency key before any retry.", 503); }
  if (!response.ok) throw new RjIntegrationError("gateway_rejected", "RJ gateway rejected the request; operations review is required.", response.status >= 500 ? 502 : 409);
  const result = await response.json().catch(() => null) as { checkInReference?: string; state?: string; bagTags?: unknown[]; tagActivationState?: string } | null;
  if (!result?.checkInReference || result.tagActivationState !== "inactive_until_airline_acceptance" || !Array.isArray(result.bagTags) || result.bagTags.length !== request.bagCount) throw new RjIntegrationError("unsafe_gateway_response", "RJ response failed the inactive-tag safety contract.", 502);
  return result;
}
