import { assertEnvApiAvailable, loadEnvironment } from "./environment.ts";
import { assertEquals, assertRejects } from "https://deno.land/std@0.204.0/testing/asserts.ts";

Deno.test("loadEnvironmentVariables returns all variables when present", async () => {
  // Store original values
  const originalValues: Record<string, string | undefined> = {};
  const envVars = {
    OPTIMIZELY_API_TOKEN: "test-token-12345",
    OPTIMIZELY_PROJECT_ID: "123456",
    GITHUB_TOKEN: "gh-token-123",
    ENVIRONMENT: "dev",
    OPERATION: "cleanup",
    DRY_RUN: "true",
  };

  // Store and set environment variables
  for (const [k, v] of Object.entries(envVars)) {
    originalValues[k] = Deno.env.get(k);
    Deno.env.set(k, v);
  }

  try {
    const result = await loadEnvironment();
    assertEquals(result.OPTIMIZELY_API_TOKEN, "test-token-12345");
    assertEquals(result.OPTIMIZELY_PROJECT_ID, "123456");
    assertEquals(result.GITHUB_TOKEN, "gh-token-123");
    assertEquals(result.ENVIRONMENT, "dev");
    assertEquals(result.OPERATION, "cleanup");
    assertEquals(result.DRY_RUN, true);
    assertEquals(result.REPORTS_PATH, "reports");
    assertEquals(result.LOG_LEVEL, "info");
    assertEquals(result.API_RATE_LIMIT, 5);
    assertEquals(result.API_TIMEOUT, 30000);
    assertEquals(result.MAX_RETRIES, 3);
    assertEquals(result.CONCURRENCY_LIMIT, 5);
  } finally {
    // Restore original values
    for (const [k] of Object.entries(envVars)) {
      if (originalValues[k] === undefined) {
        Deno.env.delete(k);
      } else {
        Deno.env.set(k, originalValues[k]!);
      }
    }
  }
});

Deno.test("loadEnvironmentVariables returns DRY_RUN as false when set to 'false'", async () => {
  Deno.env.set("OPTIMIZELY_API_TOKEN", "test-token-12345");
  Deno.env.set("OPTIMIZELY_PROJECT_ID", "123456");
  Deno.env.set("GITHUB_TOKEN", "gh");
  Deno.env.set("ENVIRONMENT", "dev");
  Deno.env.set("OPERATION", "cleanup");
  Deno.env.set("DRY_RUN", "false");
  const result = await loadEnvironment();
  assertEquals(result.DRY_RUN, false);
});

Deno.test("loadEnvironmentVariables ignores extra environment variables", async () => {
  Deno.env.set("OPTIMIZELY_API_TOKEN", "test-token-12345");
  Deno.env.set("OPTIMIZELY_PROJECT_ID", "123456");
  Deno.env.set("GITHUB_TOKEN", "gh");
  Deno.env.set("ENVIRONMENT", "dev");
  Deno.env.set("OPERATION", "cleanup");
  Deno.env.set("DRY_RUN", "true");
  Deno.env.set("EXTRA_VAR", "should_be_ignored");
  const result = await loadEnvironment();
  assertEquals(result.OPTIMIZELY_API_TOKEN, "test-token-12345");
  assertEquals(result.ENVIRONMENT, "dev");
  assertEquals(result.DRY_RUN, true);
});

Deno.test("loadEnvironmentVariables throws if missing required variable", async () => {
  // Save current environment state
  const currentToken = Deno.env.get("OPTIMIZELY_API_TOKEN");

  try {
    // Clear the required token and set other vars
    Deno.env.delete("OPTIMIZELY_API_TOKEN");
    Deno.env.set("OPTIMIZELY_PROJECT_ID", "123456");
    Deno.env.set("GITHUB_TOKEN", "gh");
    Deno.env.set("ENVIRONMENT", "dev");
    Deno.env.set("OPERATION", "cleanup");
    Deno.env.set("DRY_RUN", "true");

    await assertRejects(
      () => loadEnvironment(),
      Error,
      "Missing required environment variables: OPTIMIZELY_API_TOKEN",
    );
  } finally {
    // Restore original environment state
    if (currentToken) {
      Deno.env.set("OPTIMIZELY_API_TOKEN", currentToken);
    } else {
      Deno.env.delete("OPTIMIZELY_API_TOKEN");
    }
  }
});

Deno.test("assertEnvApiAvailable does not throw in Deno", () => {
  assertEnvApiAvailable();
});
