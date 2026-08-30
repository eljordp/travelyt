import type { AgentAssignmentRow } from "@/lib/agent-assignment";
import type { BookingRow } from "@/lib/booking-mappers";

export type AgentAssignmentTransitionResult = {
  ok: true;
  outcome: "assigned" | "reassigned" | "accepted" | "declined" | "expired";
  idempotent: boolean;
  assignment: AgentAssignmentRow;
  booking: BookingRow;
  primaryDriverName: string;
  backupDriverName: string;
};

type RpcError = {
  code?: string;
  message?: string;
};

export function agentAssignmentTransitionFailure(
  error: RpcError | null,
  fallback: string,
) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (
    ["42P01", "42883", "PGRST202"].includes(code) ||
    (/transition_agent_assignment|booking_agent_assignments|agent_readiness_profiles/i.test(message) &&
      /does not exist|schema cache/i.test(message))
  ) {
    return {
      status: 409,
      message: "Apply migration 045 before using atomic agent assignments.",
    };
  }
  if (code === "P0002") return { status: 404, message: message || "Assignment record was not found." };
  if (code === "42501" && /only the assigned|authenticated operations actor/i.test(message)) {
    return { status: 403, message: message || "This account cannot perform that assignment action." };
  }
  if (["22023", "22P02"].includes(code)) return { status: 400, message: message || fallback };
  if (["23505", "40001", "P0001", "42501"].includes(code)) {
    return { status: 409, message: message || fallback };
  }
  return { status: 500, message: fallback };
}
