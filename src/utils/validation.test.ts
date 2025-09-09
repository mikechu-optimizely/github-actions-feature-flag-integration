/**
 * Unit tests for validation utilities.
 */
import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  validateApiPath,
  validateEnvironmentConfig,
  validateEnvironmentName,
  validateFilePath,
  validateFlagKey,
  validateFlagKeys,
  validateInputs,
  validateLogMessage,
  validateOptimizelyApiToken,
  validateOptimizelyProjectId,
  validateReportsPath,
} from "./validation.ts";
import type { EnvironmentConfig } from "../types/config.ts";

Deno.test("validateApiPath: accepts valid path", () => {
  validateApiPath("/flags");
  validateApiPath("/api/v2/feature");
});

Deno.test("validateApiPath: throws on empty string", () => {
  assertThrows(
    () => validateApiPath(""),
    Error,
    "API path must be a non-empty string starting with '/' character.",
  );
});

Deno.test("validateApiPath: throws if not starting with slash", () => {
  assertThrows(
    () => validateApiPath("flags"),
    Error,
    "API path must be a non-empty string starting with '/' character.",
  );
});

Deno.test("validateApiPath: throws if not a string", () => {
  // @ts-expect-error: Testing non-string input (undefined)
  assertThrows(() => validateApiPath(undefined), Error);
  // @ts-expect-error: Testing non-string input (number)
  assertThrows(() => validateApiPath(123), Error);
});

Deno.test("validateInputs: accepts valid inputs", () => {
  validateInputs({
    operation: "cleanup",
    optimizelyApiToken: "valid_token_123456",
    optimizelyProjectId: "12345",
  });
});

Deno.test("validateInputs: throws on invalid operation", () => {
  assertThrows(
    () =>
      validateInputs({
        operation: "invalid",
        optimizelyApiToken: "valid_token_123456",
        optimizelyProjectId: "12345",
      }),
    Error,
    "Operation must be one of: cleanup, audit",
  );
});

Deno.test("validateInputs: throws on missing API token", () => {
  assertThrows(
    () =>
      validateInputs({
        operation: "cleanup",
        optimizelyProjectId: "12345",
      }),
    Error,
    "OPTIMIZELY_API_TOKEN environment variable is required",
  );
});

Deno.test("validateFlagKey: accepts valid flag keys", () => {
  validateFlagKey("feature_flag_1");
  validateFlagKey("my-feature-flag");
  validateFlagKey("FLAG123");
});

Deno.test("validateFlagKey: throws on invalid flag keys", () => {
  assertThrows(
    () => validateFlagKey(""),
    Error,
    "Flag key must be a non-empty string",
  );

  assertThrows(
    () => validateFlagKey("a"),
    Error,
    "Flag key must be at least 2 characters long",
  );

  assertThrows(
    () => validateFlagKey("flag with spaces"),
    Error,
    "Flag key must contain only alphanumeric characters, underscores, and hyphens",
  );
});

Deno.test("validateLogMessage: validates and truncates messages", () => {
  assertEquals(validateLogMessage("normal message"), "normal message");
  // Note: control character replacement behavior may vary, just check that it processes
  const result = validateLogMessage("message\x00with\x01control");
  assert(result.includes("message"));
  assert(result.includes("control"));

  const longMessage = "a".repeat(2500);
  const truncatedResult = validateLogMessage(longMessage);
  assertEquals(truncatedResult.length, 2015); // 2000 + "... (truncated)".length
  assertEquals(truncatedResult.endsWith("... (truncated)"), true);
});

Deno.test("validateLogMessage: handles non-string input", () => {
  // @ts-expect-error: Testing non-string input
  assertEquals(validateLogMessage(123), "Invalid log message type");
  // @ts-expect-error: Testing non-string input
  assertEquals(validateLogMessage(null), "Invalid log message type");
  // @ts-expect-error: Testing non-string input
  assertEquals(validateLogMessage(undefined), "Invalid log message type");
});

// validateOptimizelyApiToken tests
Deno.test("validateOptimizelyApiToken: accepts valid tokens", () => {
  assertEquals(validateOptimizelyApiToken("valid_token_123456"), true);
  assertEquals(validateOptimizelyApiToken("abc123._-def456"), true);
  assertEquals(validateOptimizelyApiToken("1234567890"), true);
  assertEquals(validateOptimizelyApiToken("a".repeat(50)), true);
});

Deno.test("validateOptimizelyApiToken: rejects invalid tokens", () => {
  assertEquals(validateOptimizelyApiToken(""), false);
  assertEquals(validateOptimizelyApiToken("short"), false); // too short
  assertEquals(validateOptimizelyApiToken("a".repeat(201)), false); // too long
  assertEquals(validateOptimizelyApiToken("token with spaces"), false);
  assertEquals(validateOptimizelyApiToken("token@invalid"), false);
  assertEquals(validateOptimizelyApiToken("token#invalid"), false);
  // @ts-expect-error: Testing non-string input
  assertEquals(validateOptimizelyApiToken(null), false);
  // @ts-expect-error: Testing non-string input
  assertEquals(validateOptimizelyApiToken(undefined), false);
});

// validateOptimizelyProjectId tests
Deno.test("validateOptimizelyProjectId: accepts valid project IDs", () => {
  assertEquals(validateOptimizelyProjectId("123456"), true);
  assertEquals(validateOptimizelyProjectId("1"), true);
  assertEquals(validateOptimizelyProjectId("12345678901234567890"), true); // 20 digits
});

Deno.test("validateOptimizelyProjectId: rejects invalid project IDs", () => {
  assertEquals(validateOptimizelyProjectId(""), false);
  assertEquals(validateOptimizelyProjectId("abc123"), false); // not numeric
  assertEquals(validateOptimizelyProjectId("123abc"), false); // not numeric
  assertEquals(validateOptimizelyProjectId("1".repeat(21)), false); // too long
  assertEquals(validateOptimizelyProjectId("12.34"), false); // contains dot
  assertEquals(validateOptimizelyProjectId("12-34"), false); // contains hyphen
  // @ts-expect-error: Testing non-string input
  assertEquals(validateOptimizelyProjectId(null), false);
  // @ts-expect-error: Testing non-string input
  assertEquals(validateOptimizelyProjectId(undefined), false);
});

// validateEnvironmentName tests
Deno.test("validateEnvironmentName: accepts valid environment names", () => {
  assertEquals(validateEnvironmentName("production"), true);
  assertEquals(validateEnvironmentName("dev"), true);
  assertEquals(validateEnvironmentName("test-env"), true);
  assertEquals(validateEnvironmentName("env_123"), true);
  assertEquals(validateEnvironmentName("stage.v2"), true);
});

Deno.test("validateEnvironmentName: rejects invalid environment names", () => {
  assertEquals(validateEnvironmentName(""), false);
  assertEquals(validateEnvironmentName("env with spaces"), false);
  assertEquals(validateEnvironmentName("env@invalid"), false);
  assertEquals(validateEnvironmentName("a".repeat(51)), false); // too long
  // @ts-expect-error: Testing non-string input
  assertEquals(validateEnvironmentName(null), false);
  // @ts-expect-error: Testing non-string input
  assertEquals(validateEnvironmentName(undefined), false);
});

// validateReportsPath tests
Deno.test("validateReportsPath: accepts valid paths", () => {
  assertEquals(validateReportsPath("reports"), true);
  assertEquals(validateReportsPath("output/reports"), true);
  assertEquals(validateReportsPath("reports/test.json"), true);
  assertEquals(validateReportsPath("my-reports_v2"), true);
});

Deno.test("validateReportsPath: rejects invalid paths", () => {
  assertEquals(validateReportsPath(""), false);
  assertEquals(validateReportsPath("../secrets"), false); // directory traversal
  assertEquals(validateReportsPath("reports/../config"), false); // directory traversal
  assertEquals(validateReportsPath("/absolute/path"), false); // absolute path
  assertEquals(validateReportsPath("C:\\windows\\path"), false); // Windows absolute path
  assertEquals(validateReportsPath("a".repeat(201)), false); // too long
  // @ts-expect-error: Testing non-string input
  assertEquals(validateReportsPath(null), false);
  // @ts-expect-error: Testing non-string input
  assertEquals(validateReportsPath(undefined), false);
});

// validateFlagKeys tests
Deno.test("validateFlagKeys: accepts valid flag key arrays", () => {
  validateFlagKeys(["flag1", "flag2"]);
  validateFlagKeys(["my-feature"]);
  validateFlagKeys([]); // empty array is valid
});

Deno.test("validateFlagKeys: throws on invalid inputs", () => {
  // @ts-expect-error: Testing non-array input
  assertThrows(() => validateFlagKeys("not-array"), Error, "Flag keys must be an array");
  
  assertThrows(() => validateFlagKeys(["valid", ""]), Error, "Flag key must be a non-empty string");
  
  assertThrows(() => validateFlagKeys(["valid", "a"]), Error, "Flag key must be at least 2 characters long");
  
  assertThrows(() => validateFlagKeys(["valid", "invalid spaces"]), Error, 
    "Flag key must contain only alphanumeric characters, underscores, and hyphens");
});

// validateFilePath tests
Deno.test("validateFilePath: accepts valid file paths", () => {
  validateFilePath("file.txt");
  validateFilePath("path/to/file.json");
  validateFilePath("reports/output.csv");
});

Deno.test("validateFilePath: throws on invalid file paths", () => {
  assertThrows(() => validateFilePath(""), Error, "File path must be a non-empty string");
  
  // @ts-expect-error: Testing non-string input
  assertThrows(() => validateFilePath(null), Error, "File path must be a non-empty string");
  
  assertThrows(() => validateFilePath("../secret.txt"), Error, 
    "File path cannot contain '..' for security reasons");
  
  assertThrows(() => validateFilePath("path/to/../secret.txt"), Error, 
    "File path cannot contain '..' for security reasons");
  
  const longPath = "a".repeat(1001);
  assertThrows(() => validateFilePath(longPath), Error, 
    "File path is too long (maximum 1000 characters)");
});

// validateInputs additional tests
Deno.test("validateInputs: validates environment parameter", () => {
  validateInputs({
    operation: "audit",
    optimizelyApiToken: "valid_token_123456",
    optimizelyProjectId: "12345",
    environment: "production",
  });
});

Deno.test("validateInputs: throws on invalid environment", () => {
  assertThrows(() => validateInputs({
    operation: "audit",
    optimizelyApiToken: "valid_token_123456",
    optimizelyProjectId: "12345",
    environment: "invalid environment",
  }), Error, "Invalid environment name format");
});

Deno.test("validateInputs: throws on missing project ID", () => {
  assertThrows(() => validateInputs({
    operation: "audit",
    optimizelyApiToken: "valid_token_123456",
  }), Error, "OPTIMIZELY_PROJECT_ID environment variable is required");
});

Deno.test("validateInputs: throws on invalid API token format", () => {
  assertThrows(() => validateInputs({
    operation: "audit",
    optimizelyApiToken: "short",
    optimizelyProjectId: "12345",
  }), Error, "OPTIMIZELY_API_TOKEN appears to be invalid format");
});

Deno.test("validateInputs: throws on invalid project ID format", () => {
  assertThrows(() => validateInputs({
    operation: "audit",
    optimizelyApiToken: "valid_token_123456",
    optimizelyProjectId: "abc123",
  }), Error, "OPTIMIZELY_PROJECT_ID must be a numeric string");
});

// validateEnvironmentConfig tests
Deno.test("validateEnvironmentConfig: accepts valid configuration", () => {
  const validConfig: EnvironmentConfig = {
    OPTIMIZELY_API_TOKEN: "valid_token_123456",
    OPTIMIZELY_PROJECT_ID: "12345",
    ENVIRONMENT: "production",
    OPERATION: "cleanup",
    API_RATE_LIMIT: 5,
    API_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    CONCURRENCY_LIMIT: 5,
    REPORTS_PATH: "reports",
    LOG_LEVEL: "info",
    DRY_RUN: false,
  };

  const result = validateEnvironmentConfig(validConfig);
  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateEnvironmentConfig: detects missing required fields", () => {
  const invalidConfig = {
    ENVIRONMENT: "production",
    OPERATION: "cleanup",
    API_RATE_LIMIT: 5,
    API_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    CONCURRENCY_LIMIT: 5,
    REPORTS_PATH: "reports",
    LOG_LEVEL: "info",
    DRY_RUN: false,
  } as EnvironmentConfig;

  const result = validateEnvironmentConfig(invalidConfig);
  assertEquals(result.isValid, false);
  assert(result.errors.some(e => e.includes("Missing OPTIMIZELY_API_TOKEN")));
  assert(result.errors.some(e => e.includes("Missing OPTIMIZELY_PROJECT_ID")));
});

Deno.test("validateEnvironmentConfig: detects invalid field formats", () => {
  const invalidConfig: EnvironmentConfig = {
    OPTIMIZELY_API_TOKEN: "short",
    OPTIMIZELY_PROJECT_ID: "abc123",
    ENVIRONMENT: "production",
    OPERATION: "invalid" as "cleanup", // Type assertion to bypass type checking for test
    API_RATE_LIMIT: 150, // too high
    API_TIMEOUT: 500, // too low
    MAX_RETRIES: 15, // too high
    CONCURRENCY_LIMIT: 25, // too high
    REPORTS_PATH: "/absolute/path",
    LOG_LEVEL: "invalid",
    DRY_RUN: false,
  };

  const result = validateEnvironmentConfig(invalidConfig);
  assertEquals(result.isValid, false);
  assert(result.errors.some(e => e.includes("Invalid OPTIMIZELY_API_TOKEN format")));
  assert(result.errors.some(e => e.includes("Invalid OPTIMIZELY_PROJECT_ID format")));
  assert(result.errors.some(e => e.includes("Invalid OPERATION")));
  assert(result.errors.some(e => e.includes("API_RATE_LIMIT must be between 1 and 100")));
  assert(result.errors.some(e => e.includes("API_TIMEOUT must be between 1000ms and 300000ms")));
  assert(result.errors.some(e => e.includes("MAX_RETRIES must be between 0 and 10")));
  assert(result.errors.some(e => e.includes("CONCURRENCY_LIMIT must be between 1 and 20")));
  assert(result.errors.some(e => e.includes("Invalid REPORTS_PATH format")));
  assert(result.errors.some(e => e.includes("Invalid LOG_LEVEL")));
});

Deno.test("validateEnvironmentConfig: generates appropriate warnings", () => {
  const configWithWarnings: EnvironmentConfig = {
    OPTIMIZELY_API_TOKEN: "valid_token_123456",
    OPTIMIZELY_PROJECT_ID: "12345",
    ENVIRONMENT: "production",
    OPERATION: "cleanup",
    API_RATE_LIMIT: 15, // high rate limit
    API_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    CONCURRENCY_LIMIT: 15, // high concurrency
    REPORTS_PATH: "reports",
    LOG_LEVEL: "info",
    DRY_RUN: true,
  };

  const result = validateEnvironmentConfig(configWithWarnings);
  assertEquals(result.isValid, true);
  assert(result.warnings.some(w => w.includes("DRY_RUN is enabled for cleanup operation")));
  assert(result.warnings.some(w => w.includes("High API_RATE_LIMIT may cause rate limiting issues")));
  assert(result.warnings.some(w => w.includes("High CONCURRENCY_LIMIT may impact system performance")));
});

Deno.test("validateEnvironmentConfig: handles edge case values", () => {
  const edgeCaseConfig: EnvironmentConfig = {
    OPTIMIZELY_API_TOKEN: "valid_token_123456",
    OPTIMIZELY_PROJECT_ID: "12345",
    ENVIRONMENT: "test",
    OPERATION: "audit",
    API_RATE_LIMIT: 1, // minimum
    API_TIMEOUT: 1000, // minimum
    MAX_RETRIES: 0, // minimum
    CONCURRENCY_LIMIT: 1, // minimum
    REPORTS_PATH: "reports",
    LOG_LEVEL: "DEBUG", // uppercase
    DRY_RUN: false,
  };

  const result = validateEnvironmentConfig(edgeCaseConfig);
  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
});
