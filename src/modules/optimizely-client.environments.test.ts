/**
 * Environment-related tests for OptimizelyApiClient.
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

Deno.test("OptimizelyApiClient Env: cleanup environment", () => {
  globalThis.fetch = originalFetch;
});

Deno.test("OptimizelyApiClient Env: getEnvironments returns list of environments", async () => {
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

Deno.test("OptimizelyApiClient Env: getFlagStatusInEnvironment returns environment-specific flag data", async () => {
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

Deno.test("OptimizelyApiClient Env: getFlagStatusInEnvironment handles invalid parameters", async () => {
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

Deno.test("OptimizelyApiClient Env: getFlagStatusAcrossEnvironments fetches all environments", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    let callCount = 0;
    globalThis.fetch = (url: string | URL | Request) => {
      callCount++;
      const urlStr = url.toString();

      if (urlStr.includes("/environments/")) {
        const isProduction = urlStr.includes("/prod");
        const mockData = {
          key: isProduction ? "prod" : "dev",
          name: isProduction ? "Production" : "Development",
          enabled: isProduction ? true : false,
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

Deno.test("OptimizelyApiClient Env: validateFlagConsistency detects inconsistencies", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes("/environments/")) {
        const isProduction = urlStr.includes("/prod");
        const mockData = {
          key: isProduction ? "prod" : "dev",
          name: isProduction ? "Production" : "Development",
          enabled: isProduction ? true : false,
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

Deno.test("OptimizelyApiClient Env: validateFlagConsistency reports consistent flags", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes("/environments/")) {
        const isProduction = urlStr.includes("/prod");
        const mockData = {
          key: isProduction ? "prod" : "dev",
          name: isProduction ? "Production" : "Development",
          enabled: true,
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
    assertEquals(result.data.isConsistent, true);
    assertEquals(result.data.inconsistencies.length, 0);
    assertEquals(result.data.summary.totalEnvironments, 2);
    assertEquals(result.data.summary.enabledEnvironments, 2);
    assertEquals(result.data.summary.disabledEnvironments, 0);
  });
});

Deno.test("OptimizelyApiClient Env: getFlagStatusAcrossEnvironments with empty environments", async () => {
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

Deno.test("OptimizelyApiClient Env: validateFlagConsistency with empty environments", async () => {
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

Deno.test("OptimizelyApiClient Env: getEnvironments handles missing project ID", async () => {
  await withTestEnvironment({ ...testEnvVars, OPTIMIZELY_PROJECT_ID: "" }, async () => {
    const client = new OptimizelyApiClient("test-token");
    const result = await client.getEnvironments();
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Failed to fetch environments: Missing required environment variables: OPTIMIZELY_PROJECT_ID. Please ensure these are set in your environment or GitHub secrets.");
  });
});

globalThis.fetch = originalFetch;
