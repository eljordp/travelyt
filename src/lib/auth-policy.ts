export type UserRole = "customer" | "driver" | "employee" | "admin";

export const PRIVILEGED_ROLES: UserRole[] = ["driver", "employee", "admin"];

export function normalizePhone(input: string): string {
  return input.trim().replace(/[^\d+]/g, "");
}

export function validatePhone(input: string): string | undefined {
  const phone = normalizePhone(input);
  if (!phone) return "Phone number is required.";
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
