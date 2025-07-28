import * as logger from "./logger.ts";
import { Result } from "./try-catch.ts";
import { CircuitBreaker, CircuitBreakerState, isApiErrorCritical } from "./circuit-breaker.ts";
import { ApiHealthMonitor, HealthStatus } from "./api-health-monitor.ts";
import { ApiFallbackManager, FallbackConfig } from "./api-fallback.ts";

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
  RETRY_WITH_BACKOFF = "RETRY_WITH_BACKOFF",
  CIRCUIT_BREAKER = "CIRCUIT_BREAKER",
  FALLBACK = "FALLBACK",
  GRACEFUL_DEGRADATION = "GRACEFUL_DEGRADATION",
  FAIL_FAST = "FAIL_FAST",
  IGNORE_ERROR = "IGNORE_ERROR",
}

/**
 * Error recovery configuration
 */
export interface ErrorRecoveryConfig<T> {
  /**
   * Maximum number of recovery attempts
   */
  maxRecoveryAttempts?: number;
  /**
   * Recovery strategies to use in order
   */
  recoveryStrategies?: RecoveryStrategy[];
  /**
   * Circuit breaker configuration
   */
  circuitBreakerOptions?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    timeoutMs?: number;
  };
  /**
   * Health monitor configuration
   */
  healthMonitorOptions?: {
    degradedThresholdMs?: number;
    unhealthyThresholdMs?: number;
  };
  /**
   * Fallback configuration
   */
  fallbackConfig?: FallbackConfig<T>;
  /**
   * Custom error classifier
   */
  classifyError?: (error: Error) => ErrorClassification;
  /**
   * Recovery attempt callback
   */
  onRecoveryAttempt?: (attempt: number, strategy: RecoveryStrategy, error: Error) => void;
  /**
   * Recovery success callback
   */
  onRecoverySuccess?: (strategy: RecoveryStrategy, attempt: number) => void;
  /**
   * Recovery failure callback
   */
  onRecoveryFailure?: (error: Error, attemptedStrategies: RecoveryStrategy[]) => void;
}

/**
 * Error classification for recovery decisions
 */
export interface ErrorClassification {
  /**
   * Whether the error is retryable
   */
  isRetryable: boolean;
  /**
   * Whether the error is critical for circuit breaker
   */
  isCritical: boolean;
  /**
   * Whether the error allows fallback
   */
  allowsFallback: boolean;
  /**
   * Whether the error should trigger graceful degradation
   */
  triggersGracefulDegradation: boolean;
  /**
   * Suggested recovery strategies
   */
  suggestedStrategies: RecoveryStrategy[];
  /**
   * Error category for monitoring
   */
  category: string;
}

/**
 * Recovery execution result
 */
export interface RecoveryResult<T> {
  /**
   * Final result data
   */
  data: T | null;
  /**
   * Final error if recovery failed
   */
  error: Error | null;
  /**
   * Whether recovery was successful
   */
  recovered: boolean;
  /**
   * Strategy that succeeded (if any)
   */
  successfulStrategy: RecoveryStrategy | null;
  /**
   * All strategies attempted
   */
  attemptedStrategies: RecoveryStrategy[];
  /**
   * Total recovery attempts made
   */
  recoveryAttempts: number;
  /**
   * Total execution time including recovery
   */
  totalTimeMs: number;
}

/**
 * Comprehensive error recovery manager
 */
export class ErrorRecoveryManager<T> {
  private readonly name: string;
  private readonly circuitBreaker: CircuitBreaker<T>;
  private readonly healthMonitor: ApiHealthMonitor;
  private readonly fallbackManager: ApiFallbackManager;
  private readonly config: ErrorRecoveryConfig<T>;

  constructor(name: string, config: ErrorRecoveryConfig<T> = {}) {
    this.name = name;
    this.config = {
      maxRecoveryAttempts: 3,
      recoveryStrategies: [
        RecoveryStrategy.RETRY_WITH_BACKOFF,
        RecoveryStrategy.CIRCUIT_BREAKER,
        RecoveryStrategy.FALLBACK,
      ],
      ...config,
    };

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker<T>(
      `${name}-circuit-breaker`,
      {
        ...this.config.circuitBreakerOptions,
        isErrorCritical: isApiErrorCritical,
      },
    );

    // Initialize health monitor
    this.healthMonitor = new ApiHealthMonitor(
      `${name}-health-monitor`,
      this.config.healthMonitorOptions,
    );

    // Initialize fallback manager
    this.fallbackManager = new ApiFallbackManager(`${name}-fallback`);

    logger.debug("Error recovery manager initialized", {
      name: this.name,
      maxRecoveryAttempts: this.config.maxRecoveryAttempts,
      recoveryStrategies: this.config.recoveryStrategies,
    });
  }

  /**
   * Execute an operation with comprehensive error recovery
   * @param operationKey Unique key for the operation
   * @param operation Operation to execute
   * @returns Recovery result
   */
  async executeWithRecovery(
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<RecoveryResult<T>> {
    const startTime = Date.now();
    const attemptedStrategies: RecoveryStrategy[] = [];
    let recoveryAttempts = 0;
    let lastError: Error | null = null;

    logger.debug("Starting operation with error recovery", {
      name: this.name,
      operationKey,
    });

    // Try each recovery strategy
    for (const strategy of this.config.recoveryStrategies || []) {
      try {
        attemptedStrategies.push(strategy);
        recoveryAttempts++;

        if (this.config.onRecoveryAttempt) {
          this.config.onRecoveryAttempt(recoveryAttempts, strategy, lastError!);
        }

        logger.debug("Attempting recovery strategy", {
          name: this.name,
          operationKey,
          strategy,
          attempt: recoveryAttempts,
        });

        const result = await this.executeRecoveryStrategy(
          operationKey,
          operation,
          strategy,
        );

        if (result.data !== null) {
          // Recovery successful
          if (this.config.onRecoverySuccess) {
            this.config.onRecoverySuccess(strategy, recoveryAttempts);
          }

          logger.info("Operation recovered successfully", {
            name: this.name,
            operationKey,
            strategy,
            attempt: recoveryAttempts,
            totalTimeMs: Date.now() - startTime,
          });

          return {
            data: result.data,
            error: null,
            recovered: true,
            successfulStrategy: strategy,
            attemptedStrategies,
            recoveryAttempts,
            totalTimeMs: Date.now() - startTime,
          };
        }

        lastError = result.error;
      } catch (error) {
        lastError = error as Error;
        logger.warn("Recovery strategy failed", {
          name: this.name,
          operationKey,
          strategy,
          attempt: recoveryAttempts,
          error: lastError.message,
        });
      }

      // Check if we should continue with more recovery attempts
      if (recoveryAttempts >= (this.config.maxRecoveryAttempts || 3)) {
        logger.warn("Maximum recovery attempts reached", {
          name: this.name,
          operationKey,
          maxAttempts: this.config.maxRecoveryAttempts,
        });
        break;
      }
    }

    // All recovery strategies failed
    if (this.config.onRecoveryFailure && lastError) {
      this.config.onRecoveryFailure(lastError, attemptedStrategies);
    }

    logger.error("All recovery strategies failed", {
      name: this.name,
      operationKey,
      attemptedStrategies,
      recoveryAttempts,
      finalError: lastError?.message,
      totalTimeMs: Date.now() - startTime,
    });

    return {
      data: null,
      error: lastError || new Error("Unknown recovery failure"),
      recovered: false,
      successfulStrategy: null,
      attemptedStrategies,
      recoveryAttempts,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a specific recovery strategy
   * @param operationKey Operation key
   * @param operation Operation to execute
   * @param strategy Recovery strategy to use
   * @returns Result with data or error
   */
  private async executeRecoveryStrategy(
    operationKey: string,
    operation: () => Promise<T>,
    strategy: RecoveryStrategy,
  ): Promise<Result<T, Error>> {
    switch (strategy) {
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
        return await this.executeWithRetry(operation);

      case RecoveryStrategy.CIRCUIT_BREAKER:
        return await this.executeWithCircuitBreaker(operation);

      case RecoveryStrategy.FALLBACK:
        return await this.executeWithFallback(operationKey, operation);

      case RecoveryStrategy.GRACEFUL_DEGRADATION:
        return await this.executeWithGracefulDegradation(operationKey, operation);

      case RecoveryStrategy.FAIL_FAST:
        return await this.executeFailFast(operation);

      case RecoveryStrategy.IGNORE_ERROR:
        return await this.executeIgnoreError(operation);

      default:
        throw new Error(`Unknown recovery strategy: ${strategy}`);
    }
  }

  /**
   * Execute operation with retry and exponential backoff
   * @param operation Operation to execute
   * @returns Result with data or error
   */
  private async executeWithRetry(operation: () => Promise<T>): Promise<Result<T, Error>> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        return { data: result, error: null };
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Classify error to determine if we should retry
          const classification = this.classifyError(lastError);
          if (!classification.isRetryable) {
            break;
          }

          // Calculate backoff delay
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000) + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return { data: null, error: lastError || new Error("Retry strategy failed") };
  }

  /**
   * Execute operation through circuit breaker
   * @param operation Operation to execute
   * @returns Result with data or error
   */
  private async executeWithCircuitBreaker(operation: () => Promise<T>): Promise<Result<T, Error>> {
    try {
      const result = await this.circuitBreaker.execute(operation);
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  /**
   * Execute operation with fallback mechanisms
   * @param operationKey Operation key
   * @param operation Operation to execute
   * @returns Result with data or error
   */
  private async executeWithFallback(
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<Result<T, Error>> {
    if (!this.config.fallbackConfig) {
      return { data: null, error: new Error("No fallback configuration provided") };
    }

    const fallbackResult = await this.fallbackManager.executeWithFallback(
      operationKey,
      operation,
      this.config.fallbackConfig,
    );

    if (fallbackResult.data !== null) {
      return { data: fallbackResult.data, error: null };
    }

    return { data: null, error: fallbackResult.error || new Error("Fallback strategy failed") };
  }

  /**
   * Execute operation with graceful degradation
   * @param operationKey Operation key
   * @param operation Operation to execute
   * @returns Result with data or error
   */
  private async executeWithGracefulDegradation(
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<Result<T, Error>> {
    // Perform health check first
    const healthResult = await this.healthMonitor.performHealthCheck(async () => {
      await operation();
    });

    if (healthResult.status === HealthStatus.HEALTHY) {
      try {
        const result = await operation();
        return { data: result, error: null };
      } catch (error) {
        return { data: null, error: error as Error };
      }
    }

    // Service is not healthy, attempt degraded functionality
    if (this.config.fallbackConfig?.getOfflineData) {
      try {
        const degradedData = await this.config.fallbackConfig.getOfflineData();
        if (degradedData !== null) {
          logger.info("Using degraded functionality", {
            name: this.name,
            operationKey,
            healthStatus: healthResult.status,
          });
          return { data: degradedData, error: null };
        }
      } catch (error) {
        logger.warn("Degraded functionality failed", {
          name: this.name,
          operationKey,
          error: (error as Error).message,
        });
      }
    }

    return { data: null, error: new Error("Graceful degradation strategy failed") };
  }

  /**
   * Execute operation with fail-fast strategy
   * @param operation Operation to execute
   * @returns Result with data or error
   */
  private async executeFailFast(operation: () => Promise<T>): Promise<Result<T, Error>> {
    try {
      const result = await operation();
      return { data: result, error: null };
    } catch (error) {
      // Fail fast - don't attempt any recovery, just return the error immediately
      return { data: null, error: error as Error };
    }
  }

  /**
   * Execute operation ignoring errors (return null on error)
   * @param operation Operation to execute
   * @returns Result with data or null
   */
  private async executeIgnoreError(operation: () => Promise<T>): Promise<Result<T, Error>> {
    try {
      const result = await operation();
      return { data: result, error: null };
    } catch (error) {
      logger.debug("Ignoring operation error", {
        name: this.name,
        error: (error as Error).message,
      });
      // For ignore error strategy, we return the error but mark operation as successful
      return { data: null, error: new Error("Operation error ignored") };
    }
  }

  /**
   * Classify an error for recovery decisions
   * @param error Error to classify
   * @returns Error classification
   */
  private classifyError(error: Error): ErrorClassification {
    if (this.config.classifyError) {
      return this.config.classifyError(error);
    }

    // Default error classification
    return classifyApiError(error);
  }

  /**
   * Get current circuit breaker statistics
   * @returns Circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Get current health monitor statistics
   * @returns Health monitor statistics
   */
  getHealthStats() {
    return this.healthMonitor.getHealthStats();
  }

  /**
   * Get fallback manager cache statistics
   * @returns Cache statistics
   */
  getFallbackStats() {
    return this.fallbackManager.getCacheStats();
  }

  /**
   * Reset all recovery mechanisms
   */
  reset(): void {
    this.circuitBreaker.reset();
    this.healthMonitor.reset();
    this.fallbackManager.clearAllCache();

    logger.info("Error recovery manager reset", {
      name: this.name,
    });
  }
}

/**
 * Default error classification for API errors
 * @param error Error to classify
 * @returns Error classification
 */
export function classifyApiError(error: Error): ErrorClassification {
  const message = error.message.toLowerCase();

  // Client errors (4xx) - generally not retryable
  if (
    message.includes("400") || message.includes("401") ||
    message.includes("403") || message.includes("404")
  ) {
    return {
      isRetryable: false,
      isCritical: false,
      allowsFallback: true,
      triggersGracefulDegradation: false,
      suggestedStrategies: [RecoveryStrategy.FALLBACK],
      category: "client-error",
    };
  }

  // Rate limiting (429) - retryable with backoff
  if (message.includes("429") || message.includes("rate limit")) {
    return {
      isRetryable: true,
      isCritical: false,
      allowsFallback: true,
      triggersGracefulDegradation: true,
      suggestedStrategies: [
        RecoveryStrategy.RETRY_WITH_BACKOFF,
        RecoveryStrategy.FALLBACK,
      ],
      category: "rate-limit",
    };
  }

  // Server errors (5xx) - retryable and critical
  if (
    message.includes("500") || message.includes("502") ||
    message.includes("503") || message.includes("504")
  ) {
    return {
      isRetryable: true,
      isCritical: true,
      allowsFallback: true,
      triggersGracefulDegradation: true,
      suggestedStrategies: [
        RecoveryStrategy.CIRCUIT_BREAKER,
        RecoveryStrategy.FALLBACK,
        RecoveryStrategy.GRACEFUL_DEGRADATION,
      ],
      category: "server-error",
    };
  }

  // Network/timeout errors - retryable and critical
  if (
    message.includes("timeout") || message.includes("network") ||
    message.includes("connection") || message.includes("abort")
  ) {
    return {
      isRetryable: true,
      isCritical: true,
      allowsFallback: true,
      triggersGracefulDegradation: true,
      suggestedStrategies: [
        RecoveryStrategy.RETRY_WITH_BACKOFF,
        RecoveryStrategy.CIRCUIT_BREAKER,
        RecoveryStrategy.FALLBACK,
      ],
      category: "network-error",
    };
  }

  // Unknown errors - conservative approach
  return {
    isRetryable: false,
    isCritical: true,
    allowsFallback: true,
    triggersGracefulDegradation: true,
    suggestedStrategies: [RecoveryStrategy.FALLBACK],
    category: "unknown",
  };
}

/**
 * Create a default error recovery configuration
 * @param options Partial configuration options
 * @returns Complete error recovery configuration
 */
export function createDefaultRecoveryConfig<T>(
  options: Partial<ErrorRecoveryConfig<T>> = {},
): ErrorRecoveryConfig<T> {
  return {
    maxRecoveryAttempts: 3,
    recoveryStrategies: [
      RecoveryStrategy.RETRY_WITH_BACKOFF,
      RecoveryStrategy.CIRCUIT_BREAKER,
      RecoveryStrategy.FALLBACK,
    ],
    circuitBreakerOptions: {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      timeoutMs: 30000,
    },
    healthMonitorOptions: {
      degradedThresholdMs: 5000,
      unhealthyThresholdMs: 10000,
    },
    classifyError: classifyApiError,
    ...options,
  };
}
