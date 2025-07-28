import * as logger from "./logger.ts";
import { Result } from "./try-catch.ts";
import { HealthStatus } from "./api-health-monitor.ts";

/**
 * Fallback strategy types
 */
export enum FallbackStrategy {
  CACHED_DATA = "CACHED_DATA",
  DEFAULT_VALUES = "DEFAULT_VALUES",
  OFFLINE_MODE = "OFFLINE_MODE",
  DEGRADED_FUNCTIONALITY = "DEGRADED_FUNCTIONALITY",
  FAIL_FAST = "FAIL_FAST",
}

/**
 * Fallback execution result
 */
export interface FallbackResult<T> {
  data: T | null;
  strategy: FallbackStrategy;
  source: string;
  timestamp: number;
  error: Error | null;
  fallbackUsed: boolean;
}

/**
 * Fallback configuration for a specific operation
 */
export interface FallbackConfig<T> {
  /**
   * Primary strategy to use when API is unavailable
   */
  primaryStrategy: FallbackStrategy;
  /**
   * Fallback strategies to try in order if primary fails
   */
  fallbackStrategies?: FallbackStrategy[];
  /**
   * Function to provide cached data
   */
  getCachedData?: () => Promise<T | null>;
  /**
   * Function to provide default values
   */
  getDefaultValues?: () => Promise<T | null>;
  /**
   * Function to provide offline/degraded functionality
   */
  getOfflineData?: () => Promise<T | null>;
  /**
   * Maximum age of cached data in milliseconds
   */
  maxCacheAgeMs?: number;
  /**
   * Whether to enable graceful degradation
   */
  enableGracefulDegradation?: boolean;
  /**
   * Custom error handler for fallback failures
   */
  onFallbackError?: (error: Error, strategy: FallbackStrategy) => void;
}

/**
 * Cache entry for fallback data
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  source: string;
}

/**
 * API fallback manager for handling service unavailability
 */
export class ApiFallbackManager {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
    logger.debug("API fallback manager initialized", { name: this.name });
  }

  /**
   * Execute an operation with fallback mechanisms
   * @param key Unique key for the operation
   * @param primaryOperation Primary operation to execute
   * @param config Fallback configuration
   * @returns Result with data or fallback information
   */
  async executeWithFallback<T>(
    key: string,
    primaryOperation: () => Promise<T>,
    config: FallbackConfig<T>,
  ): Promise<FallbackResult<T>> {
    const startTime = Date.now();

    try {
      // Attempt primary operation
      const result = await primaryOperation();

      // Cache successful result for future fallback use
      this.setCacheEntry(key, result, "primary");

      logger.debug("Primary operation succeeded", {
        name: this.name,
        key,
        responseTimeMs: Date.now() - startTime,
      });

      return {
        data: result,
        strategy: FallbackStrategy.CACHED_DATA, // Will be used for future fallbacks
        source: "primary",
        timestamp: Date.now(),
        error: null,
        fallbackUsed: false,
      };
    } catch (error) {
      logger.warn("Primary operation failed, attempting fallback", {
        name: this.name,
        key,
        error: error instanceof Error ? error.message : "Unknown error",
        responseTimeMs: Date.now() - startTime,
      });

      return await this.executeFallbackStrategy(key, config, error as Error);
    }
  }

  /**
   * Execute fallback strategies in order until one succeeds
   * @param key Operation key
   * @param config Fallback configuration
   * @param primaryError Original error from primary operation
   * @returns Fallback result
   */
  private async executeFallbackStrategy<T>(
    key: string,
    config: FallbackConfig<T>,
    primaryError: Error,
  ): Promise<FallbackResult<T>> {
    const strategies = [config.primaryStrategy, ...(config.fallbackStrategies || [])];

    for (const strategy of strategies) {
      try {
        const result = await this.executeSingleFallbackStrategy(key, strategy, config);

        if (result.data !== null) {
          logger.info("Fallback strategy succeeded", {
            name: this.name,
            key,
            strategy,
            source: result.source,
          });

          return {
            ...result,
            strategy,
            error: null,
            fallbackUsed: true,
          };
        }
      } catch (error) {
        logger.warn("Fallback strategy failed", {
          name: this.name,
          key,
          strategy,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        if (config.onFallbackError) {
          config.onFallbackError(error as Error, strategy);
        }
      }
    }

    // All fallback strategies failed
    logger.error("All fallback strategies failed", {
      name: this.name,
      key,
      strategiesAttempted: strategies,
      primaryError: primaryError.message,
    });

    return {
      data: null,
      strategy: FallbackStrategy.FAIL_FAST,
      source: "none",
      timestamp: Date.now(),
      error: primaryError,
      fallbackUsed: true,
    };
  }

  /**
   * Execute a single fallback strategy
   * @param key Operation key
   * @param strategy Fallback strategy to execute
   * @param config Fallback configuration
   * @returns Fallback result
   */
  private async executeSingleFallbackStrategy<T>(
    key: string,
    strategy: FallbackStrategy,
    config: FallbackConfig<T>,
  ): Promise<{ data: T | null; source: string; timestamp: number }> {
    switch (strategy) {
      case FallbackStrategy.CACHED_DATA:
        return await this.getCachedFallback(key, config);

      case FallbackStrategy.DEFAULT_VALUES:
        return await this.getDefaultValuesFallback(config);

      case FallbackStrategy.OFFLINE_MODE:
        return await this.getOfflineFallback(config);

      case FallbackStrategy.DEGRADED_FUNCTIONALITY:
        return await this.getDegradedFallback(config);

      case FallbackStrategy.FAIL_FAST:
        throw new Error("Fail fast strategy - no fallback available");

      default:
        throw new Error(`Unknown fallback strategy: ${strategy}`);
    }
  }

  /**
   * Get cached data as fallback
   * @param key Operation key
   * @param config Fallback configuration
   * @returns Cached data result
   */
  private async getCachedFallback<T>(
    key: string,
    config: FallbackConfig<T>,
  ): Promise<{ data: T | null; source: string; timestamp: number }> {
    if (config.getCachedData) {
      // Use custom cached data provider
      const data = await config.getCachedData();
      return {
        data,
        source: "custom-cache",
        timestamp: Date.now(),
      };
    }

    // Use internal cache
    const cacheEntry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!cacheEntry) {
      throw new Error("No cached data available");
    }

    // Check cache age
    const maxAge = config.maxCacheAgeMs || 300000; // 5 minutes default
    const age = Date.now() - cacheEntry.timestamp;

    if (age > maxAge) {
      logger.warn("Cached data is stale", {
        name: this.name,
        key,
        ageMs: age,
        maxAgeMs: maxAge,
      });

      // Still return stale data if graceful degradation is enabled
      if (!config.enableGracefulDegradation) {
        throw new Error("Cached data is stale and graceful degradation is disabled");
      }
    }

    return {
      data: cacheEntry.data,
      source: `cache-${cacheEntry.source}`,
      timestamp: cacheEntry.timestamp,
    };
  }

  /**
   * Get default values as fallback
   * @param config Fallback configuration
   * @returns Default values result
   */
  private async getDefaultValuesFallback<T>(
    config: FallbackConfig<T>,
  ): Promise<{ data: T | null; source: string; timestamp: number }> {
    if (!config.getDefaultValues) {
      throw new Error("No default values provider configured");
    }

    const data = await config.getDefaultValues();
    return {
      data,
      source: "default-values",
      timestamp: Date.now(),
    };
  }

  /**
   * Get offline data as fallback
   * @param config Fallback configuration
   * @returns Offline data result
   */
  private async getOfflineFallback<T>(
    config: FallbackConfig<T>,
  ): Promise<{ data: T | null; source: string; timestamp: number }> {
    if (!config.getOfflineData) {
      throw new Error("No offline data provider configured");
    }

    const data = await config.getOfflineData();
    return {
      data,
      source: "offline",
      timestamp: Date.now(),
    };
  }

  /**
   * Get degraded functionality data as fallback
   * @param config Fallback configuration
   * @returns Degraded functionality result
   */
  private async getDegradedFallback<T>(
    config: FallbackConfig<T>,
  ): Promise<{ data: T | null; source: string; timestamp: number }> {
    if (!config.enableGracefulDegradation) {
      throw new Error("Graceful degradation is not enabled");
    }

    // For degraded functionality, we might return partial data or simplified responses
    // This is application-specific, so we'll use the offline data provider if available
    if (config.getOfflineData) {
      const data = await config.getOfflineData();
      return {
        data,
        source: "degraded",
        timestamp: Date.now(),
      };
    }

    throw new Error("No degraded functionality provider configured");
  }

  /**
   * Set cache entry for fallback use
   * @param key Cache key
   * @param data Data to cache
   * @param source Source of the data
   */
  private setCacheEntry<T>(key: string, data: T, source: string): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      source,
    });

    logger.debug("Cache entry updated", {
      name: this.name,
      key,
      source,
    });
  }

  /**
   * Clear cache entry
   * @param key Cache key to clear
   */
  public clearCacheEntry(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug("Cache entry cleared", {
        name: this.name,
        key,
      });
    }
  }

  /**
   * Clear all cache entries
   */
  public clearAllCache(): void {
    const size = this.cache.size;
    this.cache.clear();

    logger.info("All cache entries cleared", {
      name: this.name,
      entriesCleared: size,
    });
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  public getCacheStats(): {
    totalEntries: number;
    oldestEntryAge: number | null;
    newestEntryAge: number | null;
  } {
    if (this.cache.size === 0) {
      return {
        totalEntries: 0,
        oldestEntryAge: null,
        newestEntryAge: null,
      };
    }

    const now = Date.now();
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    for (const entry of this.cache.values()) {
      const cacheEntry = entry as CacheEntry<unknown>;
      oldestTimestamp = Math.min(oldestTimestamp, cacheEntry.timestamp);
      newestTimestamp = Math.max(newestTimestamp, cacheEntry.timestamp);
    }

    return {
      totalEntries: this.cache.size,
      oldestEntryAge: now - oldestTimestamp,
      newestEntryAge: now - newestTimestamp,
    };
  }
}

/**
 * Create a default fallback configuration for API operations
 * @param options Partial configuration options
 * @returns Complete fallback configuration
 */
export function createDefaultFallbackConfig<T>(
  options: Partial<FallbackConfig<T>> = {},
): FallbackConfig<T> {
  return {
    primaryStrategy: FallbackStrategy.CACHED_DATA,
    fallbackStrategies: [
      FallbackStrategy.DEFAULT_VALUES,
      FallbackStrategy.OFFLINE_MODE,
    ],
    maxCacheAgeMs: 300000, // 5 minutes
    enableGracefulDegradation: true,
    ...options,
  };
}

/**
 * Create a fallback configuration for feature flag operations
 * @param defaultFlags Default feature flags to use as fallback
 * @returns Fallback configuration for feature flags
 */
export function createFeatureFlagFallbackConfig(
  defaultFlags: Record<string, boolean> = {},
): FallbackConfig<Record<string, boolean>> {
  return createDefaultFallbackConfig({
    getDefaultValues: async () => defaultFlags,
    getOfflineData: async () => {
      // In offline mode, assume all flags are disabled for safety
      return Object.keys(defaultFlags).reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as Record<string, boolean>);
    },
  });
}
