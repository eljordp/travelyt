export const IDENTITY_CONSENT_VERSION = "identity-biometric-v1-2026-08-15";
export const IDENTITY_RETENTION_YEARS = 3;

export const IDENTITY_CONSENT_DISCLOSURE =
  "I understand that Travelyt may collect and securely store images of my government ID and a selfie or liveness capture to verify my identity and connect it to custody records. Travelyt may disclose this verification data to its approved identity-verification provider and, only when required and authorized, the relevant carrier. The images may be retained for up to 3 years or until the verification purpose ends, unless a documented legal hold applies, and will then be deleted.";

export function validConsentSignature(value: unknown) {
  return typeof value === "string" && value.trim().replace(/\s+/g, " ").length >= 2;
}
export function identityConsentScope(provider: string) {
  return {
    purpose: "identity verification tied to Travelyt custody records",
    data: ["government_id_images", "selfie_or_liveness_capture"],
    disclosures: ["approved_identity_verification_provider", "authorized_relevant_carrier"],
    provider,
    retention: "up_to_3_years_or_until_purpose_ends_unless_legal_hold",
  };
}
