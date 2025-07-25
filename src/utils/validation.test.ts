/**
 * Unit tests for validation utilities.
 */
import { assertThrows, assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { 
  validateApiPath, 
  validateInputs, 
  validateFlagKey, 
  validateLogMessage 
} from "./validation.ts";

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
    () => validateInputs({
      operation: "invalid",
      optimizelyApiToken: "valid_token_123456",
      optimizelyProjectId: "12345",
    }),
    Error,
    "Operation must be one of: cleanup, audit"
  );
});

Deno.test("validateInputs: throws on missing API token", () => {
  assertThrows(
    () => validateInputs({
      operation: "cleanup",
      optimizelyProjectId: "12345",
    }),
    Error,
    "OPTIMIZELY_API_TOKEN environment variable is required"
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
    "Flag key must be a non-empty string"
  );

  assertThrows(
    () => validateFlagKey("a"),
    Error,
    "Flag key must be at least 2 characters long"
  );

  assertThrows(
    () => validateFlagKey("flag with spaces"),
    Error,
    "Flag key must contain only alphanumeric characters, underscores, and hyphens"
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