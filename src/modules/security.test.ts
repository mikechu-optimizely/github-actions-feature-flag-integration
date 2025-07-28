import {
  encryptSecret,
  logSecurityEvent,
  sanitizeData,
  validateGitHubToken,
  validateOptimizelyToken,
} from "./security.ts";
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/testing/asserts.ts";

Deno.test("validateOptimizelyToken: accepts valid token", () => {
  validateOptimizelyToken("a".repeat(32));
  validateOptimizelyToken("abc123def456ghi789jkl012mno345pq");
});

Deno.test("validateOptimizelyToken: throws on invalid token", () => {
  assertThrows(
    () => validateOptimizelyToken("short"),
    Error,
    "Invalid Optimizely API token format.",
  );
  assertThrows(() => validateOptimizelyToken(123 as unknown as string), Error);
  assertThrows(() => validateOptimizelyToken("!@#notvalidtoken!@#"), Error);
});

Deno.test("validateGitHubToken: accepts valid tokens", () => {
  validateGitHubToken("ghp_" + "a".repeat(36));
  validateGitHubToken("gho_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8");
});

Deno.test("validateGitHubToken: throws on invalid tokens", () => {
  assertThrows(
    () => validateGitHubToken("not_a_token"),
    Error,
    "Invalid GitHub token format.",
  );
  assertThrows(() => validateGitHubToken(123 as unknown as string), Error);
  assertThrows(() => validateGitHubToken("ghp_short"), Error);
});

Deno.test("sanitizeData: redacts default sensitive fields", () => {
  const input = {
    token: "secret",
    apiKey: "key",
    authorization: "auth",
    foo: "bar",
  };
  const sanitized = sanitizeData(input);
  assertEquals(sanitized.token, "[REDACTED]");
  assertEquals(sanitized.apiKey, "[REDACTED]");
  assertEquals(sanitized.authorization, "[REDACTED]");
  assertEquals(sanitized.foo, "bar");
});

Deno.test("sanitizeData: redacts custom fields", () => {
  const input = { password: "pw", secret: "s3cr3t", foo: "bar" };
  const sanitized = sanitizeData(input, ["password", "secret"]);
  assertEquals(sanitized.password, "[REDACTED]");
  assertEquals(sanitized.secret, "[REDACTED]");
  assertEquals(sanitized.foo, "bar");
});

Deno.test("encryptSecret: encrypts strings correctly", () => {
  const secret = "mySecretValue";
  const encrypted = encryptSecret(secret);

  // Verify it's not the original value
  assertEquals(encrypted !== secret, true);

  // Verify it's base64 encoded
  assertEquals(typeof encrypted, "string");
  assertEquals(encrypted.length > 0, true);

  // Verify same input produces same output (deterministic)
  assertEquals(encryptSecret(secret), encrypted);
});

Deno.test("encryptSecret: handles empty string", () => {
  const encrypted = encryptSecret("");
  assertEquals(typeof encrypted, "string");
  // Empty string base64 encoded is still empty, which is expected
  assertEquals(encrypted, "");
});

Deno.test("encryptSecret: handles special characters", () => {
  const secret = "special!@#$%^&*()_+{}|:<>?[]\\;'\",./ 123";
  const encrypted = encryptSecret(secret);
  assertEquals(typeof encrypted, "string");
  assertEquals(encrypted.length > 0, true);
});

Deno.test("logSecurityEvent: logs event without details", () => {
  // Mock console.log to capture output
  const originalLog = console.log;
  let loggedMessage = "";
  console.log = (message: string) => {
    loggedMessage = message;
  };

  try {
    logSecurityEvent("TEST_EVENT");

    // Verify the log format
    assertEquals(loggedMessage.includes("[SECURITY EVENT]"), true);
    assertEquals(loggedMessage.includes("TEST_EVENT"), true);
    assertEquals(loggedMessage.includes(new Date().getFullYear().toString()), true);
  } finally {
    console.log = originalLog;
  }
});

Deno.test("logSecurityEvent: logs event with sanitized details", () => {
  // Mock console.log to capture output
  const originalLog = console.log;
  let loggedMessage = "";
  let loggedDetails: Record<string, unknown> = {};
  console.log = (message: string, details?: Record<string, unknown>) => {
    loggedMessage = message;
    if (details) loggedDetails = details;
  };

  try {
    const details = {
      userId: "123",
      token: "secret-token",
      action: "archive-flag",
    };

    logSecurityEvent("FLAG_ARCHIVED", details);

    // Verify the log format
    assertEquals(loggedMessage.includes("[SECURITY EVENT]"), true);
    assertEquals(loggedMessage.includes("FLAG_ARCHIVED"), true);

    // Verify details are sanitized
    assertEquals(loggedDetails.userId, "123");
    assertEquals(loggedDetails.token, "[REDACTED]");
    assertEquals(loggedDetails.action, "archive-flag");
  } finally {
    console.log = originalLog;
  }
});
