import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ApiHealthMonitor, HealthStatus, createHttpHealthCheck } from "./api-health-monitor.ts";

Deno.test("ApiHealthMonitor - Initial state should be UNKNOWN", () => {
  const monitor = new ApiHealthMonitor("test-api");
  const stats = monitor.getHealthStats();
  assertEquals(stats.currentStatus, HealthStatus.UNKNOWN);
  assertEquals(stats.totalChecks, 0);
  assertEquals(monitor.isHealthy(), false);
  assertEquals(monitor.isAvailable(), false);
});

Deno.test("ApiHealthMonitor - Should record successful health check", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    minChecksForStats: 1,
    degradedThresholdMs: 100,
    unhealthyThresholdMs: 200,
  });

  const healthyOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return "success";
  };

  const result = await monitor.performHealthCheck(healthyOperation);
  
  assertEquals(result.status, HealthStatus.HEALTHY);
  assertEquals(result.error, null);
  assert(result.responseTimeMs >= 50);
  assert(result.responseTimeMs < 100);

  const stats = monitor.getHealthStats();
  assertEquals(stats.currentStatus, HealthStatus.HEALTHY);
  assertEquals(stats.totalChecks, 1);
  assertEquals(stats.successfulChecks, 1);
  assertEquals(stats.failedChecks, 0);
  assertEquals(monitor.isHealthy(), true);
  assertEquals(monitor.isAvailable(), true);
});

Deno.test("ApiHealthMonitor - Should record failed health check", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    minChecksForStats: 1,
    unhealthySuccessRate: 0.5,
  });

  const failingOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    throw new Error("Service unavailable");
  };

  const result = await monitor.performHealthCheck(failingOperation);
  
  assertEquals(result.status, HealthStatus.UNHEALTHY);
  assertEquals(result.error, "Service unavailable");
  assert(result.responseTimeMs >= 50);

  const stats = monitor.getHealthStats();
  assertEquals(stats.currentStatus, HealthStatus.UNHEALTHY);
  assertEquals(stats.totalChecks, 1);
  assertEquals(stats.successfulChecks, 0);
  assertEquals(stats.failedChecks, 1);
  assertEquals(monitor.isHealthy(), false);
  assertEquals(monitor.isAvailable(), false);
});

Deno.test("ApiHealthMonitor - Should determine DEGRADED status from slow response", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    minChecksForStats: 1,
    degradedThresholdMs: 100,
    unhealthyThresholdMs: 200,
  });

  const slowOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    return "success";
  };

  const result = await monitor.performHealthCheck(slowOperation);
  
  assertEquals(result.status, HealthStatus.DEGRADED);
  assertEquals(result.error, null);
  assert(result.responseTimeMs >= 150);

  const stats = monitor.getHealthStats();
  assertEquals(stats.currentStatus, HealthStatus.DEGRADED);
  assertEquals(monitor.isHealthy(), false);
  assertEquals(monitor.isAvailable(), true); // Degraded is still available
});

Deno.test("ApiHealthMonitor - Should determine UNHEALTHY status from very slow response", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    minChecksForStats: 1,
    degradedThresholdMs: 100,
    unhealthyThresholdMs: 200,
  });

  const verySlowOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 250));
    return "success";
  };

  const result = await monitor.performHealthCheck(verySlowOperation);
  
  assertEquals(result.status, HealthStatus.UNHEALTHY);
  assertEquals(result.error, null);
  assert(result.responseTimeMs >= 250);

  const stats = monitor.getHealthStats();
  assertEquals(stats.currentStatus, HealthStatus.UNHEALTHY);
  assertEquals(monitor.isHealthy(), false);
  assertEquals(monitor.isAvailable(), false);
});

Deno.test("ApiHealthMonitor - Should calculate average response time", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    minChecksForStats: 1,
    degradedThresholdMs: 1000,
    unhealthyThresholdMs: 2000,
  });

  const fastOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return "success";
  };

  const slowOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    return "success";
  };

  await monitor.performHealthCheck(fastOperation);
  await monitor.performHealthCheck(slowOperation);

  const stats = monitor.getHealthStats();
  assert(stats.averageResponseTimeMs >= 100); // Should be around 100ms average
  assert(stats.averageResponseTimeMs <= 150);
});

Deno.test("ApiHealthMonitor - Should track uptime percentage", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    minChecksForStats: 1,
  });

  const successOperation = async () => "success";
  const failOperation = async () => {
    throw new Error("Failed");
  };

  await monitor.performHealthCheck(successOperation);
  await monitor.performHealthCheck(successOperation);
  await monitor.performHealthCheck(failOperation);

  const stats = monitor.getHealthStats();
  assertEquals(stats.totalChecks, 3);
  assertEquals(stats.successfulChecks, 2);
  assertEquals(stats.failedChecks, 1);
  assertEquals(Math.round(stats.uptime), 67); // 2/3 * 100 = 66.67%
});

Deno.test("ApiHealthMonitor - Should maintain recent checks window", async () => {
  const monitor = new ApiHealthMonitor("test-api", {
    windowSize: 3,
  });

  const operation = async () => "success";

  // Add 5 checks, should only keep last 3
  for (let i = 0; i < 5; i++) {
    await monitor.performHealthCheck(operation);
  }

  const recentChecks = monitor.getRecentChecks();
  assertEquals(recentChecks.length, 3);
});

Deno.test("ApiHealthMonitor - Should reset statistics", async () => {
  const monitor = new ApiHealthMonitor("test-api");

  const operation = async () => "success";
  await monitor.performHealthCheck(operation);

  let stats = monitor.getHealthStats();
  assertEquals(stats.totalChecks, 1);

  monitor.reset();
  
  stats = monitor.getHealthStats();
  assertEquals(stats.totalChecks, 0);
  assertEquals(stats.currentStatus, HealthStatus.UNKNOWN);
});

Deno.test("createHttpHealthCheck - Should create working health check function", async () => {
  // This test would require a real HTTP endpoint, so we'll just test the function creation
  const healthCheck = createHttpHealthCheck("https://api.example.com/health");
  
  // Verify it's a function
  assertEquals(typeof healthCheck, "function");
  
  // We can't actually call it without a real endpoint, but we can verify the structure
  assert(healthCheck.constructor.name === "AsyncFunction");
});
