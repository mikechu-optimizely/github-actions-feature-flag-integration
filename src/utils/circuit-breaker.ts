import * as logger from "./logger.ts";

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Circuit is open, rejecting requests
  HALF_OPEN = "HALF_OPEN", // Testing if service has recovered
}

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening the circuit
   */
  failureThreshold?: number;
  /**
   * Time in milliseconds to wait before attempting to close the circuit
   */
  resetTimeoutMs?: number;
  /**
   * Time in milliseconds to consider a request as timed out
   */
  timeoutMs?: number;
  /**
   * Number of successful requests needed to close the circuit from half-open state
   */
  successThreshold?: number;
  /**
   * Function to determine if an error should count towards the failure threshold
   */
  isErrorCritical?: (error: Error) => boolean;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Circuit breaker implementation for API resilience
 */
export class CircuitBreaker<T> {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly timeoutMs: number;
  private readonly successThreshold: number;
  private readonly isErrorCritical: (error: Error) => boolean;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60000; // 1 minute
    this.timeoutMs = options.timeoutMs ?? 30000; // 30 seconds
    this.successThreshold = options.successThreshold ?? 3;
    this.isErrorCritical = options.isErrorCritical ?? (() => true);

    logger.debug("Circuit breaker initialized", {
      name: this.name,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
      timeoutMs: this.timeoutMs,
      successThreshold: this.successThreshold,
    });
  }

  /**
   * Execute a function through the circuit breaker
   * @param fn Function to execute
   * @returns Promise resolving to the function result
   * @throws Error if circuit is open or function fails
   */
  async execute(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
        logger.info("Circuit breaker transitioning to HALF_OPEN", {
          name: this.name,
          timeSinceLastFailure: this.lastFailureTime ? Date.now() - this.lastFailureTime : null,
        });
      } else {
        this.totalFailures++;
        const error = new Error(`Circuit breaker is OPEN for ${this.name}`);
        logger.warn("Circuit breaker rejecting request", {
          name: this.name,
          state: this.state,
          failureCount: this.failureCount,
          timeSinceLastFailure: this.lastFailureTime ? Date.now() - this.lastFailureTime : null,
        });
        throw error;
      }
    }

    try {
      // Execute the function with timeout
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute function with timeout
   * @param fn Function to execute
   * @returns Promise resolving to the function result
   */
  private executeWithTimeout(fn: () => Promise<T>): Promise<T> {
    let timeoutId: number;
    let isResolved = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          reject(new Error(`Operation timed out after ${this.timeoutMs}ms`));
        }
      }, this.timeoutMs);
    });

    const operation = fn().then(
      (result) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          return result;
        }
        // If already resolved by timeout, return a promise that never resolves
        // This prevents the result from being processed
        return new Promise<T>(() => {});
      },
      (error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          throw error;
        }
        // If already resolved by timeout, return a promise that never resolves
        return new Promise<T>(() => {});
      },
    );

    return Promise.race([operation, timeoutPromise]);
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.successCount++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        logger.info("Circuit breaker closed after successful recovery", {
          name: this.name,
          successCount: this.successCount,
          successThreshold: this.successThreshold,
        });
      }
    }

    logger.debug("Circuit breaker recorded success", {
      name: this.name,
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount,
    });
  }

  /**
   * Handle failed execution
   * @param error The error that occurred
   */
  private onFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    // Only count critical errors towards the failure threshold
    if (this.isErrorCritical(error)) {
      this.failureCount++;
      this.successCount = 0; // Reset success count on any critical failure

      if (this.state === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
        this.state = CircuitBreakerState.OPEN;
        logger.warn("Circuit breaker opened due to failure threshold", {
          name: this.name,
          failureCount: this.failureCount,
          failureThreshold: this.failureThreshold,
          error: error.message,
        });
      } else if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.state = CircuitBreakerState.OPEN;
        logger.warn("Circuit breaker reopened after failure in HALF_OPEN state", {
          name: this.name,
          error: error.message,
        });
      }
    }

    logger.debug("Circuit breaker recorded failure", {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      isCritical: this.isErrorCritical(error),
      error: error.message,
    });
  }

  /**
   * Check if circuit breaker should attempt to reset from OPEN to HALF_OPEN
   * @returns True if should attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) {
      return false;
    }
    return Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
  }

  /**
   * Get current circuit breaker statistics
   * @returns Circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;

    logger.info("Circuit breaker manually reset", {
      name: this.name,
    });
  }

  /**
   * Force the circuit breaker to OPEN state
   */
  forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.lastFailureTime = Date.now();

    logger.warn("Circuit breaker manually forced to OPEN", {
      name: this.name,
    });
  }

  /**
   * Get the current state of the circuit breaker
   * @returns Current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if the circuit breaker is currently accepting requests
   * @returns True if accepting requests
   */
  isAcceptingRequests(): boolean {
    return this.state === CircuitBreakerState.CLOSED ||
      (this.state === CircuitBreakerState.HALF_OPEN);
  }
}

/**
 * Default error criticality checker for API errors
 * @param error The error to check
 * @returns True if error should count towards failure threshold
 */
export function isApiErrorCritical(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Don't count client errors (4xx) as critical failures
  if (
    message.includes("400") ||
    message.includes("401") ||
    message.includes("403") ||
    message.includes("404")
  ) {
    return false;
  }

  // Count server errors (5xx) and network errors as critical
  if (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection")
  ) {
    return true;
  }

  // Rate limiting is not critical - it's expected behavior
  if (message.includes("429") || message.includes("rate limit")) {
    return false;
  }

  // Default to critical for unknown errors
  return true;
}
