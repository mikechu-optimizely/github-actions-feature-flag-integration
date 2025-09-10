/**
 * Authentication and token validation tests for OptimizelyApiClient.
 */
import { assert, assertEquals } from "@std/assert";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { withTestEnvironment } from "../utils/test-helpers.ts";

const originalFetch = globalThis.fetch;
const testEnvVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "123456",
  GITHUB_TOKEN: "gh-token",
  OPERATION: "cleanup",
  DRY_RUN: "true",
};

Deno.test("OptimizelyApiClient Auth: cleanup environment", () => {
  globalThis.fetch = originalFetch;
});

Deno.test("OptimizelyApiClient Auth: token validation - valid token", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "123", name: "Test Project" }), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        }),
      );
    const client = new OptimizelyApiClient("valid-test-token-12345");
    const result = await client.validateTokenAccess();
    assertEquals(result.data, true);
    assertEquals(result.error, null);
  });
});

Deno.test("OptimizelyApiClient Auth: token validation - invalid token", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Unauthorized", {
          status: 401,
          statusText: "Unauthorized",
        }),
      );
    const client = new OptimizelyApiClient("invalid-token");
    const result = await client.validateTokenAccess();
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient Auth: validateTokenAccess caches result", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    let callCount = 0;
    globalThis.fetch = () => {
      callCount++;
      return Promise.resolve(
        new Response(JSON.stringify({ id: "123", name: "Test Project" }), {
          status: 200,
          statusText: "OK",
        }),
      );
    };

    const client = new OptimizelyApiClient("valid-test-token-12345");

    // First call should make API request
    const result1 = await client.validateTokenAccess();
    assertEquals(result1.data, true);
    assertEquals(callCount, 1);

    // Second call should use cached result
    const result2 = await client.validateTokenAccess();
    assertEquals(result2.data, true);
    assertEquals(callCount, 1); // Should not increment
  });
});

Deno.test("OptimizelyApiClient Auth: validateTokenAccess handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject("Non-Error object");

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateTokenAccess();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Token validation failed: Non-Error object");
  });
});

globalThis.fetch = originalFetch;
