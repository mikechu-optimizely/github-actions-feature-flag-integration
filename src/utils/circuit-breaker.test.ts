import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
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

  const failingOperation = async () => {
    throw new Error("500: Server error");
  };

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
  });

  const failingOperation = async () => {
    throw new Error("500: Server error");
  };

  // Open the circuit
  await assertRejects(() => cb.execute(failingOperation));
  assertEquals(cb.getState(), CircuitBreakerState.OPEN);

  // Wait for reset timeout
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Next request should transition to HALF_OPEN
  const successOperation = async () => "success";
  const result = await cb.execute(successOperation);
  assertEquals(result, "success");
  assertEquals(cb.getState(), CircuitBreakerState.CLOSED);
});

Deno.test("CircuitBreaker - Should not count non-critical errors", async () => {
  const cb = new CircuitBreaker("test-circuit", {
    failureThreshold: 2,
    isErrorCritical: isApiErrorCritical,
  });

  const clientErrorOperation = async () => {
    throw new Error("404: Not found");
  };

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

  const slowOperation = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return "success";
  };

  await assertRejects(
    () => cb.execute(slowOperation),
    Error,
    "Operation timed out after 50ms",
  );
});

Deno.test("CircuitBreaker - Should reset manually", async () => {
  const cb = new CircuitBreaker("test-circuit", { failureThreshold: 1 });

  const failingOperation = async () => {
    throw new Error("500: Server error");
  };

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

  const successOperation = async () => "success";
  const failingOperation = async () => {
    throw new Error("500: Server error");
  };

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
