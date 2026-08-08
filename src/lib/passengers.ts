// Abuse-safe request bounds. Operational capacity is separately controlled by
// flight/station staffing, never by this customer-input limit.
export const MAX_BOOKING_PASSENGERS = 50;
export const MAX_BOOKING_BAGS = 100;

export type PassengerCategory = "account_holder" | "adult" | "minor";
export type PassengerRelationship =
  | "self"
  | "spouse"
  | "child"
  | "sibling"
  | "parent"
  | "colleague"
  | "other";
export type PassengerVerificationMethod =
  | "primary_account"
  | "guardian"
  | "household_spouse"
  | "self_service";
export type PassengerVerificationStatus =
  | "not_started"
  | "invite_required"
  | "invite_sent"
  | "consent_recorded"
  | "guardian_attested"
  | "household_attested"
  | "pending"
  | "manual_review"
  | "verified"
  | "rejected";

export interface BookingPassenger {
  id: string;
  firstName: string;
  lastName: string;
  category: PassengerCategory;
  relationship: PassengerRelationship;
  dateOfBirth?: string;
  email?: string;
  bags: number;
  verificationMethod: PassengerVerificationMethod;
  consentAt?: string;
  guardianAttestedAt?: string;
  householdAttestedAt?: string;
  identityVerifiedAt?: string;
  verificationStatus: PassengerVerificationStatus;
}

export type BookingPassengerInput = Omit<
  BookingPassenger,
  "verificationMethod" | "verificationStatus" | "identityVerifiedAt"
> & {
  verificationMethod?: PassengerVerificationMethod;
  verificationStatus?: PassengerVerificationStatus;
  identityVerifiedAt?: string;
};

type NormalizeOptions = {
  accountHolderName: string;
  totalBags: number;
  travelDate: string;
  accountHolderVerifiedAt?: string;
  now?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]{0,79}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELATIONSHIPS: PassengerRelationship[] = [
  "self", "spouse", "child", "sibling", "parent", "colleague", "other",
];

export function splitPassengerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length < 2
    ? { firstName: parts[0] ?? "", lastName: "" }
    : { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

export function passengerDisplayName(passenger: Pick<BookingPassenger, "firstName" | "lastName">) {
  return `${passenger.firstName} ${passenger.lastName}`.trim();
}

export function isBookingPassengerArray(value: unknown): value is BookingPassenger[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const passenger = item as Partial<BookingPassenger>;
    return typeof passenger.id === "string" &&
      typeof passenger.firstName === "string" &&
      typeof passenger.lastName === "string" &&
      ["account_holder", "adult", "minor"].includes(String(passenger.category)) &&
      Number.isInteger(passenger.bags) &&
      typeof passenger.verificationMethod === "string" &&
      typeof passenger.verificationStatus === "string";
  });
}

function validTimestamp(value?: string) {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

export function ageOnDate(dateOfBirth: string, travelDate: string) {
  if (!DATE_PATTERN.test(dateOfBirth) || !DATE_PATTERN.test(travelDate)) return undefined;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const travel = new Date(`${travelDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(travel.getTime()) || birth > travel) return undefined;
  let age = travel.getUTCFullYear() - birth.getUTCFullYear();
  if (travel.getUTCMonth() < birth.getUTCMonth() ||
      (travel.getUTCMonth() === birth.getUTCMonth() && travel.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function passengerVerificationMethod(input: { category: PassengerCategory; relationship: PassengerRelationship }): PassengerVerificationMethod {
  if (input.category === "account_holder") return "primary_account";
  if (input.category === "minor") return "guardian";
  return input.relationship === "spouse" ? "household_spouse" : "self_service";
}

export function normalizeBookingPassengers(
  input: unknown,
  options: NormalizeOptions
): { passengers: BookingPassenger[] } | { error: string } {
  if (!Number.isInteger(options.totalBags) || options.totalBags < 1 || options.totalBags > MAX_BOOKING_BAGS) {
    return { error: `Bookings must contain between 1 and ${MAX_BOOKING_BAGS} bags.` };
  }
  const now = validTimestamp(options.now) ? options.now! : new Date().toISOString();
  const holderName = splitPassengerName(options.accountHolderName);
  if (!NAME_PATTERN.test(holderName.firstName) || !NAME_PATTERN.test(holderName.lastName)) {
    return { error: "Enter the account holder's first and last name." };
  }
  const raw = Array.isArray(input) ? input : [];
  if (raw.length === 0) {
    return { passengers: [{
      id: crypto.randomUUID(), firstName: holderName.firstName, lastName: holderName.lastName,
      category: "account_holder", relationship: "self", bags: options.totalBags,
      verificationMethod: "primary_account", consentAt: now,
      identityVerifiedAt: options.accountHolderVerifiedAt,
      verificationStatus: options.accountHolderVerifiedAt ? "verified" : "consent_recorded",
    }] };
  }
  if (raw.length > MAX_BOOKING_PASSENGERS) return { error: `Add no more than ${MAX_BOOKING_PASSENGERS} travelers to one booking.` };

  const passengers: BookingPassenger[] = [];
  const ids = new Set<string>();
  const identityKeys = new Set<string>();
  let holderCount = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "Traveler details are invalid." };
    const candidate = item as Partial<BookingPassengerInput>;
    if (!["account_holder", "adult", "minor"].includes(String(candidate.category))) return { error: "Traveler type is invalid." };
    const requestedCategory = candidate.category as PassengerCategory;
    const id = typeof candidate.id === "string" && UUID_PATTERN.test(candidate.id) ? candidate.id : crypto.randomUUID();
    if (ids.has(id)) return { error: "Each traveler must have a unique record." };
    ids.add(id);
    let firstName = typeof candidate.firstName === "string" ? candidate.firstName.trim() : "";
    let lastName = typeof candidate.lastName === "string" ? candidate.lastName.trim() : "";
    if (requestedCategory === "account_holder") { holderCount += 1; firstName = holderName.firstName; lastName = holderName.lastName; }
    if (!NAME_PATTERN.test(firstName) || !NAME_PATTERN.test(lastName)) return { error: "Enter a valid first and last name for every traveler." };
    const bags = Number(candidate.bags);
    if (!Number.isInteger(bags) || bags < 0 || bags > MAX_BOOKING_BAGS) return { error: "Enter a valid bag count for every traveler." };
    const relationship = requestedCategory === "account_holder" ? "self" :
      typeof candidate.relationship === "string" && RELATIONSHIPS.includes(candidate.relationship as PassengerRelationship)
        ? candidate.relationship as PassengerRelationship : undefined;
    if (!relationship) return { error: "Select a relationship for every added traveler." };
    const dateOfBirth = typeof candidate.dateOfBirth === "string" ? candidate.dateOfBirth.trim() : undefined;
    const age = requestedCategory === "account_holder" ? undefined : dateOfBirth ? ageOnDate(dateOfBirth, options.travelDate) : undefined;
    if (requestedCategory !== "account_holder" && age === undefined) return { error: `Enter a valid date of birth for ${firstName} ${lastName}.` };
    if (dateOfBirth && dateOfBirth > now.slice(0, 10)) return { error: `Date of birth cannot be in the future for ${firstName} ${lastName}.` };
    const category: PassengerCategory = requestedCategory === "account_holder" ? "account_holder" : age! < 18 ? "minor" : "adult";
    const verificationMethod = passengerVerificationMethod({ category, relationship });
    const email = typeof candidate.email === "string" && candidate.email.trim() ? candidate.email.trim().toLowerCase() : undefined;
    if (email && !EMAIL_PATTERN.test(email)) return { error: `Enter a valid email for ${firstName} ${lastName}.` };
    if (verificationMethod === "self_service" && !email) return { error: `Enter ${firstName} ${lastName}'s email for separate adult verification.` };
    if (verificationMethod === "guardian" && !validTimestamp(candidate.guardianAttestedAt)) return { error: `Record guardian authorization for ${firstName} ${lastName}.` };
    if (verificationMethod === "household_spouse" && !validTimestamp(candidate.householdAttestedAt)) return { error: `Record spouse household authorization for ${firstName} ${lastName}.` };
    const identityKey = [firstName.toLocaleLowerCase(), lastName.toLocaleLowerCase(), dateOfBirth ?? "account-holder", email ?? ""].join("|");
    if (identityKeys.has(identityKey)) return { error: `${firstName} ${lastName} appears more than once in this traveler group.` };
    identityKeys.add(identityKey);
    const identityVerifiedAt = category === "account_holder" ? options.accountHolderVerifiedAt : undefined;
    passengers.push({
      id, firstName, lastName, category, relationship, dateOfBirth, email, bags, verificationMethod,
      consentAt: category === "account_holder" ? now : undefined,
      guardianAttestedAt: verificationMethod === "guardian" ? now : undefined,
      householdAttestedAt: verificationMethod === "household_spouse" ? now : undefined,
      identityVerifiedAt,
      verificationStatus: identityVerifiedAt ? "verified" : verificationMethod === "guardian" ? "guardian_attested" : verificationMethod === "household_spouse" ? "household_attested" : verificationMethod === "self_service" ? "invite_required" : "not_started",
    });
  }
  if (holderCount !== 1) return { error: "One traveler must be the signed-in account holder." };
  const assignedBags = passengers.reduce((sum, passenger) => sum + passenger.bags, 0);
  if (assignedBags !== options.totalBags) return { error: `Assign all ${options.totalBags} bags across the traveler list (${assignedBags} assigned).` };
  return { passengers };
}
