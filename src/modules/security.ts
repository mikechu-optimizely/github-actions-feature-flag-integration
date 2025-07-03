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
      copy[field] = "[REDACTED]";
    }
  }
  return copy;
}
