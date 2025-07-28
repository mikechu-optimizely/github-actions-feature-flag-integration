/**
 * Unit tests for OptimizelyApiClient.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import { Result } from "../utils/try-catch.ts";

// Mock dependencies
const originalFetch = globalThis.fetch;
const envVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "123456",
  GITHUB_TOKEN: "gh-token",
  OPERATION: "cleanup",
  DRY_RUN: "true",
};

function setEnv() {
  for (const [k, v] of Object.entries(envVars)) {
    Deno.env.set(k, v);
  }
}

Deno.test("OptimizelyApiClient: successful request returns data", async () => {
  setEnv();
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

Deno.test("OptimizelyApiClient: failed request returns error", async () => {
  setEnv();
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

Deno.test("OptimizelyApiClient: invalid path returns error", async () => {
  setEnv();
  const client = new OptimizelyApiClient("test-token");
  const result = await client.request("invalid-path");
  assertEquals(result.data, null);
  assert(result.error instanceof Error);
  assert(String(result.error).includes("API path must be a non-empty string"));
});

Deno.test("OptimizelyApiClient.getAllFeatureFlags returns array of flag objects on success", async () => {
  const client = new OptimizelyApiClient("test-token", {
    baseUrl: "http://localhost:8080/mock-api",
  });
  // Mock the request method for isolation
  client.request = (<T = unknown>(
    _path: string,
    _init?: RequestInit,
  ): Promise<Result<T, Error>> =>
    Promise.resolve({
      data: {
        items: [
          {
            key: "flag_a",
            name: "Flag A",
            url: "/flags/flag_a",
            archived: false,
          },
          {
            key: "flag_b",
            name: "Flag B",
            url: "/flags/flag_b",
            archived: false,
          },
        ],
        nextPageToken: undefined, // No pagination needed for this test
      } as T,
      error: null,
    })) as typeof client.request;
  const result = await client.getAllFeatureFlags();
  if (!result.data || result.data.length !== 2) {
    throw new Error(`Expected 2 flags, got ${JSON.stringify(result.data)}`);
  }
  if (result.data[0].key !== "flag_a" || result.data[1].key !== "flag_b") {
    throw new Error(`Unexpected flag keys: ${result.data.map((f) => f.key)}`);
  }
  if (
    typeof (result as Result<OptimizelyFlag[], Error>).error !== "undefined" &&
    (result as Result<OptimizelyFlag[], Error>).error !== null
  ) {
    throw new Error(
      `Expected error to be null, got ${(result as Result<OptimizelyFlag[], Error>).error}`,
    );
  }
});

Deno.test("OptimizelyApiClient.getAllFeatureFlags returns error on failure", async () => {
  const client = new OptimizelyApiClient("test-token");
  client.request = (<T = unknown>(
    _path: string,
    _init?: RequestInit,
  ): Promise<Result<T, Error>> =>
    Promise.resolve({
      data: null,
      error: new Error("API failure"),
    })) as typeof client.request;
  const result = await client.getAllFeatureFlags();
  if (result.data !== null && result.data?.length !== 0) {
    throw new Error(
      `Expected data to be null or empty, got ${JSON.stringify(result.data)}`,
    );
  }
  if (!(result.error instanceof Error)) {
    throw new Error(
      `Expected error to be instance of Error, got ${result.error}`,
    );
  }
});

Deno.test("OptimizelyApiClient.getAllFeatureFlags handles pagination correctly", async () => {
  const client = new OptimizelyApiClient("test-token", {
    baseUrl: "http://localhost:8080/mock-api",
  });

  let callCount = 0;
  // Mock the request method to simulate pagination
  client.request = (<T = unknown>(
    path: string,
    _init?: RequestInit,
  ): Promise<Result<T, Error>> => {
    callCount++;

    if (callCount === 1 && path.includes("/flags") && !path.includes("page_token")) {
      // First page
      return Promise.resolve({
        data: {
          items: [
            {
              key: "flag_page1_1",
              name: "Flag Page 1-1",
              url: "/flags/flag_page1_1",
              archived: false,
            },
            {
              key: "flag_page1_2",
              name: "Flag Page 1-2",
              url: "/flags/flag_page1_2",
              archived: false,
            },
          ],
          nextPageToken: "page2_token",
        } as T,
        error: null,
      });
    } else if (callCount === 2 && path.includes("page_token=page2_token")) {
      // Second page
      return Promise.resolve({
        data: {
          items: [
            {
              key: "flag_page2_1",
              name: "Flag Page 2-1",
              url: "/flags/flag_page2_1",
              archived: false,
            },
          ],
          nextPageToken: undefined, // No more pages
        } as T,
        error: null,
      });
    }

    return Promise.resolve({
      data: null,
      error: new Error("Unexpected API call"),
    });
  }) as typeof client.request;

  const result = await client.getAllFeatureFlags();

  if (!result.data || result.data.length !== 3) {
    throw new Error(`Expected 3 flags from pagination, got ${JSON.stringify(result.data)}`);
  }

  if (callCount !== 2) {
    throw new Error(`Expected 2 API calls for pagination, got ${callCount}`);
  }

  const expectedKeys = ["flag_page1_1", "flag_page1_2", "flag_page2_1"];
  const actualKeys = result.data.map((f) => f.key);

  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Expected keys ${expectedKeys}, got ${actualKeys}`);
  }

  assertEquals(result.error, null);
});

Deno.test("OptimizelyApiClient: token validation - valid token", async () => {
  setEnv();
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

Deno.test("OptimizelyApiClient: token validation - invalid token", async () => {
  setEnv();
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

Deno.test("OptimizelyApiClient: constructor validates token format", () => {
  try {
    new OptimizelyApiClient("");
    assert(false, "Should have thrown error for empty token");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("token is required"));
  }
});

Deno.test("OptimizelyApiClient: constructor validates token length", () => {
  try {
    new OptimizelyApiClient("short");
    assert(false, "Should have thrown error for short token");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes("too short"));
  }
});

Deno.test("OptimizelyApiClient: archiveFeatureFlag success", async () => {
  setEnv();
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ key: "test-flag", archived: true }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      }),
    );
  const client = new OptimizelyApiClient("test-token");
  const result = await client.archiveFeatureFlag("test-flag");
  assertEquals(result.data, true);
  assertEquals(result.error, null);
});

Deno.test("OptimizelyApiClient: archiveFeatureFlag with invalid flag key", async () => {
  setEnv();
  const client = new OptimizelyApiClient("test-token");
  const result = await client.archiveFeatureFlag("");
  assertEquals(result.data, null);
  assert(result.error instanceof Error);
  assert(result.error.message.includes("Flag key is required"));
});

Deno.test("OptimizelyApiClient: rate limiting behavior", async () => {
  setEnv();
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

globalThis.fetch = originalFetch;
