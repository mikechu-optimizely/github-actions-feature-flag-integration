import { assertEquals, assertExists } from "@std/assert";
import {
  classifyApiError,
  createDefaultRecoveryConfig,
  type ErrorClassification,
  type ErrorRecoveryConfig,
  ErrorRecoveryManager,
  RecoveryStrategy,
} from "./error-recovery.ts";
import { FallbackStrategy } from "./api-fallback.ts";

interface TestData {
  message: string;
}

Deno.test("ErrorRecoveryManager - constructor with default config", () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");
  assertEquals(manager instanceof ErrorRecoveryManager, true);
});

Deno.test("ErrorRecoveryManager - constructor with custom config", () => {
  const config: ErrorRecoveryConfig<TestData> = {
    maxRecoveryAttempts: 5,
    recoveryStrategies: [RecoveryStrategy.RETRY_WITH_BACKOFF],
  };
  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);
  assertEquals(manager instanceof ErrorRecoveryManager, true);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - successful operation", async () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");
  const testData = { message: "success" };

  const operation = () => Promise.resolve(testData);

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, testData);
  assertEquals(result.error, null);
  assertEquals(result.recovered, true);
  assertEquals(result.successfulStrategy, RecoveryStrategy.RETRY_WITH_BACKOFF);
  assertEquals(result.recoveryAttempts, 1);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - operation fails then succeeds on retry", async () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");
  const testData = { message: "success" };
  let attemptCount = 0;

  const operation = () => {
    attemptCount++;
    if (attemptCount === 1) {
      return Promise.reject(new Error("Network timeout"));
    }
    return Promise.resolve(testData);
  };

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, testData);
  assertEquals(result.error, null);
  assertEquals(result.recovered, true);
  assertEquals(result.successfulStrategy, RecoveryStrategy.RETRY_WITH_BACKOFF);
  assertEquals(result.recoveryAttempts, 1);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - non-retryable error", async () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");

  const operation = () => Promise.reject(new Error("400 Bad Request"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, null);
  assertExists(result.error);
  assertEquals(result.recovered, false);
  assertEquals(result.successfulStrategy, null);
  assertEquals(result.recoveryAttempts, 3); // Tries all strategies
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - with fallback config", async () => {
  const fallbackData = { message: "fallback" };
  const config: ErrorRecoveryConfig<TestData> = {
    fallbackConfig: {
      primaryStrategy: FallbackStrategy.DEFAULT_VALUES,
      getDefaultValues: () => Promise.resolve(fallbackData),
    },
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("500 Server Error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, fallbackData);
  assertEquals(result.error, null);
  assertEquals(result.recovered, true);
  assertEquals(result.successfulStrategy, RecoveryStrategy.FALLBACK);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - with callbacks", async () => {
  const callbacks = {
    recoveryAttempts: [] as Array<{ attempt: number; strategy: RecoveryStrategy }>,
    recoverySuccess: null as { strategy: RecoveryStrategy; attempt: number } | null,
    recoveryFailure: null as { error: Error; strategies: RecoveryStrategy[] } | null,
  };

  const config: ErrorRecoveryConfig<TestData> = {
    maxRecoveryAttempts: 2,
    recoveryStrategies: [RecoveryStrategy.RETRY_WITH_BACKOFF, RecoveryStrategy.CIRCUIT_BREAKER],
    onRecoveryAttempt: (attempt, strategy, _error) => {
      callbacks.recoveryAttempts.push({ attempt, strategy });
    },
    onRecoverySuccess: (strategy, attempt) => {
      callbacks.recoverySuccess = { strategy, attempt };
    },
    onRecoveryFailure: (error, strategies) => {
      callbacks.recoveryFailure = { error, strategies };
    },
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Persistent error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.recovered, false);
  assertEquals(callbacks.recoveryAttempts.length, 2);
  assertEquals(callbacks.recoverySuccess, null);
  assertExists(callbacks.recoveryFailure);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - max attempts reached", async () => {
  const config: ErrorRecoveryConfig<TestData> = {
    maxRecoveryAttempts: 1,
    recoveryStrategies: [RecoveryStrategy.RETRY_WITH_BACKOFF, RecoveryStrategy.CIRCUIT_BREAKER],
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("500 Server Error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.recovered, false);
  assertEquals(result.recoveryAttempts, 1);
  assertEquals(result.attemptedStrategies.length, 1);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - fail fast strategy", async () => {
  const config: ErrorRecoveryConfig<TestData> = {
    recoveryStrategies: [RecoveryStrategy.FAIL_FAST],
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Test error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, null);
  assertExists(result.error);
  assertEquals(result.recovered, false);
  assertEquals(result.successfulStrategy, null);
  assertEquals(result.attemptedStrategies, [RecoveryStrategy.FAIL_FAST]);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - ignore error strategy", async () => {
  const config: ErrorRecoveryConfig<TestData> = {
    recoveryStrategies: [RecoveryStrategy.IGNORE_ERROR],
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Test error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, null);
  assertExists(result.error);
  assertEquals(result.error.message, "Operation error ignored");
  assertEquals(result.recovered, false); // Ignore error doesn't recover data, just ignores the error
  assertEquals(result.successfulStrategy, null);
  assertEquals(result.attemptedStrategies, [RecoveryStrategy.IGNORE_ERROR]);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - graceful degradation", async () => {
  const degradedData = { message: "degraded" };
  const config: ErrorRecoveryConfig<TestData> = {
    recoveryStrategies: [RecoveryStrategy.GRACEFUL_DEGRADATION],
    fallbackConfig: {
      primaryStrategy: FallbackStrategy.OFFLINE_MODE,
      getOfflineData: () => Promise.resolve(degradedData),
    },
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Service unavailable"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.data, degradedData);
  assertEquals(result.error, null);
  assertEquals(result.recovered, true);
  assertEquals(result.successfulStrategy, RecoveryStrategy.GRACEFUL_DEGRADATION);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - unknown strategy", async () => {
  const config: ErrorRecoveryConfig<TestData> = {
    recoveryStrategies: ["UNKNOWN_STRATEGY" as RecoveryStrategy],
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Test error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.recovered, false);
  assertExists(result.error);
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - fallback without config", async () => {
  const config: ErrorRecoveryConfig<TestData> = {
    recoveryStrategies: [RecoveryStrategy.FALLBACK],
    // No fallbackConfig provided
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Test error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.recovered, false);
  assertExists(result.error);
  assertEquals(result.error.message, "No fallback configuration provided");
});

Deno.test("ErrorRecoveryManager - executeWithRecovery - graceful degradation without fallback", async () => {
  const config: ErrorRecoveryConfig<TestData> = {
    recoveryStrategies: [RecoveryStrategy.GRACEFUL_DEGRADATION],
    // No fallbackConfig with getOfflineData
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Test error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  assertEquals(result.recovered, false);
  assertExists(result.error);
});

Deno.test("ErrorRecoveryManager - custom error classifier", async () => {
  const customClassifier = (_error: Error): ErrorClassification => ({
    isRetryable: false,
    isCritical: false,
    allowsFallback: false,
    triggersGracefulDegradation: false,
    suggestedStrategies: [RecoveryStrategy.FAIL_FAST],
    category: "custom",
  });

  const config: ErrorRecoveryConfig<TestData> = {
    classifyError: customClassifier,
    recoveryStrategies: [RecoveryStrategy.RETRY_WITH_BACKOFF],
  };

  const manager = new ErrorRecoveryManager<TestData>("test-manager", config);

  const operation = () => Promise.reject(new Error("Test error"));

  const result = await manager.executeWithRecovery("test-key", operation);

  // Since custom classifier marks errors as non-retryable, it should fail
  assertEquals(result.recovered, false);
});

Deno.test("ErrorRecoveryManager - getCircuitBreakerStats", () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");
  const stats = manager.getCircuitBreakerStats();

  assertExists(stats);
  assertEquals(typeof stats.state, "string");
  assertEquals(typeof stats.failureCount, "number");
});

Deno.test("ErrorRecoveryManager - getHealthStats", () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");
  const stats = manager.getHealthStats();

  assertExists(stats);
  assertEquals(typeof stats.totalChecks, "number");
  assertEquals(typeof stats.successfulChecks, "number");
});

Deno.test("ErrorRecoveryManager - getFallbackStats", () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");
  const stats = manager.getFallbackStats();

  assertExists(stats);
  assertEquals(typeof stats.totalEntries, "number");
});

Deno.test("ErrorRecoveryManager - reset", () => {
  const manager = new ErrorRecoveryManager<TestData>("test-manager");

  // Should not throw
  manager.reset();
});

Deno.test("classifyApiError - client errors", () => {
  const error400 = new Error("400 Bad Request");
  const classification = classifyApiError(error400);

  assertEquals(classification.isRetryable, false);
  assertEquals(classification.isCritical, false);
  assertEquals(classification.allowsFallback, true);
  assertEquals(classification.category, "client-error");
  assertEquals(classification.suggestedStrategies, [RecoveryStrategy.FALLBACK]);
});

Deno.test("classifyApiError - rate limiting", () => {
  const error429 = new Error("429 Too Many Requests");
  const classification = classifyApiError(error429);

  assertEquals(classification.isRetryable, true);
  assertEquals(classification.isCritical, false);
  assertEquals(classification.allowsFallback, true);
  assertEquals(classification.triggersGracefulDegradation, true);
  assertEquals(classification.category, "rate-limit");
  assertEquals(classification.suggestedStrategies, [
    RecoveryStrategy.RETRY_WITH_BACKOFF,
    RecoveryStrategy.FALLBACK,
  ]);
});

Deno.test("classifyApiError - server errors", () => {
  const error500 = new Error("500 Internal Server Error");
  const classification = classifyApiError(error500);

  assertEquals(classification.isRetryable, true);
  assertEquals(classification.isCritical, true);
  assertEquals(classification.allowsFallback, true);
  assertEquals(classification.triggersGracefulDegradation, true);
  assertEquals(classification.category, "server-error");
  assertEquals(classification.suggestedStrategies, [
    RecoveryStrategy.CIRCUIT_BREAKER,
    RecoveryStrategy.FALLBACK,
    RecoveryStrategy.GRACEFUL_DEGRADATION,
  ]);
});

Deno.test("classifyApiError - network errors", () => {
  const networkError = new Error("Network timeout");
  const classification = classifyApiError(networkError);

  assertEquals(classification.isRetryable, true);
  assertEquals(classification.isCritical, true);
  assertEquals(classification.allowsFallback, true);
  assertEquals(classification.triggersGracefulDegradation, true);
  assertEquals(classification.category, "network-error");
  assertEquals(classification.suggestedStrategies, [
    RecoveryStrategy.RETRY_WITH_BACKOFF,
    RecoveryStrategy.CIRCUIT_BREAKER,
    RecoveryStrategy.FALLBACK,
  ]);
});

Deno.test("classifyApiError - unknown errors", () => {
  const unknownError = new Error("Unknown error");
  const classification = classifyApiError(unknownError);

  assertEquals(classification.isRetryable, false);
  assertEquals(classification.isCritical, true);
  assertEquals(classification.allowsFallback, true);
  assertEquals(classification.triggersGracefulDegradation, true);
  assertEquals(classification.category, "unknown");
  assertEquals(classification.suggestedStrategies, [RecoveryStrategy.FALLBACK]);
});

Deno.test("createDefaultRecoveryConfig - with defaults", () => {
  const config = createDefaultRecoveryConfig<TestData>();

  assertEquals(config.maxRecoveryAttempts, 3);
  assertEquals(config.recoveryStrategies, [
    RecoveryStrategy.RETRY_WITH_BACKOFF,
    RecoveryStrategy.CIRCUIT_BREAKER,
    RecoveryStrategy.FALLBACK,
  ]);
  assertEquals(config.circuitBreakerOptions?.failureThreshold, 5);
  assertEquals(config.healthMonitorOptions?.degradedThresholdMs, 5000);
  assertExists(config.classifyError);
});

Deno.test("createDefaultRecoveryConfig - with custom options", () => {
  const customConfig = createDefaultRecoveryConfig<TestData>({
    maxRecoveryAttempts: 5,
    recoveryStrategies: [RecoveryStrategy.FAIL_FAST],
    circuitBreakerOptions: {
      failureThreshold: 10,
    },
  });

  assertEquals(customConfig.maxRecoveryAttempts, 5);
  assertEquals(customConfig.recoveryStrategies, [RecoveryStrategy.FAIL_FAST]);
  assertEquals(customConfig.circuitBreakerOptions?.failureThreshold, 10);
  // Should keep other defaults
  assertEquals(customConfig.healthMonitorOptions?.degradedThresholdMs, 5000);
  assertExists(customConfig.classifyError);
});
