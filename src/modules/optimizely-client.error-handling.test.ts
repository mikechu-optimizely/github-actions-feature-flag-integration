/**
 * Error handling and recovery tests for OptimizelyApiClient.
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

Deno.test("OptimizelyApiClient Error: cleanup environment", () => {
  globalThis.fetch = originalFetch;
});

Deno.test("OptimizelyApiClient Error: request timeout handling", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = (_url: string | Request | URL, options?: RequestInit) => {
      return new Promise((resolve, reject) => {
        if (options?.signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }

        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });

        setTimeout(() => {
          resolve(new Response(JSON.stringify({ data: "test" }), { status: 200 }));
        }, 2000);
      });
    };

    const client = new OptimizelyApiClient("test-token", { timeoutMs: 1500 });
    const result = await client.request("/test");
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assert(result.error.message.includes("timeout") || result.error.message.includes("aborted"));
  });
});

Deno.test("OptimizelyApiClient Error: request handles 403 Forbidden", async () => {
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

Deno.test("OptimizelyApiClient Error: request handles 404 Not Found", async () => {
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

Deno.test("OptimizelyApiClient Error: request handles 429 Rate Limit", async () => {
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

Deno.test("OptimizelyApiClient Error: request handles 500 Server Error", async () => {
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

Deno.test("OptimizelyApiClient Error: request handles network fetch errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Network connection failed"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient Error: request handles fetch throwing non-Error", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject("Non-Error failure");

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
    assertEquals(result.error.message, "Non-Error failure");
  });
});

Deno.test("OptimizelyApiClient Error: request retry mechanism on temporary failures", async () => {
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
    
    assertEquals(result.error, null);
    assert(result.data);
    assertEquals((result.data as { data: string }).data, "success");
    assert(attemptCount >= 3);
  });
});

Deno.test("OptimizelyApiClient Error: request exhausts retries on persistent failures", async () => {
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

Deno.test("OptimizelyApiClient Error: request handles malformed JSON response", async () => {
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

Deno.test("OptimizelyApiClient Error: request handles response.json() parsing errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => {
      const response = new Response("{ invalid json content {", {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
      
      response.json = () => Promise.reject(new Error("JSON parsing failed"));
      
      return Promise.resolve(response);
    };

    const client = new OptimizelyApiClient("test-token");
    const result = await client.request("/test");
    
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient Error: parseErrorResponse handles different error formats", async () => {
  await withTestEnvironment(testEnvVars, async () => {
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

Deno.test("OptimizelyApiClient Error: parseErrorResponse handles simple message format", async () => {
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

Deno.test("OptimizelyApiClient Error: performHealthCheck success", async () => {
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

Deno.test("OptimizelyApiClient Error: performHealthCheck failure", async () => {
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

Deno.test("OptimizelyApiClient Error: performHealthCheck handles failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    globalThis.fetch = () => Promise.reject(new Error("Health check failed"));

    const client = new OptimizelyApiClient("test-token");
    const result = await client.performHealthCheck();
    
    assertEquals(result.data, "UNHEALTHY");
    assertEquals(result.error, null);
  });
});

Deno.test("OptimizelyApiClient Error: enhanced error handling statistics", () => {
  const client = new OptimizelyApiClient("test-token", {
    enableGracefulDegradation: true,
  });
  
  const healthStats = client.getHealthStats();
  assert(typeof healthStats === "object");
  
  const circuitStats = client.getCircuitBreakerStats();
  assert(typeof circuitStats === "object");
  
  const recoveryStats = client.getErrorRecoveryStats();
  assert(typeof recoveryStats === "object");
  assert("circuitBreaker" in recoveryStats);
  assert("health" in recoveryStats);
  assert("fallback" in recoveryStats);
  
  const statusReport = client.getApiStatusReport();
  assert(typeof statusReport === "object");
  assert("timestamp" in statusReport);
  assert("health" in statusReport);
  assert("circuitBreaker" in statusReport);
  assert("api" in statusReport);
});

Deno.test("OptimizelyApiClient Error: reset error handling mechanisms", () => {
  const client = new OptimizelyApiClient("test-token");
  
  client.resetErrorHandling();
  
  client.forceCircuitBreakerOpen();
  
  const dryRunClient = new OptimizelyApiClient("test-token", { dryRun: true });
  assertEquals(dryRunClient.isApiAvailable(), true);
});

Deno.test("OptimizelyApiClient Error: executeWithRecovery success", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    const operation = () => Promise.resolve("operation successful");
    const result = await client.executeWithRecovery("test-operation", operation);
    
    assertEquals(result.error, null);
    assertEquals(result.data, "operation successful");
  });
});

Deno.test("OptimizelyApiClient Error: executeWithRecovery handles operation failures", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    const operation = () => Promise.reject(new Error("Operation failed"));
    const result = await client.executeWithRecovery("failing-operation", operation);
    
    assert(result.error instanceof Error);
    assertEquals(result.data, null);
  });
});

Deno.test("OptimizelyApiClient Error: executeWithRecovery handles unexpected errors", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token");
    
    const operation = () => {
      throw new Error("Recovery manager failure");
    };
    
    const result = await client.executeWithRecovery("test-operation", operation);
    
    assert(result.error instanceof Error);
    assertEquals(result.data, null);
    assert(result.error.message.includes("Recovery manager failure"));
  });
});

Deno.test("OptimizelyApiClient Error: executeWithRecovery method", async () => {
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

Deno.test("OptimizelyApiClient Error: getAllFeatureFlags with error recovery fallback", async () => {
  await withTestEnvironment(testEnvVars, async () => {
    const client = new OptimizelyApiClient("test-token", { enableGracefulDegradation: true });

    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Service Unavailable", { status: 503 }),
      );

    const result = await client.getAllFeatureFlagsWithRecovery();
    assertEquals(result.data, null);
    assert(result.error instanceof Error);
  });
});

Deno.test("OptimizelyApiClient Error: archiveFeatureFlagsWithRecovery", async () => {
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

globalThis.fetch = originalFetch;
