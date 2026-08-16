export const AGENT_EVIDENCE_BUCKET = "agent-readiness-evidence";

export type AgentEvidenceType =
  | "training"
  | "insurance"
  | "vehicle_registration"
  | "vehicle_photo";

export const AGENT_EVIDENCE_TYPES: AgentEvidenceType[] = [
  "training",
  "insurance",
  "vehicle_registration",
  "vehicle_photo",
];
