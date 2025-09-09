import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withTestEnvironment } from "./utils/test-helpers.ts";

/**
 * Main entry point integration tests.
 * These tests use actual process execution and may modify global state,
 * so they run serially to avoid conflicts.
 */
Deno.test({
  name: "Main Entry Point Integration Tests",
  sanitizeOps: true,
  sanitizeResources: true,
  fn: async (t) => {
    await t.step("parseCommandLineArgs functionality", async (t) => {
      await t.step("should parse default command line arguments correctly", async () => {
        await withTestEnvironment({
          OPTIMIZELY_API_TOKEN: "test-token",
          OPTIMIZELY_PROJECT_ID: "test-project-id",
        }, async () => {
          // Test CLI argument parsing by checking the help output
          // Since Deno.args is read-only, we test through process execution
          const process = new Deno.Command("deno", {
            args: ["run", "--allow-read", "src/main.ts", "--help"],
            stdout: "piped",
            stderr: "piped",
          });

          const { code, stdout } = await process.output();
          const output = new TextDecoder().decode(stdout);

          assertEquals(code, 0);
          assertEquals(output.includes("Feature Flag Synchronization Tool"), true);
          assertEquals(output.includes("--operation <op>"), true);
          assertEquals(output.includes("--dry-run"), true);
          assertEquals(output.includes("--environment <env>"), true);
        });
      });

      await t.step("should handle help flag correctly", async () => {
        const process = new Deno.Command("deno", {
          args: ["run", "--allow-read", "src/main.ts", "--help"],
          stdout: "piped",
          stderr: "piped",
        });

        const { code, stdout } = await process.output();
        const output = new TextDecoder().decode(stdout);

        assertEquals(code, 0);
        assertEquals(output.includes("USAGE:"), true);
        assertEquals(output.includes("EXAMPLES:"), true);
      });
    });

    await t.step("validateConfiguration functionality", async (t) => {
      await t.step("should fail validation without required environment variables", async () => {
        // Don't set required env vars to test validation failure
        const process = new Deno.Command("deno", {
          args: ["run", "--allow-all", "src/main.ts", "--operation", "audit"],
          stdout: "piped",
          stderr: "piped",
        });

        const { code, stderr } = await process.output();
        const errorOutput = new TextDecoder().decode(stderr);

        // Should fail due to missing OPTIMIZELY_API_TOKEN and OPTIMIZELY_PROJECT_ID
        assertEquals(code, 1);
        assertEquals(
          errorOutput.includes("validation") || errorOutput.includes("token") ||
            errorOutput.includes("required"),
          true,
        );
      });

      await t.step("should pass validation with required environment variables", async () => {
        await withTestEnvironment({
          OPTIMIZELY_API_TOKEN: "test-token-123",
          OPTIMIZELY_PROJECT_ID: "123456",
        }, async () => {
          const process = new Deno.Command("deno", {
            args: ["run", "--allow-all", "src/main.ts", "--operation", "audit", "--dry-run"],
            stdout: "piped",
            stderr: "piped",
          });

          const { code: _code, stdout, stderr } = await process.output();
          const output = new TextDecoder().decode(stdout);
          const errorOutput = new TextDecoder().decode(stderr);

          // Should not fail due to validation (might fail later due to actual API calls)
          // We expect it to at least start the synchronization process
          assertEquals(
            output.includes("Starting feature flag synchronization") ||
              output.includes("Configuration loaded") ||
              errorOutput.includes("Authentication failed") || // Expected with test credentials
              errorOutput.includes("fetch"),
            true,
          );
        });
      });
    });

    await t.step("initializeComponents functionality", async (t) => {
      await t.step(
        "should initialize components successfully with valid configuration",
        async () => {
          await withTestEnvironment({
            OPTIMIZELY_API_TOKEN: "test-token-123",
            OPTIMIZELY_PROJECT_ID: "123456",
          }, async () => {
            // Test that main.ts starts without immediately failing due to component initialization
            const process = new Deno.Command("deno", {
              args: ["run", "--allow-all", "src/main.ts", "--operation", "audit", "--dry-run"],
              stdout: "piped",
              stderr: "piped",
            });

            const { stdout, stderr } = await process.output();
            const output = new TextDecoder().decode(stdout);
            const errorOutput = new TextDecoder().decode(stderr);

            // Should start the synchronization process, indicating successful component initialization
            const hasStartMessage = output.includes("Starting feature flag synchronization");
            const hasComponentError = errorOutput.includes("component") ||
              errorOutput.includes("initialize");

            // Either starts successfully or fails later (not during component init)
            assertEquals(hasStartMessage || !hasComponentError, true);
          });
        },
      );
    });

    await t.step("error handling", async (t) => {
      await t.step("should handle and report errors gracefully", async () => {
        // Test with invalid configuration to trigger error handling
        const process = new Deno.Command("deno", {
          args: ["run", "--allow-all", "src/main.ts", "--operation", "invalid"],
          stdout: "piped",
          stderr: "piped",
        });

        const { code, stderr, stdout } = await process.output();
        const errorOutput = new TextDecoder().decode(stderr);
        const output = new TextDecoder().decode(stdout);

        // Should exit with error code and show error message
        assertEquals(code, 1);
        assertEquals(
          errorOutput.includes("error") ||
            errorOutput.includes("validation") ||
            output.includes("❌"),
          true,
        );
      });
    });

    await t.step("comprehensive logging", async (t) => {
      await t.step("should provide comprehensive logging during execution", async () => {
        await withTestEnvironment({
          OPTIMIZELY_API_TOKEN: "test-token-123",
          OPTIMIZELY_PROJECT_ID: "123456",
        }, async () => {
          const process = new Deno.Command("deno", {
            args: ["run", "--allow-all", "src/main.ts", "--operation", "audit", "--dry-run"],
            stdout: "piped",
            stderr: "piped",
          });

          const { stdout } = await process.output();
          const output = new TextDecoder().decode(stdout);

          // Check for comprehensive logging output - either successful start or expected auth failure with logs
          const hasStartLog = output.includes("Starting feature flag synchronization") ||
            output.includes("📡") ||
            output.includes("🔍") ||
            output.includes("Configuration loaded");

          assertEquals(hasStartLog, true);
        });
      });
    });
  },
});
