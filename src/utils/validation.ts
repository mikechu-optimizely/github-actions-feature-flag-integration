// Input validation utilities

/**
 * Validates that the API path is a non-empty string and starts with '/'.
 * @param path API path
 * @throws Error if invalid
 */
export function validateApiPath(path: string): void {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(
      "API path must be a non-empty string starting with '/' character.",
    );
  }
}
