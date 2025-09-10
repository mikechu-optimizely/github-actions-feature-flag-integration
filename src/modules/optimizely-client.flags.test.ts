/**
 * Flag management tests for OptimizelyApiClient.
 */
import { assert, assertEquals } from "@std/assert";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
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

Deno.test("OptimizelyApiClient Flags: cleanup environment", () => {
  globalThis.fetch = originalFetch;
});

Deno.test("OptimizelyApiClient.getAllFeatureFlags returns array of flag objects on success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token", {
      baseUrl: "http://localhost:8080/mock-api",
    });
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
    client.request = (<T = unknown>(
      path: string,
      _init?: RequestInit,
    ): Promise<Result<T, Error>> => {
      callCount++;

      if (callCount === 1 && path.includes("/flags") && !path.includes("page=")) {
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

Deno.test("OptimizelyApiClient Flags: archiveFeatureFlag success", async () => {
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

Deno.test("OptimizelyApiClient Flags: archiveFeatureFlag with invalid flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlag("");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("flag keys must be non-empty strings"));
  });
});

Deno.test("OptimizelyApiClient Flags: archiveFeatureFlags bulk operation", async () => {
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

Deno.test("OptimizelyApiClient Flags: unarchiveFeatureFlag success", async () => {
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

Deno.test("OptimizelyApiClient Flags: unarchiveFeatureFlag with invalid flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.unarchiveFeatureFlag("");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("flag keys must be non-empty strings"));
  });
});

Deno.test("OptimizelyApiClient Flags: unarchiveFeatureFlags bulk operation", async () => {
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

Deno.test("OptimizelyApiClient Flags: getFlagDetails returns detailed flag information", async () => {
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

Deno.test("OptimizelyApiClient Flags: getFlagDetails with invalid flag key", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getFlagDetails("");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("Flag key is required"));
  });
});

// Additional flag validation tests
Deno.test("OptimizelyApiClient Flags: archiveFeatureFlags validates empty flag keys array", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags([]);
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("At least one flag key is required"));
  });
});

Deno.test("OptimizelyApiClient Flags: archiveFeatureFlags validates individual flag key types", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.archiveFeatureFlags(["valid-flag", "", "another-valid-flag"]);
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("All flag keys must be non-empty strings"));
  });
});

Deno.test("OptimizelyApiClient Flags: unarchiveFeatureFlags validates flag keys", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.unarchiveFeatureFlags([]);
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("At least one flag key is required"));
  });
});

Deno.test("OptimizelyApiClient Flags: getAllFeatureFlags handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getAllFeatureFlags();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch feature flags: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

Deno.test("OptimizelyApiClient Flags: getAllFeatureFlags handles pagination edge case with large page count", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    let callCount = 0;
    client.request = (<T = unknown>(
      _path: string,
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
          total_pages: 150,
          total_count: 150,
          page: callCount,
        } as T,
        error: null,
      });
    }) as typeof client.request;

    const result = await client.getAllFeatureFlags();
    
    assertEquals(callCount, 100);
    assertEquals(result.data?.length, 100);
    assert(result.data);
  });
});

globalThis.fetch = originalFetch;
