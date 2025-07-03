import {
  sanitizeData,
  validateGitHubToken,
  validateOptimizelyToken,
} from "./security.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";

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
