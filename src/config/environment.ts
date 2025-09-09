/**
 * Environment variable loading and validation module.
 * Provides centralized environment configuration management with defaults and validation.
 */

import { EnvironmentConfig, OperationType } from "../types/config.ts";

/**
 * Default values for optional environment variables.
 */
const DEFAULT_VALUES = {
  ENVIRONMENT: "auto",
  OPERATION: "cleanup" as OperationType,
  DRY_RUN: "true",
  REPORTS_PATH: "reports",
  LOG_LEVEL: "info",
  API_RATE_LIMIT: "5",
  API_TIMEOUT: "30000",
  MAX_RETRIES: "3",
  CONCURRENCY_LIMIT: "5",
} as const;

/**
 * Required environment variables that must be present.
 */
const REQUIRED_VARS = [
  "OPTIMIZELY_API_TOKEN",
  "OPTIMIZELY_PROJECT_ID",
] as const;

/**
 * Optional environment variables with defaults.
 */
const OPTIONAL_VARS = [
  "ENVIRONMENT",
  "OPERATION",
  "DRY_RUN",
  "REPORTS_PATH",
  "LOG_LEVEL",
  "API_RATE_LIMIT",
  "API_TIMEOUT",
  "MAX_RETRIES",
  "CONCURRENCY_LIMIT",
  "GITHUB_TOKEN",
  "GITHUB_RUN_ID",
] as const;

/**
 * Loads and validates environment variables with defaults and type safety.
 *
 * @returns Validated environment configuration object
 * @throws Error if required variables are missing or invalid
 */
export async function loadEnvironment(): Promise<EnvironmentConfig> {
  assertEnvApiAvailable();

  // Load all environment variables
  const env: Record<string, string | undefined> = {};
  for (const key of [...REQUIRED_VARS, ...OPTIONAL_VARS]) {
    env[key] = Deno.env.get(key);
  }

  // Check for missing required variables
  const missing = REQUIRED_VARS.filter((key) => !env[key] || env[key]!.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Please ensure these are set in your environment or GitHub secrets.",
    );
  }

  // Validate and parse environment variables
  const config: EnvironmentConfig = {
    // Required variables
    OPTIMIZELY_API_TOKEN: env.OPTIMIZELY_API_TOKEN!,
    OPTIMIZELY_PROJECT_ID: env.OPTIMIZELY_PROJECT_ID!,

    // Optional variables with defaults
    ENVIRONMENT: env.ENVIRONMENT || DEFAULT_VALUES.ENVIRONMENT,
    OPERATION: validateOperation(env.OPERATION || DEFAULT_VALUES.OPERATION),
    DRY_RUN: parseBooleanEnv(env.DRY_RUN, DEFAULT_VALUES.DRY_RUN),
    REPORTS_PATH: env.REPORTS_PATH || DEFAULT_VALUES.REPORTS_PATH,
    LOG_LEVEL: validateLogLevel(env.LOG_LEVEL || DEFAULT_VALUES.LOG_LEVEL),

    // API configuration
    API_RATE_LIMIT: parseIntEnv(env.API_RATE_LIMIT, DEFAULT_VALUES.API_RATE_LIMIT, 1, 100),
    API_TIMEOUT: parseIntEnv(env.API_TIMEOUT, DEFAULT_VALUES.API_TIMEOUT, 1000, 300000),
    MAX_RETRIES: parseIntEnv(env.MAX_RETRIES, DEFAULT_VALUES.MAX_RETRIES, 0, 10),
    CONCURRENCY_LIMIT: parseIntEnv(env.CONCURRENCY_LIMIT, DEFAULT_VALUES.CONCURRENCY_LIMIT, 1, 20),

    // Optional GitHub integration
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    GITHUB_RUN_ID: env.GITHUB_RUN_ID,
  };

  // Additional validation
  await validateEnvironmentConfig(config);

  return config;
}

/**
 * Validates that the operation type is supported.
 */
function validateOperation(operation: string): OperationType {
  const validOperations: OperationType[] = ["cleanup", "audit"];
  if (!validOperations.includes(operation as OperationType)) {
    throw new Error(
      `Invalid OPERATION: "${operation}". Must be one of: ${validOperations.join(", ")}`,
    );
  }
  return operation as OperationType;
}

/**
 * Validates that the log level is supported.
 */
function validateLogLevel(logLevel: string): string {
  const validLevels = ["debug", "info", "warn", "error"];
  if (!validLevels.includes(logLevel.toLowerCase())) {
    throw new Error(
      `Invalid LOG_LEVEL: "${logLevel}". Must be one of: ${validLevels.join(", ")}`,
    );
  }
  return logLevel.toLowerCase();
}

/**
 * Parses a boolean environment variable with validation.
 */
function parseBooleanEnv(value: string | undefined, defaultValue: string): boolean {
  const val = (value || defaultValue).toLowerCase();
  if (val === "true" || val === "1" || val === "yes") return true;
  if (val === "false" || val === "0" || val === "no") return false;

  throw new Error(
    `Invalid boolean value: "${value}". Must be one of: true, false, 1, 0, yes, no`,
  );
}

/**
 * Parses an integer environment variable with validation and bounds checking.
 */
function parseIntEnv(
  value: string | undefined,
  defaultValue: string,
  min: number,
  max: number,
): number {
  const val = parseInt(value || defaultValue, 10);

  if (isNaN(val)) {
    throw new Error(`Invalid integer value: "${value}". Must be a valid number.`);
  }

  if (val < min || val > max) {
    throw new Error(
      `Value out of range: ${val}. Must be between ${min} and ${max}.`,
    );
  }

  return val;
}

/**
 * Performs additional validation on the complete environment configuration.
 */
async function validateEnvironmentConfig(config: EnvironmentConfig): Promise<void> {
  // Validate API token format (basic check)
  if (!config.OPTIMIZELY_API_TOKEN.match(/^[a-zA-Z0-9._-]+$/)) {
    throw new Error(
      "Invalid OPTIMIZELY_API_TOKEN format. Token should contain only alphanumeric characters, dots, underscores, and hyphens.",
    );
  }

  // Validate project ID format
  if (!config.OPTIMIZELY_PROJECT_ID.match(/^[0-9]+$/)) {
    throw new Error(
      "Invalid OPTIMIZELY_PROJECT_ID format. Must be a numeric project ID.",
    );
  }

  // Validate reports path
  if (config.REPORTS_PATH.includes("..") || config.REPORTS_PATH.startsWith("/")) {
    throw new Error(
      "Invalid REPORTS_PATH. Must be a relative path without directory traversal.",
    );
  }

  // Create reports directory if it doesn't exist
  try {
    await Deno.mkdir(config.REPORTS_PATH, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw new Error(
        `Failed to create reports directory "${config.REPORTS_PATH}": ${(error as Error).message}`,
      );
    }
  }
}

/**
 * Checks if the environment variable API is available (Deno runtime with env permission).
 * Throws a clear error if not running in Deno or lacking permissions.
 */
export function assertEnvApiAvailable(): void {
  if (
    typeof Deno === "undefined" ||
    typeof Deno.env === "undefined" ||
    typeof Deno.env.get !== "function"
  ) {
    throw new Error(
      "Deno.env is not available. Ensure you are running in Deno with --allow-env permission.",
    );
  }
}

/**
 * Gets a sanitized version of the environment configuration for logging.
 * Removes sensitive information like API tokens.
 */
export function getSanitizedConfig(config: EnvironmentConfig): Partial<EnvironmentConfig> {
  const sanitized = { ...config };

  // Mask sensitive values
  if (sanitized.OPTIMIZELY_API_TOKEN) {
    sanitized.OPTIMIZELY_API_TOKEN = `${sanitized.OPTIMIZELY_API_TOKEN.slice(0, 8)}...`;
  }
  if (sanitized.GITHUB_TOKEN) {
    sanitized.GITHUB_TOKEN = `${sanitized.GITHUB_TOKEN.slice(0, 8)}...`;
  }

  return sanitized;
}
