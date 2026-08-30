export const OPS_EXCEPTION_MAX_METADATA_BYTES = 4_096;
export const OPS_EXCEPTION_MAX_METADATA_KEYS = 24;

export type OpsExceptionSeverity = "info" | "warning" | "critical";

const DRIVER_EXCEPTION_SEVERITIES = {
  GPS_DENIED: "warning",
  CUSTODY_LEDGER_WRITE_FAILED: "critical",
  SEAL_STATUS_STOP: "critical",
} as const satisfies Record<string, OpsExceptionSeverity>;

export type DriverExceptionCode = keyof typeof DRIVER_EXCEPTION_SEVERITIES;

type ExceptionActor =
  | {
      role: "driver";
      driverAccessId: string;
      name: string;
      email?: string;
    }
  | {
      role: "admin" | "dispatcher";
      email: string;
    };

type PolicyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function driverExceptionPolicy(code: string): PolicyResult<{
  code: DriverExceptionCode;
  severity: OpsExceptionSeverity;
}> {
  if (!Object.prototype.hasOwnProperty.call(DRIVER_EXCEPTION_SEVERITIES, code)) {
    return {
      ok: false,
      error: "This exception code must be recorded by Travelyt operations.",
    };
  }
  const driverCode = code as DriverExceptionCode;
  return {
    ok: true,
    value: {
      code: driverCode,
      severity: DRIVER_EXCEPTION_SEVERITIES[driverCode],
    },
  };
}

export function exceptionMetadata(
  value: unknown,
  actor: ExceptionActor,
): PolicyResult<Record<string, unknown>> {
  const source = value ?? {};
  if (!plainObject(source)) {
    return { ok: false, error: "Exception metadata must be a JSON object." };
  }
  if (Object.keys(source).length > OPS_EXCEPTION_MAX_METADATA_KEYS) {
    return {
      ok: false,
      error: `Exception metadata is limited to ${OPS_EXCEPTION_MAX_METADATA_KEYS} fields.`,
    };
  }

  const metadata: Record<string, unknown> = {
    ...source,
    actor: actor.role === "driver"
      ? {
          role: "driver",
          driverAccessId: actor.driverAccessId,
          name: actor.name,
          email: actor.email ?? null,
        }
      : {
          role: actor.role,
          email: actor.email,
        },
  };

  try {
    const serialized = JSON.stringify(metadata);
    if (new TextEncoder().encode(serialized).length > OPS_EXCEPTION_MAX_METADATA_BYTES) {
      return {
        ok: false,
        error: `Exception metadata is limited to ${OPS_EXCEPTION_MAX_METADATA_BYTES} bytes.`,
      };
    }
    return {
      ok: true,
      value: JSON.parse(serialized) as Record<string, unknown>,
    };
  } catch {
    return { ok: false, error: "Exception metadata must be serializable JSON." };
  }
}
