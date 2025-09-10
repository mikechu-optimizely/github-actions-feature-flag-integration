import { assertEquals, assertRejects } from "@std/assert";
import { CircuitBreaker, CircuitBreakerState, isApiErrorCritical } from "./circuit-breaker.ts";

Deno.test("CircuitBreaker - Initial state should be CLOSED", () => {
  const cb = new CircuitBreaker("test-circuit", { failureThreshold: 3 });
  assertEquals(cb.getState(), CircuitBreakerState.CLOSED);
  assertEquals(cb.isAcceptingRequests(), true);
});

Deno.test("CircuitBreaker - Should open after failure threshold", async () => {
  const cb = new CircuitBreaker("test-circuit", {
    failureThreshold: 2,
    timeoutMs: 100,
  });

  const failingOperation = () => Promise.reject(new Error("500: Server error"));

  // First failure
  await assertRejects(() => cb.execute(failingOperation));
  assertEquals(cb.getState(), CircuitBreakerState.CLOSED);

  // Second failure - should open circuit
  await assertRejects(() => cb.execute(failingOperation));
  assertEquals(cb.getState(), CircuitBreakerState.OPEN);
  assertEquals(cb.isAcceptingRequests(), false);
});

Deno.test("CircuitBreaker - Should transition to HALF_OPEN after timeout", async () => {
  const cb = new CircuitBreaker("test-circuit", {
    failureThreshold: 1,
    resetTimeoutMs: 50,
    timeoutMs: 100,
    successThreshold: 1, // Set to 1 so circuit closes after 1 success
  });

  const failingOperation = () => Promise.reject(new Error("500: Server error"));

  // Open the circuit
  await assertRejects(() => cb.execute(failingOperation));
  assertEquals(cb.getState(), CircuitBreakerState.OPEN);

  // Wait for reset timeout
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Next request should transition to HALF_OPEN, then to CLOSED after success
  const successOperation = () => Promise.resolve("success");
  const result = await cb.execute(successOperation);
  assertEquals(result, "success");
  assertEquals(cb.getState(), CircuitBreakerState.CLOSED);
});

Deno.test("CircuitBreaker - Should not count non-critical errors", async () => {
  const cb = new CircuitBreaker("test-circuit", {
    failureThreshold: 2,
    isErrorCritical: isApiErrorCritical,
  });

  const clientErrorOperation = () => Promise.reject(new Error("404: Not found"));

  // Client errors shouldn't count towards failure threshold
  await assertRejects(() => cb.execute(clientErrorOperation));
  await assertRejects(() => cb.execute(clientErrorOperation));
  await assertRejects(() => cb.execute(clientErrorOperation));

  // Circuit should still be closed
  assertEquals(cb.getState(), CircuitBreakerState.CLOSED);
});

Deno.test("CircuitBreaker - Should handle timeout", async () => {
  const cb = new CircuitBreaker("test-circuit", {
    failureThreshold: 1,
    timeoutMs: 50,
  });

  let timeoutId: number | undefined;
  const slowOperation = async () => {
    await new Promise((resolve) => {
      timeoutId = setTimeout(resolve, 100);
    });
    return "success";
  };

  try {
    await assertRejects(
      () => cb.execute(slowOperation),
      Error,
      "Operation timed out after 50ms",
    );
  } finally {
    // Clean up the timer to prevent leaks in tests
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
});

Deno.test("CircuitBreaker - Should reset manually", async () => {
  const cb = new CircuitBreaker("test-circuit", { failureThreshold: 1 });

  const failingOperation = () => Promise.reject(new Error("500: Server error"));

  // Open the circuit
  await assertRejects(() => cb.execute(failingOperation));
  assertEquals(cb.getState(), CircuitBreakerState.OPEN);

  // Reset manually
  cb.reset();
  assertEquals(cb.getState(), CircuitBreakerState.CLOSED);
  assertEquals(cb.isAcceptingRequests(), true);
});

Deno.test("CircuitBreaker - Should provide statistics", async () => {
  const cb = new CircuitBreaker("test-circuit", { failureThreshold: 2 });

  const successOperation = () => Promise.resolve("success");
  const failingOperation = () => Promise.reject(new Error("500: Server error"));

  await cb.execute(successOperation);
  await assertRejects(() => cb.execute(failingOperation));

  const stats = cb.getStats();
  assertEquals(stats.totalRequests, 2);
  assertEquals(stats.totalSuccesses, 1);
  assertEquals(stats.totalFailures, 1);
  assertEquals(stats.state, CircuitBreakerState.CLOSED);
});

Deno.test("isApiErrorCritical - Should classify errors correctly", () => {
  // Critical errors
  assertEquals(isApiErrorCritical(new Error("500: Internal server error")), true);
  assertEquals(isApiErrorCritical(new Error("502: Bad gateway")), true);
  assertEquals(isApiErrorCritical(new Error("Network connection failed")), true);
  assertEquals(isApiErrorCritical(new Error("Request timeout")), true);

  // Non-critical errors
  assertEquals(isApiErrorCritical(new Error("400: Bad request")), false);
  assertEquals(isApiErrorCritical(new Error("401: Unauthorized")), false);
  assertEquals(isApiErrorCritical(new Error("404: Not found")), false);
  assertEquals(isApiErrorCritical(new Error("429: Rate limit exceeded")), false);
});
