/**
 * Unit tests for test helper utilities.
 */

import { assert, assertEquals } from "@std/assert";
import {
  assertFileContains,
  assertFileExists,
  assertJsonStructure,
  cleanupTempDir,
  cleanupTestEnvironment,
  createMockAuditEvent,
  createMockEnvironment,
  createMockFetch,
  createMockFlag,
  createSpy,
  createTempDir,
  setupTestEnvironment,
  TestFixtures,
  waitFor,
} from "./test-helpers.ts";

Deno.test("createMockEnvironment returns valid environment config", () => {
  // Ensure clean environment at start
  cleanupTestEnvironment();

  const env = createMockEnvironment();

  assertEquals(env.OPTIMIZELY_API_TOKEN, "test-token-12345");
  assertEquals(env.OPTIMIZELY_PROJECT_ID, "123456");
  assertEquals(env.ENVIRONMENT, "test");
  assertEquals(env.OPERATION, "cleanup");
  assertEquals(env.DRY_RUN, true);
  assertEquals(env.REPORTS_PATH, "test-reports");
  assertEquals(env.LOG_LEVEL, "info");
  assertEquals(env.API_RATE_LIMIT, 5);
  assertEquals(env.API_TIMEOUT, 30000);
  assertEquals(env.MAX_RETRIES, 3);
  assertEquals(env.CONCURRENCY_LIMIT, 5);
});

Deno.test("createMockEnvironment accepts overrides", () => {
  const env = createMockEnvironment({
    OPERATION: "audit",
    DRY_RUN: false,
    API_RATE_LIMIT: 10,
  });

  assertEquals(env.OPERATION, "audit");
  assertEquals(env.DRY_RUN, false);
  assertEquals(env.API_RATE_LIMIT, 10);
  // Other values should remain default
  assertEquals(env.OPTIMIZELY_API_TOKEN, "test-token-12345");
});

Deno.test("createMockFlag returns valid flag object", () => {
  const flag = createMockFlag();

  assert(flag.key.startsWith("test_flag_"));
  assertEquals(flag.name, "Test Flag");
  assertEquals(flag.description, "A test feature flag");
  assertEquals(flag.url, "/flags/test-flag");
  assertEquals(flag.archived, false);
  assert(flag.environments);
});

Deno.test("createMockFlag accepts overrides", () => {
  const flag = createMockFlag({
    key: "custom_flag",
    name: "Custom Flag",
    archived: true,
  });

  assertEquals(flag.key, "custom_flag");
  assertEquals(flag.name, "Custom Flag");
  assertEquals(flag.archived, true);
});

Deno.test("createMockAuditEvent returns valid audit event", () => {
  const event = createMockAuditEvent();

  assertEquals(event.type, "flag_in_use");
  assertEquals(event.message, "Test audit event: flag_in_use");
  assert(event.timestamp);
  assert(event.details);
  assertEquals(event.details.flagKey, "test_flag");
});

Deno.test("createMockFetch returns mock fetch function", async () => {
  const mockFetch = createMockFetch([
    { body: { success: true }, status: 200 },
  ]);

  const response = await mockFetch("https://api.example.com/test");
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data, { success: true });
});

Deno.test("createMockFetch validates URL patterns", async () => {
  const mockFetch = createMockFetch([
    { url: /api\.example\.com/, body: { success: true } },
  ]);

  // This should work
  await mockFetch("https://api.example.com/test");

  // This should throw
  try {
    await mockFetch("https://other.com/test");
    assert(false, "Expected error for mismatched URL");
  } catch (error) {
    assert((error as Error).message.includes("does not match pattern"));
  }
});

/**
 * Test for environment setup/cleanup functions that modify global state.
 * Runs serially with proper sanitization checks.
 */
Deno.test({
  name: "Test Environment Management Tests",
  sanitizeOps: true, // Restore proper sanitization
  sanitizeResources: true,
  fn: async (t) => {
    await t.step("setupTestEnvironment and cleanupTestEnvironment work correctly", () => {
      // Store original values to restore after test
      const originalEnv: Record<string, string | undefined> = {};
      const envVarsToCheck = [
        "OPTIMIZELY_API_TOKEN",
        "OPTIMIZELY_PROJECT_ID",
        "ENVIRONMENT",
        "OPERATION",
        "DRY_RUN",
        "REPORTS_PATH",
        "LOG_LEVEL",
        "API_RATE_LIMIT",
        "API_TIMEOUT",
        "MAX_RETRIES",
        "CONCURRENCY_LIMIT",
        "GITHUB_TOKEN",
        "GITHUB_RUN_ID",
      ];

      for (const envVar of envVarsToCheck) {
        originalEnv[envVar] = Deno.env.get(envVar);
      }

      try {
        // Clean slate
        cleanupTestEnvironment();

        // Wait a bit to ensure environment changes have been processed
        const token = Deno.env.get("OPTIMIZELY_API_TOKEN");
        assert(
          !token,
          `OPTIMIZELY_API_TOKEN should be undefined after cleanup but was: ${token}`,
        );

        // Setup
        setupTestEnvironment();

        // Verify environment was set correctly
        const actualToken = Deno.env.get("OPTIMIZELY_API_TOKEN");
        assertEquals(
          actualToken,
          "test-token-12345",
          `Expected token to be 'test-token-12345' but was: ${actualToken}`,
        );
        assertEquals(Deno.env.get("OPERATION"), "cleanup");

        // Setup with overrides
        setupTestEnvironment({ OPERATION: "audit" });
        assertEquals(Deno.env.get("OPERATION"), "audit");

        // Cleanup
        cleanupTestEnvironment();
        assert(
          !Deno.env.get("OPTIMIZELY_API_TOKEN"),
          "OPTIMIZELY_API_TOKEN should be undefined after final cleanup",
        );
        assert(!Deno.env.get("OPERATION"), "OPERATION should be undefined after final cleanup");
      } finally {
        // Restore original environment
        for (const [envVar, originalValue] of Object.entries(originalEnv)) {
          if (originalValue === undefined) {
            Deno.env.delete(envVar);
          } else {
            Deno.env.set(envVar, originalValue);
          }
        }
      }
    });
  },
});

Deno.test("createTempDir and cleanupTempDir work correctly", async () => {
  const tempDir = await createTempDir("test-helpers-");

  // Directory should exist
  await assertFileExists(tempDir);

  // Create a test file
  const testFile = `${tempDir}/test.txt`;
  await Deno.writeTextFile(testFile, "test content");
  await assertFileExists(testFile);
  await assertFileContains(testFile, "test content");

  // Cleanup should remove everything
  await cleanupTempDir(tempDir);

  // Directory should no longer exist
  try {
    await Deno.stat(tempDir);
    assert(false, "Expected directory to be removed");
  } catch (error) {
    assert(error instanceof Deno.errors.NotFound);
  }
});

Deno.test("assertJsonStructure validates JSON structure", () => {
  const jsonString = JSON.stringify({
    name: "test",
    count: 42,
    nested: { value: true },
  });

  // This should pass
  assertJsonStructure(jsonString, {
    name: "test",
    count: 42,
    nested: {},
  });

  // This should throw
  try {
    assertJsonStructure(jsonString, {
      name: "wrong",
    });
    assert(false, "Expected assertion to fail");
  } catch (error) {
    assert((error as Error).message.includes("Values are not equal"));
  }
});

Deno.test("createSpy records function calls", () => {
  const originalFn = (a: number, b: string) => `${a}:${b}`;
  const spy = createSpy(originalFn as (...args: unknown[]) => unknown);

  assertEquals(spy.callCount, 0);
  assertEquals(spy.calls, []);

  const result1 = spy(1, "hello");
  assertEquals(result1, "1:hello");
  assertEquals(spy.callCount, 1);
  assertEquals(spy.calls, [[1, "hello"]]);

  spy(2, "world");
  assertEquals(spy.callCount, 2);
  assertEquals(spy.calls, [[1, "hello"], [2, "world"]]);

  spy.reset();
  assertEquals(spy.callCount, 0);
  assertEquals(spy.calls, []);
});

Deno.test("waitFor waits for condition to be true", async () => {
  let counter = 0;
  const condition = () => {
    counter++;
    return counter >= 3;
  };

  const startTime = Date.now();
  await waitFor(condition, 1000, 50);
  const elapsed = Date.now() - startTime;

  assertEquals(counter, 3);
  assert(elapsed < 1000); // Should complete before timeout
  assert(elapsed >= 100); // Should take at least 2 intervals
});

Deno.test("waitFor throws on timeout", async () => {
  const condition = () => false; // Never true

  try {
    await waitFor(condition, 100, 20);
    assert(false, "Expected timeout error");
  } catch (error) {
    assert((error as Error).message.includes("Condition not met within 100ms"));
  }
});

Deno.test("TestFixtures contains expected data", () => {
  // Code snippets
  assert(TestFixtures.codeSnippets.typescript.includes("feature_flag_1"));
  assert(TestFixtures.codeSnippets.javascript.includes("js_feature_flag"));
  assert(TestFixtures.codeSnippets.python.includes("python_feature_flag"));

  // API responses
  assertEquals(TestFixtures.apiResponses.featureFlags.items.length, 3);
  assertEquals(TestFixtures.apiResponses.featureFlags.items[0].key, "feature_flag_1");
  assertEquals(TestFixtures.apiResponses.featureFlags.items[2].archived, true);

  // Audit events
  assertEquals(TestFixtures.auditEvents.length, 3);
  assertEquals(TestFixtures.auditEvents[0].type, "flag_in_use");
  assertEquals(TestFixtures.auditEvents[1].type, "flag_unused");
  assertEquals(TestFixtures.auditEvents[2].type, "flag_archived");
});

// Cleanup after all tests
Deno.test("cleanup test environment after tests", () => {
  cleanupTestEnvironment();
});
