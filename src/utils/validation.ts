/**
 * Input validation utilities for configuration management and data validation.
 * Provides comprehensive validation functions for environment variables, API tokens, and configuration.
 */

import { EnvironmentConfig, OperationType, ValidationResult } from "../types/config.ts";

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
 * Validates main application inputs with enhanced validation.
 * @param inputs Configuration inputs to validate
 * @throws Error if any validation fails
 */
export function validateInputs(inputs: {
  environment?: string;
  operation: string;
  optimizelyApiToken?: string;
  optimizelyProjectId?: string;
}): void {
  // Validate operation
  const validOperations: OperationType[] = ["cleanup", "audit"];
  if (!validOperations.includes(inputs.operation as OperationType)) {
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

  // Enhanced API token validation
  if (!validateOptimizelyApiToken(inputs.optimizelyApiToken)) {
    throw new Error("OPTIMIZELY_API_TOKEN appears to be invalid format");
  }

  // Enhanced project ID validation
  if (!validateOptimizelyProjectId(inputs.optimizelyProjectId)) {
    throw new Error("OPTIMIZELY_PROJECT_ID must be a numeric string");
  }

  // Validate environment if provided
  if (inputs.environment && !validateEnvironmentName(inputs.environment)) {
    throw new Error("Invalid environment name format");
  }
}

/**
 * Validates Optimizely API token format.
 * @param token API token to validate
 * @returns true if valid, false otherwise
 */
export function validateOptimizelyApiToken(token: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }

  // Check minimum length
  if (token.length < 10) {
    return false;
  }

  // Check maximum reasonable length
  if (token.length > 200) {
    return false;
  }

  // Check format (alphanumeric, dots, underscores, hyphens)
  if (!/^[a-zA-Z0-9._-]+$/.test(token)) {
    return false;
  }

  return true;
}

/**
 * Validates Optimizely project ID format.
 * @param projectId Project ID to validate
 * @returns true if valid, false otherwise
 */
export function validateOptimizelyProjectId(projectId: string): boolean {
  if (!projectId || typeof projectId !== "string") {
    return false;
  }

  // Must be numeric
  if (!/^\d+$/.test(projectId)) {
    return false;
  }

  // Reasonable length check (1-20 digits)
  if (projectId.length < 1 || projectId.length > 20) {
    return false;
  }

  return true;
}

/**
 * Validates environment name format.
 * @param environment Environment name to validate
 * @returns true if valid, false otherwise
 */
export function validateEnvironmentName(environment: string): boolean {
  if (!environment || typeof environment !== "string") {
    return false;
  }

  // Allow alphanumeric, hyphens, underscores, and dots
  if (!/^[a-zA-Z0-9._-]+$/.test(environment)) {
    return false;
  }

  // Reasonable length
  if (environment.length < 1 || environment.length > 50) {
    return false;
  }

  return true;
}

/**
 * Validates a complete environment configuration.
 * @param config Environment configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateEnvironmentConfig(config: EnvironmentConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field validation
  if (!config.OPTIMIZELY_API_TOKEN) {
    errors.push("Missing OPTIMIZELY_API_TOKEN");
  } else if (!validateOptimizelyApiToken(config.OPTIMIZELY_API_TOKEN)) {
    errors.push("Invalid OPTIMIZELY_API_TOKEN format");
  }

  if (!config.OPTIMIZELY_PROJECT_ID) {
    errors.push("Missing OPTIMIZELY_PROJECT_ID");
  } else if (!validateOptimizelyProjectId(config.OPTIMIZELY_PROJECT_ID)) {
    errors.push("Invalid OPTIMIZELY_PROJECT_ID format");
  }

  // Validate operation
  const validOperations: OperationType[] = ["cleanup", "audit"];
  if (!validOperations.includes(config.OPERATION)) {
    errors.push(
      `Invalid OPERATION: ${config.OPERATION}. Must be one of: ${validOperations.join(", ")}`,
    );
  }

  // Validate numeric ranges
  if (config.API_RATE_LIMIT < 1 || config.API_RATE_LIMIT > 100) {
    errors.push("API_RATE_LIMIT must be between 1 and 100");
  }

  if (config.API_TIMEOUT < 1000 || config.API_TIMEOUT > 300000) {
    errors.push("API_TIMEOUT must be between 1000ms and 300000ms");
  }

  if (config.MAX_RETRIES < 0 || config.MAX_RETRIES > 10) {
    errors.push("MAX_RETRIES must be between 0 and 10");
  }

  if (config.CONCURRENCY_LIMIT < 1 || config.CONCURRENCY_LIMIT > 20) {
    errors.push("CONCURRENCY_LIMIT must be between 1 and 20");
  }

  // Validate paths
  if (!validateReportsPath(config.REPORTS_PATH)) {
    errors.push("Invalid REPORTS_PATH format");
  }

  // Validate log level
  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(config.LOG_LEVEL.toLowerCase())) {
    errors.push(
      `Invalid LOG_LEVEL: ${config.LOG_LEVEL}. Must be one of: ${validLogLevels.join(", ")}`,
    );
  }

  // Warnings for potential issues
  if (config.DRY_RUN && config.OPERATION === "cleanup") {
    warnings.push("DRY_RUN is enabled for cleanup operation - no actual changes will be made");
  }

  if (config.API_RATE_LIMIT > 10) {
    warnings.push("High API_RATE_LIMIT may cause rate limiting issues with Optimizely API");
  }

  if (config.CONCURRENCY_LIMIT > 10) {
    warnings.push("High CONCURRENCY_LIMIT may impact system performance");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates reports path format.
 * @param path Reports path to validate
 * @returns true if valid, false otherwise
 */
export function validateReportsPath(path: string): boolean {
  if (!path || typeof path !== "string") {
    return false;
  }

  // No directory traversal
  if (path.includes("..")) {
    return false;
  }

  // No absolute paths for security
  if (path.startsWith("/") || path.match(/^[A-Za-z]:/)) {
    return false;
  }

  // Reasonable length
  if (path.length > 200) {
    return false;
  }

  return true;
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
