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

/**
 * Validates main application inputs.
 * @param inputs Configuration inputs to validate
 * @throws Error if any validation fails
 */
export function validateInputs(inputs: {
  operation: string;
  optimizelyApiToken?: string;
  optimizelyProjectId?: string;
}): void {
  // Validate operation
  const validOperations = ["cleanup", "audit"];
  if (!validOperations.includes(inputs.operation)) {
    throw new Error(`Operation must be one of: ${validOperations.join(", ")}`);
  }

  // Validate required Optimizely credentials
  if (
    !inputs.optimizelyApiToken || typeof inputs.optimizelyApiToken !== "string"
  ) {
    throw new Error("OPTIMIZELY_API_TOKEN environment variable is required");
  }

  if (
    !inputs.optimizelyProjectId ||
    typeof inputs.optimizelyProjectId !== "string"
  ) {
    throw new Error("OPTIMIZELY_PROJECT_ID environment variable is required");
  }

  // Validate API token format (basic check)
  if (inputs.optimizelyApiToken.length < 10) {
    throw new Error("OPTIMIZELY_API_TOKEN appears to be invalid (too short)");
  }

  // Validate project ID format (basic check)
  if (!/^\d+$/.test(inputs.optimizelyProjectId)) {
    throw new Error("OPTIMIZELY_PROJECT_ID must be a numeric string");
  }
}

/**
 * Validates a feature flag key format.
 * @param flagKey Feature flag key
 * @throws Error if invalid
 */
export function validateFlagKey(flagKey: string): void {
  if (!flagKey || typeof flagKey !== "string") {
    throw new Error("Flag key must be a non-empty string");
  }

  if (flagKey.length < 2) {
    throw new Error("Flag key must be at least 2 characters long");
  }

  if (flagKey.length > 255) {
    throw new Error("Flag key must be less than 255 characters long");
  }

  // Basic format validation (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]+$/.test(flagKey)) {
    throw new Error(
      "Flag key must contain only alphanumeric characters, underscores, and hyphens",
    );
  }
}

/**
 * Validates an array of feature flag keys.
 * @param flagKeys Array of flag keys
 * @throws Error if any validation fails
 */
export function validateFlagKeys(flagKeys: string[]): void {
  if (!Array.isArray(flagKeys)) {
    throw new Error("Flag keys must be an array");
  }

  for (const flagKey of flagKeys) {
    validateFlagKey(flagKey);
  }
}

/**
 * Validates a file path format.
 * @param filePath File path
 * @throws Error if invalid
 */
export function validateFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("File path must be a non-empty string");
  }

  if (filePath.includes("..")) {
    throw new Error("File path cannot contain '..' for security reasons");
  }

  if (filePath.length > 1000) {
    throw new Error("File path is too long (maximum 1000 characters)");
  }
}

/**
 * Validates and sanitizes log message content.
 * @param message Log message
 * @returns Sanitized message
 */
export function validateLogMessage(message: string): string {
  if (typeof message !== "string") {
    return "Invalid log message type";
  }

  if (message.length > 2000) {
    return message.substring(0, 2000) + "... (truncated)";
  }

  return message;
}
