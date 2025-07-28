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
        url: "/projects/123456/flags",
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
        create_url: "/projects/123456/flags",
        last_url: "/projects/123456/flags",
        first_url: "/projects/123456/flags",
        count: 2,
        total_pages: 1,
        total_count: 2,
        page: 1,
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

    if (callCount === 1 && path.includes("/flags") && !path.includes("page=")) {
      // First page
      return Promise.resolve({
        data: {
          url: "/projects/123456/flags",
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
          create_url: "/projects/123456/flags",
          last_url: "/projects/123456/flags?page=2",
          first_url: "/projects/123456/flags",
          count: 2,
          total_pages: 2,
          total_count: 3,
          page: 1,
        } as T,
        error: null,
      });
    } else if (callCount === 2 && path.includes("page=2")) {
      // Second page
      return Promise.resolve({
        data: {
          url: "/projects/123456/flags?page=2",
          items: [
            {
              key: "flag_page2_1",
              name: "Flag Page 2-1",
              url: "/flags/flag_page2_1",
              archived: false,
            },
          ],
          create_url: "/projects/123456/flags",
          last_url: "/projects/123456/flags?page=2",
          first_url: "/projects/123456/flags",
          count: 1,
          total_pages: 2,
          total_count: 3,
          page: 2,
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
      new Response(JSON.stringify({ "test-flag": { key: "test-flag", archived: true } }), {
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
  assert(result.error.message.includes("flag keys must be non-empty strings"));
});

Deno.test("OptimizelyApiClient: archiveFeatureFlags bulk operation", async () => {
  setEnv();
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          flag_1: { key: "flag_1", archived: true },
          flag_2: { key: "flag_2", archived: true },
        }),
        { status: 200 },
      ),
    );

  const client = new OptimizelyApiClient("test-token");
  const result = await client.archiveFeatureFlags(["flag_1", "flag_2"]);
  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(Object.keys(result.data).length, 2);
});

Deno.test("OptimizelyApiClient: getFlagDetails returns detailed flag information", async () => {
  setEnv();
  const mockFlag = {
    key: "test_flag",
    name: "Test Flag",
    description: "A test flag",
    url: "/projects/123456/flags/test_flag",
    id: 415337,
    urn: "flags.flags.optimizely.com::415337",
    project_id: 4678434014625792,
    account_id: 21468570738,
    created_by_user_id: "test@optimizely.com",
    created_by_user_email: "test@optimizely.com",
    role: "admin",
    created_time: "2025-05-08T16:31:57.402712Z",
    updated_time: "2025-05-12T20:23:40.825440Z",
    revision: 4,
    archived: false,
    outlier_filtering_enabled: false,
    variable_definitions: {
      enabled: {
        key: "enabled",
        description: "Feature enabled",
        type: "boolean",
        default_value: "false",
        created_time: "2025-05-08T16:44:36.100744Z",
        updated_time: "2025-05-08T16:44:36.100749Z",
      },
    },
    environments: {
      production: {
        key: "production",
        name: "Production",
        enabled: true,
        id: 101746715916459,
        has_restricted_permissions: true,
        priority: 1,
        status: "running",
        rules_summary: {},
        rules_detail: [],
        created_time: "2025-05-08T14:51:56.000000Z",
      },
    },
  };

  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify(mockFlag), { status: 200 }));

  const client = new OptimizelyApiClient("test-token");
  const result = await client.getFlagDetails("test_flag");
  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.key, "test_flag");
  assertEquals(result.data.environments?.production?.status, "running");
  assert(result.data.variable_definitions);
});

Deno.test("OptimizelyApiClient: getFlagDetails with invalid flag key", async () => {
  setEnv();
  const client = new OptimizelyApiClient("test-token");
  const result = await client.getFlagDetails("");
  assertEquals(result.data, null);
  assert(result.error instanceof Error);
  assert(result.error.message.includes("Flag key is required"));
});

Deno.test("OptimizelyApiClient: getEnvironments returns list of environments", async () => {
  setEnv();
  const mockEnvironments = {
    url: "/projects/4678434014625792/environments",
    items: [
      {
        key: "production",
        name: "Production",
        archived: false,
        priority: 1,
        account_id: 21468570738,
        project_id: 4678434014625792,
        role: "admin",
        id: 101746715916459,
        has_restricted_permissions: true,
      },
      {
        key: "development",
        name: "Development",
        archived: false,
        priority: 2,
        account_id: 21468570738,
        project_id: 4678434014625792,
        role: "admin",
        id: 361746715916479,
        has_restricted_permissions: false,
      },
    ],
    page: 1,
    last_url: "/projects/4678434014625792/environments",
    total_count: 2,
    total_pages: 1,
    first_url: "/projects/4678434014625792/environments",
    count: 2,
  };

  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify(mockEnvironments), { status: 200 }));

  const client = new OptimizelyApiClient("test-token");
  const result = await client.getEnvironments();
  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.length, 2);
  assertEquals(result.data[0].key, "production");
  assertEquals(result.data[0].has_restricted_permissions, true);
  assertEquals(result.data[1].key, "development");
  assertEquals(result.data[1].has_restricted_permissions, false);
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

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment returns environment-specific flag data", async () => {
  setEnv();
  const mockEnvironmentData = {
    key: "production",
    name: "Production",
    enabled: true,
    status: "active",
    id: 12345,
    has_restricted_permissions: false,
    priority: 1000,
    created_time: "2023-01-01T00:00:00Z",
    rolloutRules: [],
  };

  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(mockEnvironmentData), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      }),
    );

  const client = new OptimizelyApiClient("test-token");
  const result = await client.getFlagStatusInEnvironment("test_flag", "production");

  assertEquals(result.error, null);
  assertEquals(result.data?.key, "production");
  assertEquals(result.data?.enabled, true);
  assertEquals(result.data?.status, "active");
});

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment handles invalid parameters", async () => {
  setEnv();
  const client = new OptimizelyApiClient("test-token");

  // Test empty flag key
  const result1 = await client.getFlagStatusInEnvironment("", "production");
  assertEquals(result1.data, null);
  assert(result1.error?.message.includes("Flag key is required"));

  // Test empty environment key
  const result2 = await client.getFlagStatusInEnvironment("test_flag", "");
  assertEquals(result2.data, null);
  assert(result2.error?.message.includes("Environment key is required"));
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments fetches all environments", async () => {
  setEnv();

  let callCount = 0;
  globalThis.fetch = (url: string | URL | Request) => {
    callCount++;
    const urlStr = url.toString();

    if (urlStr.includes("/environments/")) {
      // Mock environment-specific flag data (this must come first!)
      const isProduction = urlStr.includes("/prod");
      const mockData = {
        key: isProduction ? "prod" : "dev",
        name: isProduction ? "Production" : "Development",
        enabled: isProduction ? true : false, // Explicit values for testing
        status: "active",
        id: isProduction ? 12345 : 12346,
        has_restricted_permissions: false,
        priority: 1000,
        created_time: "2023-01-01T00:00:00Z",
      };
      return Promise.resolve(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );
    } else if (urlStr.includes("/environments")) {
      // Mock environments list
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              { key: "dev", name: "Development" },
              { key: "prod", name: "Production" },
            ],
          }),
          { status: 200 },
        ),
      );
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  const client = new OptimizelyApiClient("test-token");
  const result = await client.getFlagStatusAcrossEnvironments("test_flag");

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(Object.keys(result.data).length, 2);
  assertEquals(result.data["dev"]?.enabled, false);
  assertEquals(result.data["prod"]?.enabled, true);
});

Deno.test("OptimizelyApiClient: validateFlagConsistency detects inconsistencies", async () => {
  setEnv();

  globalThis.fetch = (url: string | URL | Request) => {
    const urlStr = url.toString();

    if (urlStr.includes("/environments/")) {
      const isProduction = urlStr.includes("/prod");
      const mockData = {
        key: isProduction ? "prod" : "dev",
        name: isProduction ? "Production" : "Development",
        enabled: isProduction ? true : false, // Different enabled status for inconsistency test
        status: "active",
        id: isProduction ? 12345 : 12346,
        has_restricted_permissions: false,
        priority: 1000,
        created_time: "2023-01-01T00:00:00Z",
        rolloutRules: [],
      };
      return Promise.resolve(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );
    } else if (urlStr.includes("/environments")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              { key: "dev", name: "Development" },
              { key: "prod", name: "Production" },
            ],
          }),
          { status: 200 },
        ),
      );
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  const client = new OptimizelyApiClient("test-token");
  const result = await client.validateFlagConsistency("test_flag");

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.isConsistent, false);
  assertEquals(result.data.inconsistencies.length, 1);
  assertEquals(result.data.inconsistencies[0].type, "mixed_enabled_status");
});

Deno.test("OptimizelyApiClient: validateFlagConsistency reports consistent flags", async () => {
  setEnv();

  globalThis.fetch = (url: string | URL | Request) => {
    const urlStr = url.toString();

    if (urlStr.includes("/environments/")) {
      const isProduction = urlStr.includes("/prod");
      const mockData = {
        key: isProduction ? "prod" : "dev",
        name: isProduction ? "Production" : "Development",
        enabled: true, // Same enabled status for consistency test
        status: "active", // Same status
        id: isProduction ? 12345 : 12346,
        has_restricted_permissions: false,
        priority: 1000,
        created_time: "2023-01-01T00:00:00Z",
        rolloutRules: [],
      };
      return Promise.resolve(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );
    } else if (urlStr.includes("/environments")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              { key: "dev", name: "Development" },
              { key: "prod", name: "Production" },
            ],
          }),
          { status: 200 },
        ),
      );
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  const client = new OptimizelyApiClient("test-token");
  const result = await client.validateFlagConsistency("test_flag");

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.isConsistent, true);
  assertEquals(result.data.inconsistencies.length, 0);
  assertEquals(result.data.summary.totalEnvironments, 2);
  assertEquals(result.data.summary.enabledEnvironments, 2);
  assertEquals(result.data.summary.disabledEnvironments, 0);
});

globalThis.fetch = originalFetch;
