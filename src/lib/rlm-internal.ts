/**
 * Private license server URL assembly.
 * Never expose this module's output in client-facing UI, errors, or headers.
 */
export function licenseServerUrl(): string {
  const parts = ["https://", "ramerlabs", ".com"];
  return parts.join("").replace(/\/$/, "");
}
