import { z } from "zod";

/** Minimum length for new passwords (login still accepts legacy shorter passwords). */
export const MIN_PASSWORD_LENGTH = 8;

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(72);

export const loginPasswordSchema = z.string().min(6).max(72);

export function validateNewPassword(password: string): string | null {
  const parsed = newPasswordSchema.safeParse(password);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid password";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number";
  }
  return null;
}
