/** True when running a production Node/Vercel deployment. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function envFlag(name: string, defaultValue = false): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return defaultValue;
}

/** AUTH_SECRET / NEXTAUTH_SECRET — required in production (no dev fallback). */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (secret) return secret;
  if (isProduction()) {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return "dev-secret-local-only";
}

/**
 * Instant deposit/withdraw crediting. Defaults to on in dev, off in production.
 * Set PAYMENTS_MOCK=true on demo hosts that should auto-credit test deposits.
 */
export function paymentsMockEnabled(): boolean {
  const raw = (process.env.PAYMENTS_MOCK || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return !isProduction();
}

/** Open self-registration. Set REGISTRATION_ENABLED=false to invite-only mode. */
export function registrationEnabled(): boolean {
  return envFlag("REGISTRATION_ENABLED", true);
}
