import { assertEnvApiAvailable, loadEnvironment, getSanitizedConfig } from "./environment.ts";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { withTestEnvironment, createTempDir, cleanupTempDir } from "../utils/test-helpers.ts";

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

    // Test operation validation
    await t.step("validateOperation rejects invalid operation types", async () => {
      const reportsPath = "test-reports-invalid-operation";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        OPERATION: "invalid_operation",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes('Invalid OPERATION: "invalid_operation"'),
            true,
            `Expected error message for invalid operation, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    // Test log level validation
    await t.step("validateLogLevel rejects invalid log levels", async () => {
      const reportsPath = "test-reports-invalid-loglevel";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        LOG_LEVEL: "INVALID",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes('Invalid LOG_LEVEL: "INVALID"'),
            true,
            `Expected error message for invalid log level, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    // Test boolean parsing edge cases
    await t.step("parseBooleanEnv handles all valid boolean values", async () => {
      const reportsPath = "test-reports-boolean-values";

      // Test all true values
      for (const value of ["true", "1", "yes", "TRUE", "YES"]) {
        await withTestEnvironment({
          OPTIMIZELY_API_TOKEN: "test-token-12345",
          OPTIMIZELY_PROJECT_ID: "123456",
          DRY_RUN: value,
          REPORTS_PATH: reportsPath,
        }, async () => {
          try {
            const result = await loadEnvironment();
            assertEquals(result.DRY_RUN, true, `Failed for value: ${value}`);
          } finally {
            try {
              await Deno.remove(reportsPath, { recursive: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      }

      // Test all false values
      for (const value of ["false", "0", "no", "FALSE", "NO"]) {
        await withTestEnvironment({
          OPTIMIZELY_API_TOKEN: "test-token-12345",
          OPTIMIZELY_PROJECT_ID: "123456",
          DRY_RUN: value,
          REPORTS_PATH: reportsPath,
        }, async () => {
          try {
            const result = await loadEnvironment();
            assertEquals(result.DRY_RUN, false, `Failed for value: ${value}`);
          } finally {
            try {
              await Deno.remove(reportsPath, { recursive: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      }
    });

    await t.step("parseBooleanEnv rejects invalid boolean values", async () => {
      const reportsPath = "test-reports-invalid-boolean";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        DRY_RUN: "maybe",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes('Invalid boolean value: "maybe"'),
            true,
            `Expected error message for invalid boolean, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    // Test integer parsing edge cases
    await t.step("parseIntEnv rejects invalid integers", async () => {
      const reportsPath = "test-reports-invalid-integer";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        API_RATE_LIMIT: "not_a_number",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes('Invalid integer value: "not_a_number"'),
            true,
            `Expected error message for invalid integer, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    await t.step("parseIntEnv rejects out of range values", async () => {
      const reportsPath = "test-reports-out-of-range";

      // Test value below minimum
      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        API_RATE_LIMIT: "0", // Below minimum of 1
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes("Value out of range: 0. Must be between 1 and 100"),
            true,
            `Expected error message for value below range, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });

      // Test value above maximum
      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "test-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        API_RATE_LIMIT: "101", // Above maximum of 100
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes("Value out of range: 101. Must be between 1 and 100"),
            true,
            `Expected error message for value above range, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    // Test API token format validation
    await t.step("validateEnvironmentConfig rejects invalid API token format", async () => {
      const reportsPath = "test-reports-invalid-token-format";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "invalid@token#format",
        OPTIMIZELY_PROJECT_ID: "123456",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes("Invalid OPTIMIZELY_API_TOKEN format"),
            true,
            `Expected error message for invalid token format, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    // Test project ID format validation
    await t.step("validateEnvironmentConfig rejects invalid project ID format", async () => {
      const reportsPath = "test-reports-invalid-project-id";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "valid-token-12345",
        OPTIMIZELY_PROJECT_ID: "not_numeric",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const error = await assertRejects(
            async () => await loadEnvironment(),
            Error,
          );
          assertEquals(
            error.message.includes("Invalid OPTIMIZELY_PROJECT_ID format"),
            true,
            `Expected error message for invalid project ID, got: ${error.message}`,
          );
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    // Test reports path validation
    await t.step("validateEnvironmentConfig rejects path traversal attempts", async () => {
      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "valid-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        REPORTS_PATH: "../dangerous/path",
      }, async () => {
        const error = await assertRejects(
          async () => await loadEnvironment(),
          Error,
        );
        assertEquals(
          error.message.includes("Invalid REPORTS_PATH. Must be a relative path without directory traversal"),
          true,
          `Expected error message for path traversal, got: ${error.message}`,
        );
      });

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "valid-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        REPORTS_PATH: "/absolute/path",
      }, async () => {
        const error = await assertRejects(
          async () => await loadEnvironment(),
          Error,
        );
        assertEquals(
          error.message.includes("Invalid REPORTS_PATH. Must be a relative path without directory traversal"),
          true,
          `Expected error message for absolute path, got: ${error.message}`,
        );
      });
    });

    // Test directory creation error handling
    await t.step("validateEnvironmentConfig handles directory creation errors", async () => {
      // This test simulates a scenario where directory creation fails
      // We'll use a path that should cause permission issues on most systems
      const invalidPath = "/root/restricted-path";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "valid-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        REPORTS_PATH: invalidPath,
      }, async () => {
        const error = await assertRejects(
          async () => await loadEnvironment(),
          Error,
        );
        // The error should mention the failed directory creation
        assertEquals(
          error.message.includes("Failed to create reports directory") || 
          error.message.includes("Invalid REPORTS_PATH"),
          true,
          `Expected error message for directory creation failure, got: ${error.message}`,
        );
      });
    });

    // Test missing required variables with empty strings
    await t.step("loadEnvironment treats empty strings as missing variables", async () => {
      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "", // Empty string should be treated as missing
        OPTIMIZELY_PROJECT_ID: "123456",
        REPORTS_PATH: "test-reports-empty-token",
      }, async () => {
        const error = await assertRejects(
          async () => await loadEnvironment(),
          Error,
        );
        assertEquals(
          error.message.includes("Missing required environment variables: OPTIMIZELY_API_TOKEN"),
          true,
          `Expected error message for empty token, got: ${error.message}`,
        );
      });
    });

    await t.step("loadEnvironment treats whitespace-only strings as missing variables", async () => {
      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "   ", // Whitespace-only string should be treated as missing
        OPTIMIZELY_PROJECT_ID: "123456",
        REPORTS_PATH: "test-reports-whitespace-token",
      }, async () => {
        const error = await assertRejects(
          async () => await loadEnvironment(),
          Error,
        );
        assertEquals(
          error.message.includes("Missing required environment variables: OPTIMIZELY_API_TOKEN"),
          true,
          `Expected error message for whitespace token, got: ${error.message}`,
        );
      });
    });

    // Test multiple missing required variables
    await t.step("loadEnvironment reports all missing required variables", async () => {
      await withTestEnvironment({}, async () => {
        const error = await assertRejects(
          async () => await loadEnvironment(),
          Error,
        );
        assertEquals(
          error.message.includes("Missing required environment variables: OPTIMIZELY_API_TOKEN, OPTIMIZELY_PROJECT_ID"),
          true,
          `Expected error message for multiple missing variables, got: ${error.message}`,
        );
      });
    });

    // Test getSanitizedConfig functionality
    await t.step("getSanitizedConfig masks sensitive information", async () => {
      const reportsPath = "test-reports-sanitized";

      await withTestEnvironment({
        OPTIMIZELY_API_TOKEN: "very-long-secret-token-12345",
        OPTIMIZELY_PROJECT_ID: "123456",
        GITHUB_TOKEN: "github-secret-token-67890",
        REPORTS_PATH: reportsPath,
      }, async () => {
        try {
          const config = await loadEnvironment();
          const sanitized = getSanitizedConfig(config);

          // Check that API token is masked
          assertEquals(
            sanitized.OPTIMIZELY_API_TOKEN,
            "very-lon...",
            "API token should be masked",
          );

          // Check that GitHub token is masked
          assertEquals(
            sanitized.GITHUB_TOKEN,
            "github-s...",
            "GitHub token should be masked",
          );

          // Check that non-sensitive values are preserved
          assertEquals(sanitized.OPTIMIZELY_PROJECT_ID, "123456");
          assertEquals(sanitized.REPORTS_PATH, reportsPath);
        } finally {
          try {
            await Deno.remove(reportsPath, { recursive: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    await t.step("getSanitizedConfig handles config without sensitive tokens", () => {
      const config = {
        OPTIMIZELY_API_TOKEN: "token-123",
        OPTIMIZELY_PROJECT_ID: "123456",
        ENVIRONMENT: "test",
        OPERATION: "cleanup" as const,
        DRY_RUN: true,
        REPORTS_PATH: "test-reports",
        LOG_LEVEL: "info",
        API_RATE_LIMIT: 5,
        API_TIMEOUT: 30000,
        MAX_RETRIES: 3,
        CONCURRENCY_LIMIT: 5,
      };

      const sanitized = getSanitizedConfig(config);
      assertEquals(sanitized.OPTIMIZELY_API_TOKEN, "token-12...");
      assertEquals(sanitized.GITHUB_TOKEN, undefined); // Should remain undefined
    });
  },
});
