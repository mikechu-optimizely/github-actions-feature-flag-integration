import { assertEnvApiAvailable, loadEnvironment } from "./environment.ts";
import { assertEquals, assertRejects } from "@std/assert";
import { withTestEnvironment } from "../utils/test-helpers.ts";

Deno.test("loadEnvironmentVariables returns all variables when present", async () => {
  await withTestEnvironment({
    OPTIMIZELY_API_TOKEN: "test-token-12345",
    OPTIMIZELY_PROJECT_ID: "123456",
    GITHUB_TOKEN: "gh-token-123",
    ENVIRONMENT: "dev",
    OPERATION: "cleanup",
    DRY_RUN: "true",
  }, async () => {
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
  });
});

Deno.test("loadEnvironmentVariables returns DRY_RUN as false when set to 'false'", async () => {
  await withTestEnvironment({
    OPTIMIZELY_API_TOKEN: "test-token-12345",
    OPTIMIZELY_PROJECT_ID: "123456",
    GITHUB_TOKEN: "gh",
    ENVIRONMENT: "dev",
    OPERATION: "cleanup",
    DRY_RUN: "false",
  }, async () => {
    const result = await loadEnvironment();
    assertEquals(result.DRY_RUN, false);
  });
});

Deno.test("loadEnvironmentVariables ignores extra environment variables", async () => {
  await withTestEnvironment({
    OPTIMIZELY_API_TOKEN: "test-token-12345",
    OPTIMIZELY_PROJECT_ID: "123456",
    GITHUB_TOKEN: "gh",
    ENVIRONMENT: "dev",
    OPERATION: "cleanup",
    DRY_RUN: "true",
    EXTRA_VAR: "should_be_ignored",
  }, async () => {
    const result = await loadEnvironment();
    assertEquals(result.OPTIMIZELY_API_TOKEN, "test-token-12345");
    assertEquals(result.ENVIRONMENT, "dev");
    assertEquals(result.DRY_RUN, true);
  });
});

Deno.test("loadEnvironmentVariables throws if missing required variable", async () => {
  await withTestEnvironment({
    // Deliberately omit OPTIMIZELY_API_TOKEN
    OPTIMIZELY_PROJECT_ID: "123456",
    GITHUB_TOKEN: "gh",
    ENVIRONMENT: "dev",
    OPERATION: "cleanup",
    DRY_RUN: "true",
  }, async () => {
    await assertRejects(
      () => loadEnvironment(),
      Error,
      "Missing required environment variables: OPTIMIZELY_API_TOKEN",
    );
  });
});

Deno.test("assertEnvApiAvailable does not throw in Deno", () => {
  assertEnvApiAvailable();
});
