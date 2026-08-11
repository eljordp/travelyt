import type { User } from "@supabase/supabase-js";

export type UserRole =
  | "customer"
  | "driver"
  | "employee"
  | "dispatcher"
  | "manager"
  | "admin";

export const PRIVILEGED_ROLES: UserRole[] = [
  "driver",
  "employee",
  "dispatcher",
  "manager",
  "admin",
];

const USER_ROLES: UserRole[] = ["customer", ...PRIVILEGED_ROLES];

/**
 * Authorization roles must come from app_metadata. A signed-in user can edit
 * user_metadata, so it is never a safe source for privileges or MFA policy.
 */
export function trustedUserRole(
  user: Pick<User, "app_metadata"> | null | undefined,
): UserRole {
  const candidate =
    typeof user?.app_metadata?.role === "string"
      ? user.app_metadata.role.trim().toLowerCase()
      : "";
  return USER_ROLES.includes(candidate as UserRole)
    ? (candidate as UserRole)
    : "customer";
}

export function normalizePhone(input: string): string {
  return input.trim().replace(/[^\d+]/g, "");
}

export function validatePhone(input: string): string | undefined {
  const phone = normalizePhone(input);
  if (!phone) return undefined;
  if (!/^\+?\d{10,15}$/.test(phone)) {
    return "Enter a valid phone number with area code.";
  }
  return undefined;
}

export function validatePassword(input: string): string | undefined {
  if (!input) return "Password is required.";
  if (input.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(input) || !/\d/.test(input)) {
    return "Use letters and at least one number.";
  }
  return undefined;
}

export function roleRequiresMfa(role?: string | null): boolean {
  return PRIVILEGED_ROLES.includes(role as UserRole);
}

export function safeAuthNext(
  value: string | null | undefined,
  fallback = "/profile",
): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
