/**
 * Unit tests for OptimizelyApiClient.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { Result } from "../utils/try-catch.ts";

// Mock dependencies
const originalFetch = globalThis.fetch;
const envVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "pid",
  GITHUB_TOKEN: "gh-token",
  ENVIRONMENT: "test",
  OPERATION: "sync",
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
  const client = new OptimizelyApiClient();
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
  const client = new OptimizelyApiClient();
  const result = await client.request("/fail");
  assert(result.error instanceof Error);
  assertEquals(result.data, null);
  assert(
    String(result.error).includes("Optimizely API error: 401 Unauthorized"),
  );
});

Deno.test("OptimizelyApiClient: invalid path returns error", async () => {
  setEnv();
  const client = new OptimizelyApiClient();
  const result = await client.request("invalid-path");
  assert(result.error instanceof Error);
  assertEquals(result.data, null);
  assert(String(result.error).includes("API path must be a non-empty string"));
});

globalThis.fetch = originalFetch;
