// Environment variable loading

/**
 * Loads and validates required environment variables for the application.
 * Throws an error if any required variable is missing or invalid.
 *
 * @returns An object containing all loaded environment variables.
 */
export function loadEnvironmentVariables(): {
  OPTIMIZELY_API_TOKEN: string;
  OPTIMIZELY_PROJECT_ID: string;
  GITHUB_TOKEN: string;
  ENVIRONMENT: string;
  OPERATION: string;
  DRY_RUN: boolean;
} {
  const requiredVars = [
    "OPTIMIZELY_API_TOKEN",
    "OPTIMIZELY_PROJECT_ID",
    "GITHUB_TOKEN",
    "ENVIRONMENT",
    "OPERATION",
    "DRY_RUN",
  ];

  const env: Record<string, string | undefined> = {};
  for (const key of requiredVars) {
    env[key] = Deno.env.get(key);
  }

  const missing = requiredVars.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  return {
    OPTIMIZELY_API_TOKEN: env["OPTIMIZELY_API_TOKEN"]!,
    OPTIMIZELY_PROJECT_ID: env["OPTIMIZELY_PROJECT_ID"]!,
    GITHUB_TOKEN: env["GITHUB_TOKEN"]!,
    ENVIRONMENT: env["ENVIRONMENT"]!,
    OPERATION: env["OPERATION"]!,
    DRY_RUN: env["DRY_RUN"] === "true",
  };
}

/**
 * Checks if the environment variable API is available (Deno runtime with env permission).
 * Throws a clear error if not running in Deno or lacking permissions.
 */
export function assertEnvApiAvailable(): void {
  if (
    typeof Deno === "undefined" || typeof Deno.env === "undefined" ||
    typeof Deno.env.get !== "function"
  ) {
    throw new Error(
      "Deno.env is not available. Ensure you are running in Deno with --allow-env permission.",
    );
  }
}
