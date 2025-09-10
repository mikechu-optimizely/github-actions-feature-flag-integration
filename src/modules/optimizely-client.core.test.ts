/**
 * Core functionality tests for OptimizelyApiClient.
 */
import { assert, assertEquals } from "@std/assert";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { Result } from "../utils/try-catch.ts";
import { withTestEnvironment } from "../utils/test-helpers.ts";

const originalFetch = globalThis.fetch;
const testEnvVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "123456",
  GITHUB_TOKEN: "gh-token",
  OPERATION: "cleanup",
  DRY_RUN: "true",
};

Deno.test("OptimizelyApiClient Core: cleanup environment", () => {
  globalThis.fetch = originalFetch;
});

Deno.test("OptimizelyApiClient Core: successful request returns data", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ foo: "bar" }), {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        }),
      );
    const client = new OptimizelyApiClient("test-token");
    const result: Result<{ foo: string }, Error> = await client.request("/test");
    assertEquals(result, { data: { foo: "bar" }, error: null });
  });
});

Deno.test("OptimizelyApiClient Core: failed request returns error", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("unauthorized", {
          status: 401,
          statusText: "Unauthorized",
          headers: { "Content-Type": "text/plain" },
        }),
      );
    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/fail");
    assert(result.error instanceof Error);
    assertEquals(result.data, null);
    assert(
      String(result.error).includes("Authentication failed: Invalid or expired API token"),
    );
  });
});

Deno.test("OptimizelyApiClient Core: invalid path returns error", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("invalid-path");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(String(result.error).includes("API path must be a non-empty string"));
  });
});

Deno.test("OptimizelyApiClient Core: constructor validates token format", () => {
  try {
    new OptimizelyApiClient("");
    assert(false, "Should have thrown error for empty token");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("token is required"));
  }
});

Deno.test("OptimizelyApiClient Core: constructor validates token length", () => {
  try {
    new OptimizelyApiClient("short");
    assert(false, "Should have thrown error for short token");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("too short"));
  }
});

Deno.test("OptimizelyApiClient Core: constructor validates token with invalid characters", () => {
  try {
    new OptimizelyApiClient("token with spaces");
    assert(false, "Should have thrown error for token with spaces");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("invalid characters"));
  }

  try {
    new OptimizelyApiClient("token\nwith\nnewlines");
    assert(false, "Should have thrown error for token with newlines");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("invalid characters"));
  }

  try {
    new OptimizelyApiClient("token\twith\ttabs");
    assert(false, "Should have thrown error for token with tabs");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("invalid characters"));
  }
});

Deno.test("OptimizelyApiClient Core: constructor handles numeric inputs", () => {
  try {
    // @ts-expect-error: Testing non-string input
    new OptimizelyApiClient(123);
    assert(false, "Should have thrown error for numeric token");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("token is required and must be a string"));
  }

  try {
    // @ts-expect-error: Testing null input
    new OptimizelyApiClient(null);
    assert(false, "Should have thrown error for null token");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("token is required and must be a string"));
  }
});

Deno.test("OptimizelyApiClient.create factory method", async () => {
  await withTestEnvironment({
    ...testEnvVars,
    OPTIMIZELY_API_TOKEN: "factory-test-token-12345",
  }, async () => {
    const client = await OptimizelyApiClient.create({ maxRps: 10 });
    assert(client instanceof OptimizelyApiClient);
  });
});

Deno.test("OptimizelyApiClient Core: constructor with custom options", () => {
  const client = new OptimizelyApiClient("test-token-12345", {
    baseUrl: "https://custom.api.com",
    maxRps: 10,
    maxRetries: 5,
    timeoutMs: 45000,
    enableGracefulDegradation: false,
  });
  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient Core: constructor with minimum values", () => {
  const client = new OptimizelyApiClient("test-token-12345", {
    maxRps: 0, // Should be clamped to 1
    maxRetries: -1, // Should be clamped to 0
    timeoutMs: 500, // Should be clamped to 1000
  });
  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient Core: rate limiting behavior", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: "test" }), { status: 200 }),
      );

    const client = new OptimizelyApiClient("test-token", { maxRps: 2 });
    const startTime = Date.now();

    // Make 3 requests quickly
    await client.request("/test1");
    await client.request("/test2");
    await client.request("/test3");

    const elapsed = Date.now() - startTime;
    // Should take at least 1000ms due to rate limiting (2 RPS means 500ms between requests)
    assert(elapsed >= 1000, `Expected at least 1000ms, got ${elapsed}ms`);
  });
});

Deno.test("OptimizelyApiClient Core: request with custom headers", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    let requestHeaders: Headers | undefined;
    globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.headers) {
        requestHeaders = new Headers(init.headers);
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: "test" }), { status: 200 }),
      );
    };

    const client = new OptimizelyApiClient("test-token");
    await client.request("/test", {
      headers: { "X-Custom-Header": "custom-value" },
    });

    assert(requestHeaders);
    assertEquals(requestHeaders.get("X-Custom-Header"), "custom-value");
    assertEquals(requestHeaders.get("Authorization"), "Bearer test-token");
    assertEquals(requestHeaders.get("Content-Type"), "application/json");
    assertEquals(requestHeaders.get("User-Agent"), "Optimizely-Flag-Sync/1.0");
  });
});

Deno.test("OptimizelyApiClient Core: rate limiting with zero maxRps", () => {
  const client = new OptimizelyApiClient("test-token-12345", { maxRps: 0 });
  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient Core: timeout with very low value", () => {
  const client = new OptimizelyApiClient("test-token-12345", { timeoutMs: 100 });
  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient Core: validateResponse handles different invalid response types", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    // Test with primitive response
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve("string response"),
      } as Response);

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Expected object response from Optimizely API"));
  });
});

globalThis.fetch = originalFetch;
