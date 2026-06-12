export type PartnerKind =
  | "airline"
  | "airport"
  | "storage"
  | "courier"
  | "travel-platform"
  | "generic";

export type PartnerCapability =
  | "quote"
  | "availability"
  | "create-order"
  | "cancel-order"
  | "status-sync"
  | "webhook"
  | "handoff-proof"
  | "document-upload";

export type PartnerEnvironment = "sandbox" | "production" | "manual";

export interface PartnerIntegrationConfig {
  id: string;
  name: string;
  kind: PartnerKind;
  environment: PartnerEnvironment;
  capabilities: PartnerCapability[];
  auth:
    | { type: "api-key"; envKey: string }
    | { type: "oauth2"; clientIdEnvKey: string; clientSecretEnvKey: string }
    | { type: "manual" };
  notes: string;
}

export type PartnerJobStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed"
  | "needs_manual_review";

export interface PartnerJobEnvelope {
  providerId: string;
  bookingId: string;
  externalReference?: string;
  status: PartnerJobStatus;
  payload: Record<string, unknown>;
}

export interface PartnerStatusEvent {
  providerId: string;
  externalReference: string;
  status: PartnerJobStatus;
  occurredAt: string;
  raw: Record<string, unknown>;
}

export interface PartnerAdapter {
  config: PartnerIntegrationConfig;
  normalizeStatus(raw: Record<string, unknown>): PartnerStatusEvent | null;
  buildCreatePayload(job: PartnerJobEnvelope): Record<string, unknown>;
}

export const partnerIntegrations: PartnerIntegrationConfig[] = [
  {
    id: "united",
    name: "United Airlines",
    kind: "airline",
    environment: "manual",
    capabilities: ["availability", "status-sync", "handoff-proof", "webhook"],
    auth: { type: "manual" },
    notes:
      "United should be treated as an airline/vendor integration lane. Do not imply a live partnership until credentials, terms, and station approval exist.",
  },
  {
    id: "royal-jordanian",
    name: "Royal Jordanian",
    kind: "airline",
    environment: "manual",
    capabilities: ["availability", "status-sync", "handoff-proof", "webhook"],
    auth: { type: "manual" },
    notes:
      "Royal Jordanian should use the same airline adapter contract as United. Start with flight/status and handoff references before any baggage-system writeback.",
  },
  {
    id: "stasher",
    name: "Stasher",
    kind: "storage",
    environment: "manual",
    capabilities: ["quote", "availability", "create-order", "cancel-order", "status-sync"],
    auth: { type: "manual" },
    notes:
      "Stasher is a storage-partner lane, not an airline baggage handoff lane. Keep storage reservations separate from airport custody events.",
  },
];

export function arePartnerIntegrationsEnabled() {
  return (
    process.env.PARTNER_INTEGRATIONS_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_PARTNER_INTEGRATIONS_ENABLED === "true"
  );
}

export function getPartnerIntegration(id: string) {
  return partnerIntegrations.find((integration) => integration.id === id);
}

export function partnerSupports(
  integration: PartnerIntegrationConfig,
  capability: PartnerCapability
) {
  return integration.capabilities.includes(capability);
}
