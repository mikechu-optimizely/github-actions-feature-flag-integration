import { assertEquals } from "@std/assert";
import {
  ApiFallbackManager,
  createDefaultFallbackConfig,
  createFeatureFlagFallbackConfig,
  type FallbackConfig,
  FallbackStrategy,
} from "./api-fallback.ts";

interface TestData {
  message: string;
}

Deno.test("ApiFallbackManager - constructor", () => {
  const manager = new ApiFallbackManager("test-manager");
  assertEquals(manager instanceof ApiFallbackManager, true);
});

Deno.test("ApiFallbackManager - executeWithFallback - successful primary operation", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const testData = { message: "success" };

  const primaryOperation = () => Promise.resolve(testData);
  const config: FallbackConfig<typeof testData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  };

  const result = await manager.executeWithFallback("test-key", primaryOperation, config);

  assertEquals(result.data, testData);
  assertEquals(result.fallbackUsed, false);
  assertEquals(result.source, "primary");
  assertEquals(result.error, null);
});

Deno.test("ApiFallbackManager - executeWithFallback - primary fails, use cached data", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const cachedData = { message: "cached" };

  // First, populate cache with successful operation
  const successfulOperation = () => Promise.resolve(cachedData);
  const config: FallbackConfig<typeof cachedData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  };

  await manager.executeWithFallback("test-key", successfulOperation, config);

  // Now test with failing primary operation
  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, cachedData);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.CACHED_DATA);
  assertEquals(result.source, "cache-primary");
  assertEquals(result.error, null);
});

Deno.test("ApiFallbackManager - executeWithFallback - use custom cached data provider", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const customCachedData = { message: "custom cache" };

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof customCachedData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
    getCachedData: () => Promise.resolve(customCachedData),
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, customCachedData);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.CACHED_DATA);
  assertEquals(result.source, "custom-cache");
});

Deno.test("ApiFallbackManager - executeWithFallback - use default values fallback", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const defaultData = { message: "default" };

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof defaultData> = {
    primaryStrategy: FallbackStrategy.DEFAULT_VALUES,
    getDefaultValues: () => Promise.resolve(defaultData),
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, defaultData);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.DEFAULT_VALUES);
  assertEquals(result.source, "default-values");
});

Deno.test("ApiFallbackManager - executeWithFallback - use offline mode fallback", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const offlineData = { message: "offline" };

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof offlineData> = {
    primaryStrategy: FallbackStrategy.OFFLINE_MODE,
    getOfflineData: () => Promise.resolve(offlineData),
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, offlineData);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.OFFLINE_MODE);
  assertEquals(result.source, "offline");
});

Deno.test("ApiFallbackManager - executeWithFallback - use degraded functionality", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const degradedData = { message: "degraded" };

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof degradedData> = {
    primaryStrategy: FallbackStrategy.DEGRADED_FUNCTIONALITY,
    enableGracefulDegradation: true,
    getOfflineData: () => Promise.resolve(degradedData),
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, degradedData);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.DEGRADED_FUNCTIONALITY);
  assertEquals(result.source, "degraded");
});

Deno.test("ApiFallbackManager - executeWithFallback - fail fast strategy", async () => {
  const manager = new ApiFallbackManager("test-manager");

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<TestData> = {
    primaryStrategy: FallbackStrategy.FAIL_FAST,
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, null);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.FAIL_FAST);
  assertEquals(result.source, "none");
  assertEquals(result.error?.message, "Primary operation failed");
});

Deno.test("ApiFallbackManager - executeWithFallback - multiple fallback strategies", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const defaultData = { message: "default" };

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof defaultData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA, // Will fail - no cache
    fallbackStrategies: [FallbackStrategy.DEFAULT_VALUES],
    getDefaultValues: () => Promise.resolve(defaultData),
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, defaultData);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.DEFAULT_VALUES);
  assertEquals(result.source, "default-values");
});

Deno.test("ApiFallbackManager - executeWithFallback - all strategies fail", async () => {
  const manager = new ApiFallbackManager("test-manager");

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<TestData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA, // No cache available
    fallbackStrategies: [FallbackStrategy.DEFAULT_VALUES], // No provider
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(result.data, null);
  assertEquals(result.fallbackUsed, true);
  assertEquals(result.strategy, FallbackStrategy.FAIL_FAST);
  assertEquals(result.source, "none");
  assertEquals(result.error?.message, "Primary operation failed");
});

Deno.test("ApiFallbackManager - cache age validation", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const cachedData = { message: "cached" };

  // First, populate cache
  await manager.executeWithFallback("test-key", () => Promise.resolve(cachedData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  // Wait a small amount to simulate age
  await new Promise((resolve) => setTimeout(resolve, 10));

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof cachedData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
    maxCacheAgeMs: 5, // Very short age
    enableGracefulDegradation: true, // Allow stale data
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  // Should still get cached data due to graceful degradation
  assertEquals(result.data, cachedData);
  assertEquals(result.fallbackUsed, true);
});

Deno.test("ApiFallbackManager - cache age validation without graceful degradation", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const cachedData = { message: "cached" };

  // First, populate cache
  await manager.executeWithFallback("test-key", () => Promise.resolve(cachedData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  // Wait to simulate age
  await new Promise((resolve) => setTimeout(resolve, 10));

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<typeof cachedData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
    maxCacheAgeMs: 5, // Very short age
    enableGracefulDegradation: false, // Don't allow stale data
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);

  // Should fail because cache is stale and degradation is disabled
  assertEquals(result.data, null);
  assertEquals(result.strategy, FallbackStrategy.FAIL_FAST);
});

Deno.test("ApiFallbackManager - onFallbackError callback", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const errors: Array<{ error: Error; strategy: FallbackStrategy }> = [];

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const config: FallbackConfig<TestData> = {
    primaryStrategy: FallbackStrategy.CACHED_DATA, // Will fail
    onFallbackError: (error, strategy) => {
      errors.push({ error, strategy });
    },
  };

  await manager.executeWithFallback("test-key", failingOperation, config);

  assertEquals(errors.length, 1);
  assertEquals(errors[0].strategy, FallbackStrategy.CACHED_DATA);
  assertEquals(errors[0].error.message, "No cached data available");
});

Deno.test("ApiFallbackManager - error handling for missing providers", async () => {
  const manager = new ApiFallbackManager("test-manager");

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  // Test DEFAULT_VALUES without provider
  const defaultConfig: FallbackConfig<TestData> = {
    primaryStrategy: FallbackStrategy.DEFAULT_VALUES,
  };

  const defaultResult = await manager.executeWithFallback(
    "test-key",
    failingOperation,
    defaultConfig,
  );
  assertEquals(defaultResult.data, null);

  // Test OFFLINE_MODE without provider
  const offlineConfig: FallbackConfig<TestData> = {
    primaryStrategy: FallbackStrategy.OFFLINE_MODE,
  };

  const offlineResult = await manager.executeWithFallback(
    "test-key",
    failingOperation,
    offlineConfig,
  );
  assertEquals(offlineResult.data, null);

  // Test DEGRADED_FUNCTIONALITY without enableGracefulDegradation
  const degradedConfig: FallbackConfig<TestData> = {
    primaryStrategy: FallbackStrategy.DEGRADED_FUNCTIONALITY,
    enableGracefulDegradation: false,
  };

  const degradedResult = await manager.executeWithFallback(
    "test-key",
    failingOperation,
    degradedConfig,
  );
  assertEquals(degradedResult.data, null);
});

Deno.test("ApiFallbackManager - unknown strategy error", async () => {
  const manager = new ApiFallbackManager("test-manager");

  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  // Use an invalid strategy (cast to bypass TypeScript)
  const config: FallbackConfig<TestData> = {
    primaryStrategy: "UNKNOWN_STRATEGY" as FallbackStrategy,
  };

  const result = await manager.executeWithFallback("test-key", failingOperation, config);
  assertEquals(result.data, null);
  assertEquals(result.strategy, FallbackStrategy.FAIL_FAST);
});

Deno.test("ApiFallbackManager - clearCacheEntry", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const testData = { message: "test" };

  // Populate cache
  await manager.executeWithFallback("test-key", () => Promise.resolve(testData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  // Clear specific entry
  manager.clearCacheEntry("test-key");

  // Try to use cache - should fail
  const failingOperation = () => Promise.reject(new Error("Primary operation failed"));

  const result = await manager.executeWithFallback("test-key", failingOperation, {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  assertEquals(result.data, null);
});

Deno.test("ApiFallbackManager - clearCacheEntry for non-existent key", () => {
  const manager = new ApiFallbackManager("test-manager");

  // Should not throw error
  manager.clearCacheEntry("non-existent-key");
});

Deno.test("ApiFallbackManager - clearAllCache", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const testData = { message: "test" };

  // Populate cache with multiple entries
  await manager.executeWithFallback("key1", () => Promise.resolve(testData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });
  await manager.executeWithFallback("key2", () => Promise.resolve(testData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  // Clear all cache
  manager.clearAllCache();

  // Verify cache is empty
  const stats = manager.getCacheStats();
  assertEquals(stats.totalEntries, 0);
});

Deno.test("ApiFallbackManager - getCacheStats with empty cache", () => {
  const manager = new ApiFallbackManager("test-manager");

  const stats = manager.getCacheStats();

  assertEquals(stats.totalEntries, 0);
  assertEquals(stats.oldestEntryAge, null);
  assertEquals(stats.newestEntryAge, null);
});

Deno.test("ApiFallbackManager - getCacheStats with entries", async () => {
  const manager = new ApiFallbackManager("test-manager");
  const testData = { message: "test" };

  // Add some cache entries
  await manager.executeWithFallback("key1", () => Promise.resolve(testData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  // Small delay
  await new Promise((resolve) => setTimeout(resolve, 10));

  await manager.executeWithFallback("key2", () => Promise.resolve(testData), {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
  });

  const stats = manager.getCacheStats();

  assertEquals(stats.totalEntries, 2);
  assertEquals(typeof stats.oldestEntryAge, "number");
  assertEquals(typeof stats.newestEntryAge, "number");
  assertEquals(stats.oldestEntryAge! >= stats.newestEntryAge!, true);
});

Deno.test("createDefaultFallbackConfig - with defaults", () => {
  const config = createDefaultFallbackConfig();

  assertEquals(config.primaryStrategy, FallbackStrategy.CACHED_DATA);
  assertEquals(config.fallbackStrategies, [
    FallbackStrategy.DEFAULT_VALUES,
    FallbackStrategy.OFFLINE_MODE,
  ]);
  assertEquals(config.maxCacheAgeMs, 300000);
  assertEquals(config.enableGracefulDegradation, true);
});

Deno.test("createDefaultFallbackConfig - with custom options", () => {
  const customConfig = createDefaultFallbackConfig({
    primaryStrategy: FallbackStrategy.DEFAULT_VALUES,
    maxCacheAgeMs: 60000,
    enableGracefulDegradation: false,
  });

  assertEquals(customConfig.primaryStrategy, FallbackStrategy.DEFAULT_VALUES);
  assertEquals(customConfig.maxCacheAgeMs, 60000);
  assertEquals(customConfig.enableGracefulDegradation, false);
  // Should keep default fallback strategies
  assertEquals(customConfig.fallbackStrategies, [
    FallbackStrategy.DEFAULT_VALUES,
    FallbackStrategy.OFFLINE_MODE,
  ]);
});

Deno.test("createFeatureFlagFallbackConfig - with default flags", async () => {
  const defaultFlags = { feature1: true, feature2: false };
  const config = createFeatureFlagFallbackConfig(defaultFlags);

  assertEquals(config.primaryStrategy, FallbackStrategy.CACHED_DATA);
  assertEquals(config.enableGracefulDegradation, true);

  // Test default values provider
  const defaultValues = await config.getDefaultValues!();
  assertEquals(defaultValues, defaultFlags);

  // Test offline data provider (should disable all flags)
  const offlineData = await config.getOfflineData!();
  assertEquals(offlineData, { feature1: false, feature2: false });
});

Deno.test("createFeatureFlagFallbackConfig - with empty flags", async () => {
  const config = createFeatureFlagFallbackConfig();

  // Test with empty default flags
  const defaultValues = await config.getDefaultValues!();
  assertEquals(defaultValues, {});

  const offlineData = await config.getOfflineData!();
  assertEquals(offlineData, {});
});
