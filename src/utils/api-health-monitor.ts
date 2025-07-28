import * as logger from "./logger.ts";

/**
 * API health status levels
 */
export enum HealthStatus {
  HEALTHY = "HEALTHY",
  DEGRADED = "DEGRADED",
  UNHEALTHY = "UNHEALTHY",
  UNKNOWN = "UNKNOWN",
}

/**
 * API health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  responseTimeMs: number;
  timestamp: number;
  error: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * API health statistics
 */
export interface HealthStats {
  currentStatus: HealthStatus;
  averageResponseTimeMs: number;
  successRate: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  lastCheckTime: number | null;
  lastSuccessTime: number | null;
  lastFailureTime: number | null;
  uptime: number; // Percentage
  degradedThreshold: number;
  unhealthyThreshold: number;
}

/**
 * Health monitor configuration
 */
export interface HealthMonitorOptions {
  /**
   * Response time threshold in ms to consider service degraded
   */
  degradedThresholdMs?: number;
  /**
   * Response time threshold in ms to consider service unhealthy
   */
  unhealthyThresholdMs?: number;
  /**
   * Success rate threshold (0-1) to consider service degraded
   */
  degradedSuccessRate?: number;
  /**
   * Success rate threshold (0-1) to consider service unhealthy
   */
  unhealthySuccessRate?: number;
  /**
   * Number of recent checks to consider for calculating averages
   */
  windowSize?: number;
  /**
   * Minimum number of checks before calculating reliable statistics
   */
  minChecksForStats?: number;
}

/**
 * API health monitoring implementation
 */
export class ApiHealthMonitor {
  private readonly name: string;
  private readonly degradedThresholdMs: number;
  private readonly unhealthyThresholdMs: number;
  private readonly degradedSuccessRate: number;
  private readonly unhealthySuccessRate: number;
  private readonly windowSize: number;
  private readonly minChecksForStats: number;

  private recentChecks: HealthCheckResult[] = [];
  private totalChecks = 0;
  private successfulChecks = 0;
  private failedChecks = 0;
  private lastCheckTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private lastFailureTime: number | null = null;

  constructor(name: string, options: HealthMonitorOptions = {}) {
    this.name = name;
    this.degradedThresholdMs = options.degradedThresholdMs ?? 5000; // 5 seconds
    this.unhealthyThresholdMs = options.unhealthyThresholdMs ?? 10000; // 10 seconds
    this.degradedSuccessRate = options.degradedSuccessRate ?? 0.9; // 90%
    this.unhealthySuccessRate = options.unhealthySuccessRate ?? 0.7; // 70%
    this.windowSize = options.windowSize ?? 50;
    this.minChecksForStats = options.minChecksForStats ?? 5;

    logger.debug("API health monitor initialized", {
      name: this.name,
      degradedThresholdMs: this.degradedThresholdMs,
      unhealthyThresholdMs: this.unhealthyThresholdMs,
      degradedSuccessRate: this.degradedSuccessRate,
      unhealthySuccessRate: this.unhealthySuccessRate,
      windowSize: this.windowSize,
    });
  }

  /**
   * Perform a health check by executing a test function
   * @param healthCheckFn Function to execute for health check
   * @returns Health check result
   */
  async performHealthCheck<T>(
    healthCheckFn: () => Promise<T>,
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      await healthCheckFn();
      const responseTimeMs = Date.now() - startTime;
      const status = this.determineStatusFromResponseTime(responseTimeMs);

      result = {
        status,
        responseTimeMs,
        timestamp: Date.now(),
        error: null,
      };

      this.lastSuccessTime = result.timestamp;
      this.successfulChecks++;

      logger.debug("Health check succeeded", {
        name: this.name,
        responseTimeMs,
        status,
      });
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      result = {
        status: HealthStatus.UNHEALTHY,
        responseTimeMs,
        timestamp: Date.now(),
        error: errorMessage,
      };

      this.lastFailureTime = result.timestamp;
      this.failedChecks++;

      logger.warn("Health check failed", {
        name: this.name,
        responseTimeMs,
        error: errorMessage,
      });
    }

    // Update tracking
    this.totalChecks++;
    this.lastCheckTime = result.timestamp;
    this.addCheckResult(result);

    return result;
  }

  /**
   * Get current health statistics
   * @returns Health statistics
   */
  getHealthStats(): HealthStats {
    const successRate = this.totalChecks > 0 ? this.successfulChecks / this.totalChecks : 0;
    const averageResponseTime = this.calculateAverageResponseTime();
    const uptime = this.calculateUptime();

    return {
      currentStatus: this.determineCurrentStatus(),
      averageResponseTimeMs: averageResponseTime,
      successRate,
      totalChecks: this.totalChecks,
      successfulChecks: this.successfulChecks,
      failedChecks: this.failedChecks,
      lastCheckTime: this.lastCheckTime,
      lastSuccessTime: this.lastSuccessTime,
      lastFailureTime: this.lastFailureTime,
      uptime,
      degradedThreshold: this.degradedThresholdMs,
      unhealthyThreshold: this.unhealthyThresholdMs,
    };
  }

  /**
   * Get recent health check results
   * @param limit Maximum number of results to return
   * @returns Recent health check results
   */
  getRecentChecks(limit?: number): HealthCheckResult[] {
    if (limit && limit > 0) {
      return this.recentChecks.slice(-limit);
    }
    return [...this.recentChecks];
  }

  /**
   * Check if the API is currently healthy
   * @returns True if API is healthy
   */
  isHealthy(): boolean {
    return this.determineCurrentStatus() === HealthStatus.HEALTHY;
  }

  /**
   * Check if the API is currently available (healthy or degraded)
   * @returns True if API is available
   */
  isAvailable(): boolean {
    const status = this.determineCurrentStatus();
    return status === HealthStatus.HEALTHY || status === HealthStatus.DEGRADED;
  }

  /**
   * Reset health monitor statistics
   */
  reset(): void {
    this.recentChecks = [];
    this.totalChecks = 0;
    this.successfulChecks = 0;
    this.failedChecks = 0;
    this.lastCheckTime = null;
    this.lastSuccessTime = null;
    this.lastFailureTime = null;

    logger.info("Health monitor statistics reset", {
      name: this.name,
    });
  }

  /**
   * Add a health check result to the rolling window
   * @param result Health check result to add
   */
  private addCheckResult(result: HealthCheckResult): void {
    this.recentChecks.push(result);

    // Maintain sliding window
    if (this.recentChecks.length > this.windowSize) {
      this.recentChecks.shift();
    }
  }

  /**
   * Determine status based on response time
   * @param responseTimeMs Response time in milliseconds
   * @returns Health status
   */
  private determineStatusFromResponseTime(responseTimeMs: number): HealthStatus {
    if (responseTimeMs >= this.unhealthyThresholdMs) {
      return HealthStatus.UNHEALTHY;
    } else if (responseTimeMs >= this.degradedThresholdMs) {
      return HealthStatus.DEGRADED;
    } else {
      return HealthStatus.HEALTHY;
    }
  }

  /**
   * Determine current overall health status
   * @returns Current health status
   */
  private determineCurrentStatus(): HealthStatus {
    if (this.totalChecks < this.minChecksForStats) {
      return HealthStatus.UNKNOWN;
    }

    const recentSuccessRate = this.calculateRecentSuccessRate();
    const averageResponseTime = this.calculateAverageResponseTime();

    // Unhealthy if success rate is too low
    if (recentSuccessRate < this.unhealthySuccessRate) {
      return HealthStatus.UNHEALTHY;
    }

    // Unhealthy if average response time is too high
    if (averageResponseTime >= this.unhealthyThresholdMs) {
      return HealthStatus.UNHEALTHY;
    }

    // Degraded if success rate is low or response time is high
    if (
      recentSuccessRate < this.degradedSuccessRate ||
      averageResponseTime >= this.degradedThresholdMs
    ) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Calculate average response time from recent checks
   * @returns Average response time in milliseconds
   */
  private calculateAverageResponseTime(): number {
    if (this.recentChecks.length === 0) {
      return 0;
    }

    const totalResponseTime = this.recentChecks.reduce(
      (sum, check) => sum + check.responseTimeMs,
      0,
    );

    return totalResponseTime / this.recentChecks.length;
  }

  /**
   * Calculate success rate from recent checks
   * @returns Success rate (0-1)
   */
  private calculateRecentSuccessRate(): number {
    if (this.recentChecks.length === 0) {
      return 0;
    }

    const successfulRecentChecks = this.recentChecks.filter(
      (check) => check.status !== HealthStatus.UNHEALTHY && check.error === null,
    ).length;

    return successfulRecentChecks / this.recentChecks.length;
  }

  /**
   * Calculate uptime percentage
   * @returns Uptime percentage (0-100)
   */
  private calculateUptime(): number {
    if (this.totalChecks === 0) {
      return 0;
    }

    return (this.successfulChecks / this.totalChecks) * 100;
  }
}

/**
 * Create a simple health check function for HTTP endpoints
 * @param url URL to check
 * @param options Fetch options
 * @returns Health check function
 */
export function createHttpHealthCheck(
  url: string,
  options: RequestInit = {},
): () => Promise<Response> {
  return async () => {
    const response = await fetch(url, {
      method: "GET",
      ...options,
      // Override timeout to ensure health check doesn't hang
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  };
}

/**
 * Create a health check function for API endpoints that require authentication
 * @param url URL to check
 * @param token Authentication token
 * @param options Additional fetch options
 * @returns Health check function
 */
export function createAuthenticatedHealthCheck(
  url: string,
  token: string,
  options: RequestInit = {},
): () => Promise<Response> {
  return createHttpHealthCheck(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}
