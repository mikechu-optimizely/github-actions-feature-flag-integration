/**
 * Unit tests for OptimizelyApiClient.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { OptimizelyApiClient, OptimizelyFlag } from "./optimizely-client.ts";
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
    String(result.error).includes("Optimizely API error: 401 Unauthorized"),
  );
});

Deno.test("OptimizelyApiClient: invalid path returns error", async () => {
  setEnv();
  const client = new OptimizelyApiClient("test-token");
  let errorCaught = false;
  try {
    await client.request("invalid-path");
  } catch (err) {
    errorCaught = true;
    assert(String(err).includes("API path must be a non-empty string"));
  }
  if (!errorCaught) {
    throw new Error("Expected error to be thrown for invalid path");
  }
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
      `Expected error to be null, got ${
        (result as Result<OptimizelyFlag[], Error>).error
      }`,
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

globalThis.fetch = originalFetch;
