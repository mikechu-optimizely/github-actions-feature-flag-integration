// Security utilities and validation

/**
 * Validates the format of an Optimizely API token.
 * @param token The token string to validate
 * @throws Error if invalid
 */
export function validateOptimizelyToken(token: string): void {
  if (
    typeof token !== "string" || token.length < 32 || !/^\w{32,}$/.test(token)
  ) {
    throw new Error("Invalid Optimizely API token format.");
  }
}

/**
 * Validates the format of a GitHub token.
 * @param token The token string to validate
 * @throws Error if invalid
 */
export function validateGitHubToken(token: string): void {
  if (
    typeof token !== "string" || !/^gh[oprsu]_[A-Za-z0-9_]{36,}/.test(token)
  ) {
    throw new Error("Invalid GitHub token format.");
  }
}

/**
 * Encrypts a secret using a simple algorithm for demonstration purposes.
 * In production, use a proper encryption library with key management.
 * @param secret The secret string to encrypt
 * @returns Encrypted secret
 */
export function encryptSecret(secret: string): string {
  // This is a placeholder for an actual encryption algorithm
  const buffer = new TextEncoder().encode(secret);
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Logs security-related events for auditing purposes.
 * @param event The security event type
 * @param details Additional details about the event
 */
export function logSecurityEvent(event: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const sanitizedDetails = details ? sanitizeData(details) : {};
  console.log(`[SECURITY EVENT] ${timestamp}: ${event}`, sanitizedDetails);
}

/**
 * Sanitizes sensitive fields in an object for safe logging/reporting.
 * @param obj The object to sanitize
 * @param fields Fields to redact (default: ["token", "apiKey", "authorization"])
 * @returns A shallow copy with sensitive fields redacted
 */
export function sanitizeData<T extends Record<string, unknown>>(
  obj: T,
  fields: string[] = ["token", "apiKey", "authorization"],
): T {
  const copy = { ...obj };
  for (const field of fields) {
    if (field in copy) {
      (copy as Record<string, unknown>)[field] = "[REDACTED]";
    }
  }
  return copy;
}
