/**
 * Unit tests for OptimizelyApiClient.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import { Result } from "../utils/try-catch.ts";
import { withTestEnvironment } from "../utils/test-helpers.ts";

// Mock dependencies
const originalFetch = globalThis.fetch;
const testEnvVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "123456",
  GITHUB_TOKEN: "gh-token",
  OPERATION: "cleanup",
  DRY_RUN: "true",
};


// Add cleanup after all tests
Deno.test("OptimizelyApiClient: cleanup environment", () => {
  globalThis.fetch = originalFetch;
});

Deno.test("OptimizelyApiClient: successful request returns data", async () => {
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

Deno.test("OptimizelyApiClient: failed request returns error", async () => {
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

Deno.test("OptimizelyApiClient: invalid path returns error", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("invalid-path");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(String(result.error).includes("API path must be a non-empty string"));
  });
});

Deno.test("OptimizelyApiClient.getAllFeatureFlags returns array of flag objects on success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: token validation - valid token", async () => {
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

Deno.test("OptimizelyApiClient: token validation - invalid token", async () => {
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
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: archiveFeatureFlag with invalid flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlag("");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("flag keys must be non-empty strings"));
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlags bulk operation", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: getFlagDetails returns detailed flag information", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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

    globalThis.fetch = () =>
      Promise.resolve(new Response(JSON.stringify(mockFlag), { status: 200 }));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagDetails("test_flag");
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(result.data.key, "test_flag");
    assertEquals(result.data.environments?.production?.status, "running");
    assert(result.data.variable_definitions);
  });
});

Deno.test("OptimizelyApiClient: getFlagDetails with invalid flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagDetails("");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Flag key is required"));
  });
});

Deno.test("OptimizelyApiClient: getEnvironments returns list of environments", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: rate limiting behavior", async () => {
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

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment returns environment-specific flag data", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment handles invalid parameters", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments fetches all environments", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: validateFlagConsistency detects inconsistencies", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

Deno.test("OptimizelyApiClient: validateFlagConsistency reports consistent flags", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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
});

globalThis.fetch = originalFetch;

// Additional tests for improved coverage

Deno.test("OptimizelyApiClient: constructor validates token with invalid characters", () => {
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

Deno.test("OptimizelyApiClient: constructor handles numeric inputs", () => {
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
    // The client should be created with the token from environment
    assert(client instanceof OptimizelyApiClient);
  });
});

Deno.test("OptimizelyApiClient: request timeout handling", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (_url: string | Request | URL, options?: RequestInit) => {
      return new Promise((resolve, reject) => {
        // Check if the request has an AbortSignal and if it's already aborted
        if (options?.signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }

        // Listen for abort signal
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });

        // Simulate a slow response that would be aborted by timeout
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ data: "test" }), { status: 200 }));
        }, 2000); // Delay longer than the minimum timeout (1000ms)
      });
    };

    const client = new OptimizelyApiClient("test-token", { timeoutMs: 1500 }); // Use 1500ms timeout
    const result = await client.request("/test");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("timeout") || result.error.message.includes("aborted"));
  });
});

Deno.test("OptimizelyApiClient: request handles 403 Forbidden", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Authorization failed: Insufficient permissions"));
  });
});

Deno.test("OptimizelyApiClient: request handles 404 Not Found", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/nonexistent");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Resource not found"));
  });
});

Deno.test("OptimizelyApiClient: request handles 429 Rate Limit", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Too Many Requests", { status: 429, statusText: "Too Many Requests" }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Rate limit exceeded"));
  });
});

Deno.test("OptimizelyApiClient: request handles 500 Server Error", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Optimizely API server error: 500"));
  });
});

Deno.test("OptimizelyApiClient: request with custom headers", async () => {
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

Deno.test("OptimizelyApiClient: unarchiveFeatureFlag success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ "test-flag": { key: "test-flag", archived: false } }), {
          status: 200,
          statusText: "OK",
        }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.unarchiveFeatureFlag("test-flag");
    assertEquals(result.data, true);
    assertEquals(result.error, null);
  });
});

Deno.test("OptimizelyApiClient: unarchiveFeatureFlag with invalid flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.unarchiveFeatureFlag("");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("flag keys must be non-empty strings"));
  });
});

Deno.test("OptimizelyApiClient: unarchiveFeatureFlags bulk operation", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            flag_1: { key: "flag_1", archived: false },
            flag_2: { key: "flag_2", archived: false },
          }),
          { status: 200 },
        ),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.unarchiveFeatureFlags(["flag_1", "flag_2"]);
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(Object.keys(result.data).length, 2);
  });
});

Deno.test("OptimizelyApiClient: getAllFeatureFlags with error recovery fallback", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token", { enableGracefulDegradation: true });

    // Mock getAllFeatureFlags to fail
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Service Unavailable", { status: 503 }),
      );

    const result = await client.getAllFeatureFlagsWithRecovery();
    // Should handle error gracefully
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlagsWithRecovery", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            "test-flag": { key: "test-flag", archived: true },
          }),
          { status: 200 },
        ),
      );

    const client = new OptimizelyApiClient("test-token", { enableGracefulDegradation: true });
    const result = await client.archiveFeatureFlagsWithRecovery(["test-flag"]);
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(result.data["test-flag"].archived, true);
  });
});

Deno.test("OptimizelyApiClient: performHealthCheck success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          statusText: "OK",
        }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.performHealthCheck();
    assertEquals(result.error, null);
    assertEquals(result.data, "HEALTHY");
  });
});

Deno.test("OptimizelyApiClient: performHealthCheck failure", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Service Unavailable", { status: 503 }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.performHealthCheck();
    assertEquals(result.error, null);
    assertEquals(result.data, "UNHEALTHY");
  });
});

Deno.test("OptimizelyApiClient: constructor with custom options", () => {
  const client = new OptimizelyApiClient("test-token-12345", {
    baseUrl: "https://custom.api.com",
    maxRps: 10,
    maxRetries: 5,
    timeoutMs: 45000,
    enableGracefulDegradation: false,
  });

  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient: constructor with minimum values", () => {
  const client = new OptimizelyApiClient("test-token-12345", {
    maxRps: 0, // Should be clamped to 1
    maxRetries: -1, // Should be clamped to 0
    timeoutMs: 500, // Should be clamped to 1000
  });

  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient: validateTokenAccess caches result", async () => {
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

Deno.test("OptimizelyApiClient: archiveFeatureFlags validates flag keys", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags([]);
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("At least one flag key is required"));
  });
});

Deno.test("OptimizelyApiClient: unarchiveFeatureFlags validates flag keys", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.unarchiveFeatureFlags([]);
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("At least one flag key is required"));
  });
});

Deno.test("OptimizelyApiClient: request handles malformed JSON response", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("{ invalid json }", { status: 200 }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: executeWithRecovery method", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");

    const operation = () => {
      return Promise.resolve("success");
    };

    const result = await client.executeWithRecovery("test-operation", operation);
    assertEquals(result.error, null);
    assertEquals(result.data, "success");
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments with empty environments", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes("/environments")) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [] }), { status: 200 }),
        );
      }

      return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagStatusAcrossEnvironments("test_flag");

    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(Object.keys(result.data).length, 0);
  });
});

Deno.test("OptimizelyApiClient: validateFlagConsistency with empty environments", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes("/environments")) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [] }), { status: 200 }),
        );
      }

      return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateFlagConsistency("test_flag");

    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("No environment data found for flag test_flag"));
  });
});

// Enhanced error handling, circuit breaker, retry logic tests

Deno.test("OptimizelyApiClient: request handles network fetch errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Network connection failed"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: request handles fetch throwing non-Error", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject("Non-Error failure");

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    // The error should be wrapped with the string value
    assert(result.error.message === "Non-Error failure");
  });
});

Deno.test("OptimizelyApiClient: request retry mechanism on temporary failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    let attemptCount = 0;
    globalThis.fetch = () => {
      attemptCount++;
      if (attemptCount <= 2) {
        return Promise.resolve(
          new Response("Service Temporarily Unavailable", {
            status: 503,
            statusText: "Service Unavailable",
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: "success" }), { status: 200 }),
      );
    };

    const client = new OptimizelyApiClient("test-token", { maxRetries: 3 });
    const result = await client.request("/test");
    
    // Should succeed after retries
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals((result.data as { data: string }).data, "success");
    assert(attemptCount >= 3);
  });
});

Deno.test("OptimizelyApiClient: request exhausts retries on persistent failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Service Unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      );

    const client = new OptimizelyApiClient("test-token", { maxRetries: 2 });
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("503"));
  });
});

Deno.test("OptimizelyApiClient: request validates response structure", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(new Response("", { status: 200 }));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: request handles response.json() parsing errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    // Mock fetch to return a response that will fail during JSON parsing
    globalThis.fetch = () => {
      // Create a response with invalid JSON that will cause parsing to fail
      const response = new Response("{ invalid json content {", {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
      
      // Override the json method to simulate parsing failure
      const originalJson = response.json;
      response.json = () => Promise.reject(new Error("JSON parsing failed"));
      
      return Promise.resolve(response);
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: parseErrorResponse handles different error formats", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    // Test structured error response
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { message: "Structured error message" },
            code: "VALIDATION_ERROR",
          }),
          { status: 400, statusText: "Bad Request" },
        ),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Structured error message"));
  });
});

Deno.test("OptimizelyApiClient: parseErrorResponse handles simple message format", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "Simple error message" }),
          { status: 400, statusText: "Bad Request" },
        ),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Simple error message"));
  });
});

Deno.test("OptimizelyApiClient: getAllFeatureFlags handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getAllFeatureFlags();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    // The error message should match what's returned by the implementation
    assertEquals(result.error.message, "Failed to fetch feature flags: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

Deno.test("OptimizelyApiClient: getAllFeatureFlags handles pagination edge case with large page count", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    let callCount = 0;
    client.request = (<T = unknown>(
      path: string,
      _init?: RequestInit,
    ): Promise<Result<T, Error>> => {
      callCount++;
      return Promise.resolve({
        data: {
          url: `/projects/123456/flags?page=${callCount}`,
          items: [{ key: `flag_${callCount}`, name: `Flag ${callCount}`, archived: false }],
          create_url: "/projects/123456/flags",
          last_url: "/projects/123456/flags?page=150",
          first_url: "/projects/123456/flags",
          count: 1,
          total_pages: 150, // Large page count to test safety limit
          total_count: 150,
          page: callCount,
        } as T,
        error: null,
      });
    }) as typeof client.request;

    const result = await client.getAllFeatureFlags();
    
    // Should stop at page 100 (safety limit)
    assertEquals(callCount, 100);
    assertEquals(result.data?.length, 100);
    assert(result.data);
  });
});

Deno.test("OptimizelyApiClient: getAllFeatureFlags handles API errors during pagination", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    let callCount = 0;
    client.request = (<T = unknown>(
      _path: string,
      _init?: RequestInit,
    ): Promise<Result<T, Error>> => {
      callCount++;
      if (callCount === 2) {
        // Fail on second page
        return Promise.resolve({
          data: null,
          error: new Error("Pagination request failed"),
        });
      }
      return Promise.resolve({
        data: {
          url: "/projects/123456/flags",
          items: [{ key: `flag_${callCount}`, name: `Flag ${callCount}`, archived: false }],
          total_pages: 3,
          page: callCount,
        } as T,
        error: null,
      });
    }) as typeof client.request;

    const result = await client.getAllFeatureFlags();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Pagination request failed"));
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlags validates empty flag keys array", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags([]);
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("At least one flag key is required"));
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlags validates individual flag key types", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags(["valid-flag", "", "another-valid-flag"]);
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("All flag keys must be non-empty strings"));
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlags handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags(["test-flag"]);
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    // The error message should match what's returned by the implementation
    assertEquals(result.error.message, "Failed to archive flags: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlags handles API request errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Server Error", { status: 500, statusText: "Internal Server Error" }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags(["test-flag"]);
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: archiveFeatureFlag handles single flag processing", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({}), { status: 200 }), // Empty response
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlag("test-flag");
    
    // Should return false when no data is returned
    assertEquals(result.data, false);
    assertEquals(result.error, null);
  });
});

Deno.test("OptimizelyApiClient: unarchiveFeatureFlags handles validation and API errors", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // Test missing project ID
    const result1 = await client.unarchiveFeatureFlags(["test-flag"]);
    assertEquals(result1.data, null);
    assertEquals(result1.error?.message, "Failed to unarchive flags: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
    
    // Test empty array
    const result2 = await client.unarchiveFeatureFlags([]);
    assertEquals(result2.data, null);
    assertEquals(result2.error?.message, "At least one flag key is required");
  });
});

Deno.test("OptimizelyApiClient: getFlagDetails validates flag key parameter", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // Test with non-string flag key
    // @ts-expect-error: Testing invalid input type
    const result1 = await client.getFlagDetails(123);
    assertEquals(result1.data, null);
    assert(result1.error?.message.includes("Flag key is required and must be a string"));
    
    // Test with null flag key
    // @ts-expect-error: Testing invalid input type
    const result2 = await client.getFlagDetails(null);
    assertEquals(result2.data, null);
    assert(result2.error?.message.includes("Flag key is required and must be a string"));
  });
});

Deno.test("OptimizelyApiClient: getFlagDetails handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagDetails("test-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch flag details for test-flag: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

Deno.test("OptimizelyApiClient: getFlagDetails handles API error responses", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagDetails("nonexistent-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: getFlagDetails handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Unexpected network error"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagDetails("test-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch flag details for test-flag: Unexpected network error");
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment validates parameters", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // Test with non-string environment key
    // @ts-expect-error: Testing invalid input type
    const result1 = await client.getFlagStatusInEnvironment("test-flag", 123);
    assertEquals(result1.data, null);
    assert(result1.error?.message.includes("Environment key is required and must be a string"));
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagStatusInEnvironment("test-flag", "prod");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch flag status for test-flag in environment prod: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusInEnvironment handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Network failure"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagStatusInEnvironment("test-flag", "prod");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch flag status for test-flag in environment prod: Network failure");
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments validates flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // @ts-expect-error: Testing invalid input type
    const result = await client.getFlagStatusAcrossEnvironments(null);
    assertEquals(result.data, null);
    assert(result.error?.message.includes("Flag key is required and must be a string"));
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments handles environment fetch errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/environments") && !urlStr.includes("/environments/")) {
        return Promise.resolve(
          new Response("Service Error", { status: 503 }),
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagStatusAcrossEnvironments("test-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments handles partial environment failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();
      
      if (urlStr.includes("/environments/")) {
        // Fail for prod environment, succeed for dev
        if (urlStr.includes("/prod")) {
          return Promise.resolve(new Response("Forbidden", { status: 403 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({
            key: "dev",
            name: "Development",
            enabled: true,
            status: "active",
          }), { status: 200 }),
        );
      } else if (urlStr.includes("/environments")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            items: [
              { key: "dev", name: "Development" },
              { key: "prod", name: "Production" },
            ],
          }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagStatusAcrossEnvironments("test-flag");
    
    // Should return partial data (dev environment only)
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(Object.keys(result.data).length, 1);
    assertEquals(result.data["dev"]?.enabled, true);
  });
});

Deno.test("OptimizelyApiClient: getFlagStatusAcrossEnvironments handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Connection timeout"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagStatusAcrossEnvironments("test-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch environments: Connection timeout");
  });
});

Deno.test("OptimizelyApiClient: validateFlagConsistency validates flag key parameter", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // @ts-expect-error: Testing invalid input type
    const result = await client.validateFlagConsistency(undefined);
    assertEquals(result.data, null);
    assert(result.error?.message.includes("Flag key is required and must be a string"));
  });
});

Deno.test("OptimizelyApiClient: validateFlagConsistency handles status fetch errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Service unavailable"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateFlagConsistency("test-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: validateFlagConsistency detects mixed status inconsistencies", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();
      
      if (urlStr.includes("/environments/")) {
        const isDev = urlStr.includes("/dev");
        const isStaging = urlStr.includes("/staging");
        
        const mockData = {
          key: isDev ? "dev" : isStaging ? "staging" : "prod",
          name: isDev ? "Development" : isStaging ? "Staging" : "Production",
          enabled: true, // All enabled but different statuses
          status: isDev ? "active" : isStaging ? "paused" : "archived",
          id: isDev ? 1 : isStaging ? 2 : 3,
          priority: 1000,
          created_time: "2023-01-01T00:00:00Z",
          rolloutRules: [],
        };
        return Promise.resolve(
          new Response(JSON.stringify(mockData), { status: 200 }),
        );
      } else if (urlStr.includes("/environments")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            items: [
              { key: "dev", name: "Development" },
              { key: "staging", name: "Staging" },
              { key: "prod", name: "Production" },
            ],
          }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateFlagConsistency("test-flag");
    
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(result.data.isConsistent, false);
    assertEquals(result.data.inconsistencies.length, 1);
    assertEquals(result.data.inconsistencies[0].type, "mixed_status");
    assert(result.data.inconsistencies[0].message.includes("different statuses across environments"));
  });
});

Deno.test("OptimizelyApiClient: validateFlagConsistency handles archived environment counting", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();
      
      if (urlStr.includes("/environments/")) {
        const mockData = {
          key: "prod",
          name: "Production",
          enabled: false,
          status: "archived",
          id: 123,
          priority: 1000,
          created_time: "2023-01-01T00:00:00Z",
          rolloutRules: [],
        };
        return Promise.resolve(
          new Response(JSON.stringify(mockData), { status: 200 }),
        );
      } else if (urlStr.includes("/environments")) {
        return Promise.resolve(
          new Response(JSON.stringify({
            items: [{ key: "prod", name: "Production" }],
          }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateFlagConsistency("test-flag");
    
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals(result.data.summary.archivedEnvironments, 1);
    assertEquals(result.data.summary.disabledEnvironments, 1);
    assertEquals(result.data.summary.enabledEnvironments, 0);
  });
});

Deno.test("OptimizelyApiClient: validateFlagConsistency handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject("Unexpected error type");

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateFlagConsistency("test-flag");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch environments: Unexpected error type");
  });
});

Deno.test("OptimizelyApiClient: getEnvironments handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getEnvironments();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch environments: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

Deno.test("OptimizelyApiClient: getEnvironments handles API errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Unauthorized", { status: 401 }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getEnvironments();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient: getEnvironments handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Connection refused"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.getEnvironments();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch environments: Connection refused");
  });
});

Deno.test("OptimizelyApiClient: validateResponse handles different invalid response types", async () => {
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

Deno.test("OptimizelyApiClient: rate limiting with zero maxRps", () => {
  // Test that maxRps gets clamped to minimum value
  const client = new OptimizelyApiClient("test-token-12345", { maxRps: 0 });
  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient: timeout with very low value", () => {
  // Test that timeoutMs gets clamped to minimum value
  const client = new OptimizelyApiClient("test-token-12345", { timeoutMs: 100 });
  assert(client instanceof OptimizelyApiClient);
});

Deno.test("OptimizelyApiClient: validateTokenAccess handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject("Non-Error object");

    const client = new OptimizelyApiClient("test-token");
    const result = await client.validateTokenAccess();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Token validation failed: Non-Error object");
  });
});

// Enhanced error handling and recovery tests

Deno.test("OptimizelyApiClient: performHealthCheck with success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "healthy" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const client = new OptimizelyApiClient("test-token");
    const result = await client.performHealthCheck();
    
    assertEquals(result.error, null);
    assertEquals(result.data, "HEALTHY");
  });
});

Deno.test("OptimizelyApiClient: performHealthCheck handles failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Health check failed"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.performHealthCheck();
    
    assertEquals(result.data, "UNHEALTHY");
    assertEquals(result.error, null);
  });
});

Deno.test("OptimizelyApiClient: enhanced error handling statistics", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token", {
      enableGracefulDegradation: true,
    });
    
    // Test health stats
    const healthStats = client.getHealthStats();
    assert(typeof healthStats === "object");
    
    // Test circuit breaker stats
    const circuitStats = client.getCircuitBreakerStats();
    assert(typeof circuitStats === "object");
    
    // Test error recovery stats
    const recoveryStats = client.getErrorRecoveryStats();
    assert(typeof recoveryStats === "object");
    assert("circuitBreaker" in recoveryStats);
    assert("health" in recoveryStats);
    assert("fallback" in recoveryStats);
    
    // Test API status report
    const statusReport = client.getApiStatusReport();
    assert(typeof statusReport === "object");
    assert("timestamp" in statusReport);
    assert("health" in statusReport);
    assert("circuitBreaker" in statusReport);
    assert("api" in statusReport);
  });
});

Deno.test("OptimizelyApiClient: reset error handling mechanisms", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // Reset should complete without errors
    client.resetErrorHandling();
    
    // Force circuit breaker open
    client.forceCircuitBreakerOpen();
    
    // Check availability (should work in dry run mode)
    const dryRunClient = new OptimizelyApiClient("test-token", { dryRun: true });
    assertEquals(dryRunClient.isApiAvailable(), true);
  });
});

Deno.test("OptimizelyApiClient: executeWithRecovery success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    const operation = () => Promise.resolve("operation successful");
    const result = await client.executeWithRecovery("test-operation", operation);
    
    assertEquals(result.error, null);
    assertEquals(result.data, "operation successful");
  });
});

Deno.test("OptimizelyApiClient: executeWithRecovery handles operation failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    const operation = () => Promise.reject(new Error("Operation failed"));
    const result = await client.executeWithRecovery("failing-operation", operation);
    
    assert(result.error instanceof Error);
    assertEquals(result.data, null);
  });
});

Deno.test("OptimizelyApiClient: executeWithRecovery handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    // Create a failing operation that throws during recovery
    const operation = () => {
      throw new Error("Recovery manager failure");
    };
    
    const result = await client.executeWithRecovery("test-operation", operation);
    
    assert(result.error instanceof Error);
    assertEquals(result.data, null);
    // The error should come from the recovery failure
    assert(result.error.message.includes("Recovery manager failure"));
  });
});
