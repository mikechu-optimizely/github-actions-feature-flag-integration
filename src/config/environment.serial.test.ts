import { assertEnvApiAvailable, loadEnvironment } from "./environment.ts";
import { assertEquals, assertRejects } from "@std/assert";
import { withTestEnvironment } from "../utils/test-helpers.ts";

/**
 * Environment variable tests that modify global state.
 * These tests run serially to avoid conflicts between parallel executions.
 */
Deno.test({
  name: "Environment Configuration Tests",
  sanitizeOps: true, // Restore proper sanitization checks
  sanitizeResources: true,
  fn: async (t) => {
    await t.step("loadEnvironmentVariables returns all variables when present", async () => {
      const reportsPath = "test-reports-env-all-vars";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        GITHUB_TOKEN: "gh-token-123",
        ENVIRONMENT: "dev",
        OPERATION: "cleanup",
        DRY_RUN: "true",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const result = await loadEnvironment();
          assertEquals(result.OPTIMIZELY_API_TOKEN, "test-token-12345");
          assertEquals(result.OPTIMIZELY_PROJECT_ID, "123456");
          assertEquals(result.GITHUB_TOKEN, "gh-token-123");
          assertEquals(result.ENVIRONMENT, "dev");
          assertEquals(result.OPERATION, "cleanup");
          assertEquals(result.DRY_RUN, true);
          assertEquals(result.REPORTS_PATH, reportsPath);
          assertEquals(result.LOG_LEVEL, "info");
          assertEquals(result.API_RATE_LIMIT, 5);
          assertEquals(result.API_TIMEOUT, 30000);
          assertEquals(result.MAX_RETRIES, 3);
          assertEquals(result.CONCURRENCY_LIMIT, 5);
        } finally {
          // Clean up the test reports directory
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    await t.step(
      "loadEnvironmentVariables returns DRY_RUN as false when set to 'false'",
      async () => {
        const reportsPath = "test-reports-env-dry-run-false";

        await withTestEnvironment({
          OPTIMIZELY_API_TOKEN: "test-token-12345",
          OPTIMIZELY_PROJECT_ID: "123456",
          GITHUB_TOKEN: "gh",
          ENVIRONMENT: "dev",
          OPERATION: "cleanup",
          DRY_RUN: "false",
          REPORTS_PATH: reportsPath,
        }, async () => {
          try {
            const result = await loadEnvironment();
            assertEquals(result.DRY_RUN, false);
          } finally {
            try {
              await Deno.remove(reportsPath, { recursive: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      },
    );

    await t.step("loadEnvironmentVariables ignores extra environment variables", async () => {
      const reportsPath = "test-reports-env-extra-vars";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        GITHUB_TOKEN: "gh",
        ENVIRONMENT: "dev",
        OPERATION: "cleanup",
        DRY_RUN: "true",
        REPORTS_PATH: reportsPath,
        EXTRA_VAR: "should_be_ignored",
      }, async () => {
        try {
          const result = await loadEnvironment();
          assertEquals(result.OPTIMIZELY_API_TOKEN, "test-token-12345");
          assertEquals(result.ENVIRONMENT, "dev");
          assertEquals(result.DRY_RUN, true);
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    await t.step("loadEnvironmentVariables throws if missing required variable", async () => {
      const reportsPath = "test-reports-env-missing-var";

      await withTestEnvironment({
        // Deliberately omit OPTIMIZELY_API_TOKEN
        OPTIMIZELY_PROJECT_ID: "123456",
        GITHUB_TOKEN: "gh",
        ENVIRONMENT: "dev",
        OPERATION: "cleanup",
        DRY_RUN: "true",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          // Explicitly verify the environment variable is not set
          const apiToken = Deno.env.get("OPTIMIZELY_API_TOKEN");
          assertEquals(
            apiToken,
            undefined,
            "OPTIMIZELY_API_TOKEN should be undefined in test environment",
          );

          // Test that loadEnvironment throws the expected error
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );

          // Verify the error message contains the expected text
          assertEquals(
            error.message.includes("Missing required environment variables: OPTIMIZELY_API_TOKEN"),
            true,
            `Expected error message to include missing OPTIMIZELY_API_TOKEN, got: ${error.message}`,
          );
        } finally {
          // Clean up the test reports directory if it was created
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    await t.step("assertEnvApiAvailable does not throw in Deno", () => {
      assertEnvApiAvailable();
    });
  },
});
