import { loadEnvironment } from "../config/environment.ts";
import * as logger from "../utils/logger.ts";
import * as retry from "../utils/retry.ts";
import * as validation from "../utils/validation.ts";
import { Result } from "../utils/try-catch.ts";
import { CircuitBreaker, isApiErrorCritical } from "../utils/circuit-breaker.ts";
import {
  ApiHealthMonitor,
  createAuthenticatedHealthCheck,
  HealthStatus,
} from "../utils/api-health-monitor.ts";
import { ApiFallbackManager, createDefaultFallbackConfig } from "../utils/api-fallback.ts";
import { createDefaultRecoveryConfig, ErrorRecoveryManager } from "../utils/error-recovery.ts";
import {
  FlagConsistencyValidation,
  OptimizelyEnvironment,
  OptimizelyEnvironmentListItem,
  OptimizelyFlag,
  OptimizelyPaginatedResponse,
  OptimizelyProject,
} from "../types/optimizely.ts";

/**
 * Options for OptimizelyApiClient
 */
export interface OptimizelyApiClientOptions {
  /**
   * Base URL for Optimizely REST API
   */
  baseUrl?: string;
  /**
   * Maximum requests per second (rate limit)
   */
  maxRps?: number;
  /**
   * Maximum retry attempts for failed requests
   */
  maxRetries?: number;
  /**
   * Request timeout in milliseconds
   */
  timeoutMs?: number;
  /**
   * Enable graceful degradation on API failures
   */
  enableGracefulDegradation?: boolean;
}

/**
 * Optimizely API client supporting authentication, rate limiting, and error handling.
 */
export class OptimizelyApiClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly maxRps: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly enableGracefulDegradation: boolean;
  private lastRequestTime: number = 0;
  private tokenValidated: boolean = false;

  // Enhanced error handling components
  private readonly circuitBreaker: CircuitBreaker<unknown>;
  private readonly healthMonitor: ApiHealthMonitor;
  private readonly fallbackManager: ApiFallbackManager;
  private readonly errorRecoveryManager: ErrorRecoveryManager<unknown>;

  /**
   * Creates a new OptimizelyApiClient instance.
   * @param token API token for authentication
   * @param options Client configuration options
   */
  constructor(token: string, options: OptimizelyApiClientOptions = {}) {
    this.validateToken(token);
    this.token = token;
    this.baseUrl = options.baseUrl ?? "https://api.optimizely.com/v2";
    this.maxRps = Math.max(1, options.maxRps ?? 5);
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.timeoutMs = Math.max(1000, options.timeoutMs ?? 30000);
    this.enableGracefulDegradation = options.enableGracefulDegradation ?? true;

    // Initialize enhanced error handling components
    this.circuitBreaker = new CircuitBreaker(
      "optimizely-api-client",
      {
        failureThreshold: 5,
        resetTimeoutMs: 60000, // 1 minute
        timeoutMs: this.timeoutMs,
        isErrorCritical: isApiErrorCritical,
      },
    );

    this.healthMonitor = new ApiHealthMonitor(
      "optimizely-api",
      {
        degradedThresholdMs: 5000, // 5 seconds
        unhealthyThresholdMs: 10000, // 10 seconds
      },
    );

    this.fallbackManager = new ApiFallbackManager("optimizely-api-fallback");

    this.errorRecoveryManager = new ErrorRecoveryManager(
      "optimizely-api-recovery",
      createDefaultRecoveryConfig({
        fallbackConfig: createDefaultFallbackConfig({
          getDefaultValues: () => Promise.resolve(null),
          getOfflineData: () => Promise.resolve(null),
          enableGracefulDegradation: this.enableGracefulDegradation,
        }),
      }),
    );

    logger.debug("OptimizelyApiClient initialized with enhanced error handling", {
      baseUrl: this.baseUrl,
      maxRps: this.maxRps,
      maxRetries: this.maxRetries,
      timeoutMs: this.timeoutMs,
      enableGracefulDegradation: this.enableGracefulDegradation,
    });
  }

  /**
   * Factory method to create OptimizelyApiClient with environment configuration.
   * @param options Client configuration options
   * @returns Promise resolving to OptimizelyApiClient instance
   */
  static async create(options: OptimizelyApiClientOptions = {}): Promise<OptimizelyApiClient> {
    const env = await loadEnvironment();
    return new OptimizelyApiClient(env.OPTIMIZELY_API_TOKEN, options);
  }

  /**
   * Validates the API token format and structure.
   * @param token API token to validate
   * @throws Error if token is invalid
   */
  private validateToken(token: string): void {
    if (!token || typeof token !== "string") {
      throw new Error("Optimizely API token is required and must be a string");
    }

    if (token.length < 10) {
      throw new Error("Optimizely API token appears to be invalid (too short)");
    }

    // Check for common token patterns (basic validation)
    if (token.includes(" ") || token.includes("\n") || token.includes("\t")) {
      throw new Error("Optimizely API token contains invalid characters");
    }
  }

  /**
   * Validates the API token by making a test request.
   * @returns Promise resolving to validation result
   */
  async validateTokenAccess(): Promise<Result<boolean, Error>> {
    if (this.tokenValidated) {
      return { data: true, error: null };
    }

    try {
      const result = await this.request<OptimizelyProject>("/projects", {
        method: "GET",
      });

      if (result.error) {
        logger.warn("Token validation failed", { error: result.error.message });
        return { data: null, error: result.error };
      }

      this.tokenValidated = true;
      logger.info("Optimizely API token validated successfully");
      return { data: true, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Token validation error", { error: errorMsg });
      return { data: null, error: new Error(`Token validation failed: ${errorMsg}`) };
    }
  }

  /**
   * Makes an authenticated request to the Optimizely API with rate limiting and error handling.
   * @param path API endpoint path (relative to baseUrl)
   * @param init Fetch options
   * @returns Result object with data or error
   */
  async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<Result<T, Error>> {
    try {
      validation.validateApiPath(path);
      await this.#rateLimit();

      const url = `${this.baseUrl}${path}`;
      const headers = {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "Optimizely-Flag-Sync/1.0",
        ...(init.headers || {}),
      };

      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const fetchRequest = async (): Promise<T> => {
        try {
          const response = await fetch(url, {
            ...init,
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorBody = await response.text();
            const errorMessage = this.#parseErrorResponse(response, errorBody);

            logger.error("Optimizely API error", {
              status: response.status,
              statusText: response.statusText,
              path,
              error: errorBody,
            });

            // Handle specific HTTP errors
            if (response.status === 401) {
              this.tokenValidated = false;
              throw new Error("Authentication failed: Invalid or expired API token");
            } else if (response.status === 403) {
              throw new Error("Authorization failed: Insufficient permissions for this operation");
            } else if (response.status === 404) {
              throw new Error(`Resource not found: ${path}`);
            } else if (response.status === 429) {
              throw new Error("Rate limit exceeded: Too many requests");
            } else if (response.status >= 500) {
              throw new Error(
                `Optimizely API server error: ${response.status} ${response.statusText}`,
              );
            }

            throw new Error(errorMessage);
          }

          const responseData = await response.json() as T;

          // Validate response structure
          this.#validateResponse(responseData);

          logger.debug("Optimizely API request successful", {
            path,
            status: response.status,
          });

          return responseData;
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error(`Request timeout after ${this.timeoutMs}ms`);
          }
          throw error;
        }
      };

      return await retry.withExponentialBackoff<T, Error>(
        fetchRequest,
        this.maxRetries,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      if (this.enableGracefulDegradation) {
        logger.warn("API request failed, graceful degradation enabled", {
          path,
          error: errorMsg,
        });
      }

      return {
        data: null,
        error: error instanceof Error ? error : new Error(errorMsg),
      };
    }
  }

  /**
   * Fetches all feature flags for the configured Optimizely project.
   * Handles API pagination to ensure all flags are retrieved.
   * @returns Result object with array of OptimizelyFlag or error
   */
  async getAllFeatureFlags(): Promise<Result<OptimizelyFlag[], Error>> {
    try {
      const env = await loadEnvironment();
      const projectId = env.OPTIMIZELY_PROJECT_ID;

      if (!projectId) {
        return {
          data: null,
          error: new Error("OPTIMIZELY_PROJECT_ID environment variable is required"),
        };
      }

      const allFlags: OptimizelyFlag[] = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        // Construct path with page-based pagination
        const basePath = `/flags/v1/projects/${encodeURIComponent(projectId)}/flags`;
        const path = currentPage > 1 ? `${basePath}?page=${currentPage}` : basePath;

        const result = await this.request<OptimizelyPaginatedResponse<OptimizelyFlag>>(path);

        if (result.error) {
          logger.error("Failed to fetch feature flags", {
            projectId,
            page: currentPage,
            error: result.error.message,
          });
          return { data: null, error: result.error };
        }

        const response = result.data;
        const flags = response?.items ?? [];
        allFlags.push(...flags);

        // Update pagination info from response
        totalPages = response?.total_pages ?? 1;
        currentPage++;

        logger.debug("Fetched feature flags page", {
          projectId,
          page: currentPage - 1,
          flagsOnPage: flags.length,
          totalFlagsSoFar: allFlags.length,
          totalPages,
          hasMorePages: currentPage <= totalPages,
        });

        // Safety check to prevent infinite loops
        if (currentPage > 100) {
          logger.warn("Reached maximum page limit while fetching flags", {
            projectId,
            currentPage,
            totalFlags: allFlags.length,
          });
          break;
        }
      } while (currentPage <= totalPages);

      logger.info(
        `Successfully fetched ${allFlags.length} feature flags across ${currentPage - 1} pages`,
        {
          projectId,
          flagCount: allFlags.length,
          pageCount: currentPage - 1,
          totalPages,
        },
      );

      return { data: allFlags, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in getAllFeatureFlags", { error: errorMsg });
      return {
        data: null,
        error: new Error(`Failed to fetch feature flags: ${errorMsg}`),
      };
    }
  }

  /**
   * Archives one or more feature flags by their keys.
   * @param flagKeys Array of flag keys to archive, or single flag key
   * @returns Result object with archived flags data or error
   */
  async archiveFeatureFlags(
    flagKeys: string[] | string,
  ): Promise<Result<Record<string, OptimizelyFlag>, Error>> {
    try {
      const keysArray = Array.isArray(flagKeys) ? flagKeys : [flagKeys];

      if (keysArray.length === 0) {
        return {
          data: null,
          error: new Error("At least one flag key is required"),
        };
      }

      // Validate all flag keys
      for (const key of keysArray) {
        if (!key || typeof key !== "string") {
          return {
            data: null,
            error: new Error("All flag keys must be non-empty strings"),
          };
        }
      }

      const env = await loadEnvironment();
      const projectId = env.OPTIMIZELY_PROJECT_ID;

      if (!projectId) {
        return {
          data: null,
          error: new Error("OPTIMIZELY_PROJECT_ID environment variable is required"),
        };
      }

      const path = `/flags/v1/projects/${encodeURIComponent(projectId)}/flags/archived`;
      const result = await this.request<Record<string, OptimizelyFlag>>(path, {
        method: "POST",
        body: JSON.stringify({ keys: keysArray }),
      });

      if (result.error) {
        logger.error("Failed to archive feature flags", {
          flagKeys: keysArray,
          projectId,
          error: result.error.message,
        });
        return { data: null, error: result.error };
      }

      logger.info("Successfully archived feature flags", {
        flagKeys: keysArray,
        projectId,
        archivedCount: Object.keys(result.data || {}).length,
      });

      return { data: result.data, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in archiveFeatureFlags", { flagKeys, error: errorMsg });
      return {
        data: null,
        error: new Error(`Failed to archive flags: ${errorMsg}`),
      };
    }
  }

  /**
   * Archives a single feature flag by its key.
   * @param flagKey The key of the flag to archive
   * @returns Result object with success status or error
   */
  async archiveFeatureFlag(flagKey: string): Promise<Result<boolean, Error>> {
    const result = await this.archiveFeatureFlags([flagKey]);

    if (result.error) {
      return { data: null, error: result.error };
    }

    const archived = result.data && Object.keys(result.data).length > 0;
    return { data: archived, error: null };
  }

  /**
   * Unarchives one or more feature flags by their keys.
   * @param flagKeys Array of flag keys to unarchive, or single flag key
   * @returns Result object with unarchived flags data or error
   */
  async unarchiveFeatureFlags(
    flagKeys: string[] | string,
  ): Promise<Result<Record<string, OptimizelyFlag>, Error>> {
    try {
      const keysArray = Array.isArray(flagKeys) ? flagKeys : [flagKeys];

      if (keysArray.length === 0) {
        return {
          data: null,
          error: new Error("At least one flag key is required"),
        };
      }

      // Validate all flag keys
      for (const key of keysArray) {
        if (!key || typeof key !== "string") {
          return {
            data: null,
            error: new Error("All flag keys must be non-empty strings"),
          };
        }
      }

      const env = await loadEnvironment();
      const projectId = env.OPTIMIZELY_PROJECT_ID;

      if (!projectId) {
        return {
          data: null,
          error: new Error("OPTIMIZELY_PROJECT_ID environment variable is required"),
        };
      }

      const path = `/flags/v1/projects/${encodeURIComponent(projectId)}/flags/unarchived`;
      const result = await this.request<Record<string, OptimizelyFlag>>(path, {
        method: "POST",
        body: JSON.stringify({ keys: keysArray }),
      });

      if (result.error) {
        logger.error("Failed to unarchive feature flags", {
          flagKeys: keysArray,
          projectId,
          error: result.error.message,
        });
        return { data: null, error: result.error };
      }

      logger.info("Successfully unarchived feature flags", {
        flagKeys: keysArray,
        projectId,
        unarchivedCount: Object.keys(result.data || {}).length,
      });

      return { data: result.data, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in unarchiveFeatureFlags", { flagKeys, error: errorMsg });
      return {
        data: null,
        error: new Error(`Failed to unarchive flags: ${errorMsg}`),
      };
    }
  }

  /**
   * Unarchives a single feature flag by its key.
   * @param flagKey The key of the flag to unarchive
   * @returns Result object with success status or error
   */
  async unarchiveFeatureFlag(flagKey: string): Promise<Result<boolean, Error>> {
    const result = await this.unarchiveFeatureFlags([flagKey]);

    if (result.error) {
      return { data: null, error: result.error };
    }

    const unarchived = result.data && Object.keys(result.data).length > 0;
    return { data: unarchived, error: null };
  }

  /**
   * Fetches detailed information for a specific feature flag.
   * @param flagKey The key of the flag to fetch
   * @returns Result object with detailed flag data or error
   */
  async getFlagDetails(flagKey: string): Promise<Result<OptimizelyFlag, Error>> {
    try {
      if (!flagKey || typeof flagKey !== "string") {
        return {
          data: null,
          error: new Error("Flag key is required and must be a string"),
        };
      }

      const env = await loadEnvironment();
      const projectId = env.OPTIMIZELY_PROJECT_ID;

      if (!projectId) {
        return {
          data: null,
          error: new Error("OPTIMIZELY_PROJECT_ID environment variable is required"),
        };
      }

      const path = `/flags/v1/projects/${encodeURIComponent(projectId)}/flags/${
        encodeURIComponent(flagKey)
      }`;
      const result = await this.request<OptimizelyFlag>(path, {
        method: "GET",
      });

      if (result.error) {
        logger.error("Failed to fetch flag details", {
          flagKey,
          projectId,
          error: result.error.message,
        });
        return { data: null, error: result.error };
      }

      logger.debug("Successfully fetched flag details", {
        flagKey,
        projectId,
        hasEnvironments: !!result.data?.environments,
        environmentCount: result.data?.environments
          ? Object.keys(result.data.environments).length
          : 0,
      });

      return { data: result.data, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in getFlagDetails", { flagKey, error: errorMsg });
      return {
        data: null,
        error: new Error(`Failed to fetch flag details for ${flagKey}: ${errorMsg}`),
      };
    }
  }

  /**
   * Fetches environment-specific flag status for a given flag key.
   * @param flagKey The feature flag key to check
   * @param environmentKey The environment key to check status for
   * @returns Result object with environment-specific flag data or error
   */
  async getFlagStatusInEnvironment(
    flagKey: string,
    environmentKey: string,
  ): Promise<Result<OptimizelyEnvironment, Error>> {
    try {
      if (!flagKey || typeof flagKey !== "string") {
        return {
          data: null,
          error: new Error("Flag key is required and must be a string"),
        };
      }

      if (!environmentKey || typeof environmentKey !== "string") {
        return {
          data: null,
          error: new Error("Environment key is required and must be a string"),
        };
      }

      const env = await loadEnvironment();
      const projectId = env.OPTIMIZELY_PROJECT_ID;

      if (!projectId) {
        return {
          data: null,
          error: new Error("OPTIMIZELY_PROJECT_ID environment variable is required"),
        };
      }

      const path = `/flags/v1/projects/${encodeURIComponent(projectId)}/flags/${
        encodeURIComponent(flagKey)
      }/environments/${encodeURIComponent(environmentKey)}`;
      const result = await this.request<OptimizelyEnvironment>(path, {
        method: "GET",
      });

      if (result.error) {
        logger.error("Failed to fetch flag status in environment", {
          flagKey,
          environmentKey,
          projectId,
          error: result.error.message,
        });
        return { data: null, error: result.error };
      }

      logger.debug("Successfully fetched flag status in environment", {
        flagKey,
        environmentKey,
        enabled: result.data?.enabled,
        status: result.data?.status,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in getFlagStatusInEnvironment", {
        flagKey,
        environmentKey,
        error: errorMsg,
      });
      return {
        data: null,
        error: new Error(
          `Failed to fetch flag status for ${flagKey} in environment ${environmentKey}: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * Fetches flag status across all environments for consistency checking.
   * @param flagKey The feature flag key to check across environments
   * @returns Result object with environment status map or error
   */
  async getFlagStatusAcrossEnvironments(
    flagKey: string,
  ): Promise<Result<Record<string, OptimizelyEnvironment>, Error>> {
    try {
      if (!flagKey || typeof flagKey !== "string") {
        return {
          data: null,
          error: new Error("Flag key is required and must be a string"),
        };
      }

      // First, get all environments
      const environmentsResult = await this.getEnvironments();
      if (environmentsResult.error || !environmentsResult.data) {
        return {
          data: null,
          error: environmentsResult.error || new Error("Failed to fetch environments"),
        };
      }

      const environments = environmentsResult.data;
      const environmentStatusMap: Record<string, OptimizelyEnvironment> = {};
      const errors: string[] = [];

      // Fetch flag status for each environment
      for (const environment of environments) {
        const statusResult = await this.getFlagStatusInEnvironment(flagKey, environment.key);

        if (statusResult.error) {
          errors.push(`Environment ${environment.key}: ${statusResult.error.message}`);
          logger.warn("Failed to fetch flag status for environment", {
            flagKey,
            environmentKey: environment.key,
            error: statusResult.error.message,
          });
        } else if (statusResult.data) {
          environmentStatusMap[environment.key] = statusResult.data;
        }
      }

      // If we have partial data, still return it but log warnings
      if (errors.length > 0) {
        logger.warn("Some environment status checks failed", {
          flagKey,
          failedEnvironments: errors.length,
          totalEnvironments: environments.length,
          errors,
        });
      }

      logger.debug("Successfully fetched flag status across environments", {
        flagKey,
        environmentCount: Object.keys(environmentStatusMap).length,
        environments: Object.keys(environmentStatusMap),
      });

      return { data: environmentStatusMap, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in getFlagStatusAcrossEnvironments", {
        flagKey,
        error: errorMsg,
      });
      return {
        data: null,
        error: new Error(
          `Failed to fetch flag status across environments for ${flagKey}: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * Validates flag configuration consistency across environments.
   * @param flagKey The feature flag key to validate
   * @returns Result object with validation results or error
   */
  async validateFlagConsistency(
    flagKey: string,
  ): Promise<Result<FlagConsistencyValidation, Error>> {
    try {
      if (!flagKey || typeof flagKey !== "string") {
        return {
          data: null,
          error: new Error("Flag key is required and must be a string"),
        };
      }

      const statusResult = await this.getFlagStatusAcrossEnvironments(flagKey);
      if (statusResult.error || !statusResult.data) {
        return {
          data: null,
          error: statusResult.error || new Error("Failed to fetch flag status across environments"),
        };
      }

      const environmentStatuses = statusResult.data;
      const environments = Object.keys(environmentStatuses);

      if (environments.length === 0) {
        return {
          data: null,
          error: new Error(`No environment data found for flag ${flagKey}`),
        };
      }

      const validation: FlagConsistencyValidation = {
        flagKey,
        isConsistent: true,
        environments: {},
        inconsistencies: [],
        summary: {
          totalEnvironments: environments.length,
          enabledEnvironments: 0,
          disabledEnvironments: 0,
          archivedEnvironments: 0,
        },
      };

      // Analyze each environment
      for (const [envKey, envData] of Object.entries(environmentStatuses)) {
        validation.environments[envKey] = {
          key: envKey,
          name: envData.name,
          enabled: envData.enabled,
          status: envData.status,
          hasTargetingRules: !!(envData.rolloutRules && envData.rolloutRules.length > 0),
          priority: envData.priority,
        };

        // Update summary counts
        if (envData.enabled) {
          validation.summary.enabledEnvironments++;
        } else {
          validation.summary.disabledEnvironments++;
        }

        // Check for archived status
        if (envData.status === "archived") {
          validation.summary.archivedEnvironments++;
        }
      }

      // Check for inconsistencies
      const enabledStatuses = environments.map((env) => environmentStatuses[env].enabled);
      const statuses = environments.map((env) => environmentStatuses[env].status);

      // Check if all environments have the same enabled status
      const allEnabled = enabledStatuses.every((status) => status === true);
      const allDisabled = enabledStatuses.every((status) => status === false);
      const mixedEnabled = !allEnabled && !allDisabled;

      if (mixedEnabled) {
        validation.isConsistent = false;
        validation.inconsistencies.push({
          type: "mixed_enabled_status",
          message: "Flag has mixed enabled/disabled status across environments",
          affectedEnvironments: environments.filter((_env, idx) =>
            enabledStatuses[idx] !== enabledStatuses[0]
          ),
        });
      }

      // Check for different statuses
      const uniqueStatuses = [...new Set(statuses)];
      if (uniqueStatuses.length > 1) {
        validation.isConsistent = false;
        validation.inconsistencies.push({
          type: "mixed_status",
          message: `Flag has different statuses across environments: ${uniqueStatuses.join(", ")}`,
          affectedEnvironments: environments,
        });
      }

      logger.debug("Flag consistency validation completed", {
        flagKey,
        isConsistent: validation.isConsistent,
        inconsistencyCount: validation.inconsistencies.length,
        summary: validation.summary,
      });

      return { data: validation, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in validateFlagConsistency", {
        flagKey,
        error: errorMsg,
      });
      return {
        data: null,
        error: new Error(
          `Failed to validate flag consistency for ${flagKey}: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * Fetches all environments for the configured Optimizely project.
   * @returns Result object with array of OptimizelyEnvironmentListItem or error
   */
  async getEnvironments(): Promise<Result<OptimizelyEnvironmentListItem[], Error>> {
    try {
      const env = await loadEnvironment();
      const projectId = env.OPTIMIZELY_PROJECT_ID;

      if (!projectId) {
        return {
          data: null,
          error: new Error("OPTIMIZELY_PROJECT_ID environment variable is required"),
        };
      }

      const path = `/flags/v1/projects/${encodeURIComponent(projectId)}/environments`;
      const result = await this.request<OptimizelyPaginatedResponse<OptimizelyEnvironmentListItem>>(
        path,
        {
          method: "GET",
        },
      );

      if (result.error) {
        logger.error("Failed to fetch environments", {
          projectId,
          error: result.error.message,
        });
        return { data: null, error: result.error };
      }

      const environments = result.data?.items ?? [];

      logger.debug("Successfully fetched environments", {
        projectId,
        environmentCount: environments.length,
        environments: environments.map((env) => ({ key: env.key, name: env.name })),
      });

      return { data: environments, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in getEnvironments", { error: errorMsg });
      return {
        data: null,
        error: new Error(`Failed to fetch environments: ${errorMsg}`),
      };
    }
  }

  /**
   * Parses error response from Optimizely API.
   * @param response HTTP response object
   * @param errorBody Response body text
   * @returns Formatted error message
   */
  #parseErrorResponse(response: Response, errorBody: string): string {
    try {
      const errorData = JSON.parse(errorBody);
      if (errorData.message) {
        return `${response.status}: ${errorData.message}`;
      }
      if (errorData.error && errorData.error.message) {
        return `${response.status}: ${errorData.error.message}`;
      }
    } catch {
      // Failed to parse JSON, use raw error body
    }

    return `${response.status} ${response.statusText}: ${errorBody}`;
  }

  /**
   * Validates API response structure.
   * @param response Response data to validate
   * @throws Error if response is invalid
   */
  #validateResponse(response: unknown): void {
    if (response === null || response === undefined) {
      throw new Error("Received null or undefined response from Optimizely API");
    }

    if (typeof response !== "object") {
      throw new Error("Expected object response from Optimizely API");
    }
  }

  /**
   * Implements rate limiting to respect API rate limits.
   * @returns Promise that resolves when rate limit allows next request
   */
  async #rateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.maxRps;
    const elapsed = now - this.lastRequestTime;

    if (elapsed < minInterval) {
      const delay = minInterval - elapsed;
      logger.debug("Rate limiting: delaying request", { delayMs: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  // Enhanced Error Handling and Monitoring Methods

  /**
   * Perform a health check on the Optimizely API
   * @returns Health check result
   */
  async performHealthCheck(): Promise<Result<HealthStatus, Error>> {
    try {
      const healthCheckFn = createAuthenticatedHealthCheck(
        `${this.baseUrl}/projects`,
        this.token,
      );

      const result = await this.healthMonitor.performHealthCheck(healthCheckFn);

      logger.debug("API health check completed", {
        status: result.status,
        responseTimeMs: result.responseTimeMs,
        error: result.error,
      });

      return { data: result.status, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Health check failed", { error: errorMsg });
      return { data: null, error: new Error(`Health check failed: ${errorMsg}`) };
    }
  }

  /**
   * Get comprehensive API health statistics
   * @returns Health statistics
   */
  getHealthStats() {
    return this.healthMonitor.getHealthStats();
  }

  /**
   * Get circuit breaker statistics
   * @returns Circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Get error recovery statistics
   * @returns Error recovery statistics
   */
  getErrorRecoveryStats() {
    return {
      circuitBreaker: this.errorRecoveryManager.getCircuitBreakerStats(),
      health: this.errorRecoveryManager.getHealthStats(),
      fallback: this.errorRecoveryManager.getFallbackStats(),
    };
  }

  /**
   * Reset all error handling mechanisms (circuit breaker, health monitor, fallback cache)
   */
  resetErrorHandling(): void {
    this.circuitBreaker.reset();
    this.healthMonitor.reset();
    this.fallbackManager.clearAllCache();
    this.errorRecoveryManager.reset();

    logger.info("All error handling mechanisms reset");
  }

  /**
   * Check if the API is currently available (circuit breaker is closed)
   * @returns True if API is available
   */
  isApiAvailable(): boolean {
    return this.circuitBreaker.isAcceptingRequests() && this.healthMonitor.isAvailable();
  }

  /**
   * Force circuit breaker to open state (for testing or emergency scenarios)
   */
  forceCircuitBreakerOpen(): void {
    this.circuitBreaker.forceOpen();
    logger.warn("Circuit breaker manually forced to OPEN state");
  }

  /**
   * Execute a request with comprehensive error recovery
   * @param operationKey Unique key for the operation
   * @param operation Operation to execute
   * @returns Recovery result
   */
  async executeWithRecovery<T>(
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<Result<T, Error>> {
    try {
      const recoveryResult = await this.errorRecoveryManager.executeWithRecovery(
        operationKey,
        operation,
      );

      if (recoveryResult.recovered && recoveryResult.data !== null) {
        logger.info("Operation recovered successfully", {
          operationKey,
          strategy: recoveryResult.successfulStrategy,
          attempts: recoveryResult.recoveryAttempts,
          totalTimeMs: recoveryResult.totalTimeMs,
        });
        return { data: recoveryResult.data as T, error: null };
      } else {
        logger.error("Operation recovery failed", {
          operationKey,
          attemptedStrategies: recoveryResult.attemptedStrategies,
          attempts: recoveryResult.recoveryAttempts,
          totalTimeMs: recoveryResult.totalTimeMs,
          error: recoveryResult.error?.message,
        });
        return {
          data: null,
          error: recoveryResult.error || new Error("Recovery failed with unknown error"),
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in executeWithRecovery", { operationKey, error: errorMsg });
      return { data: null, error: new Error(`Recovery execution failed: ${errorMsg}`) };
    }
  }

  /**
   * Get all feature flags with enhanced error recovery
   * @returns Result with feature flags or error with fallback handling
   */
  async getAllFeatureFlagsWithRecovery(): Promise<Result<OptimizelyFlag[], Error>> {
    return await this.executeWithRecovery(
      "getAllFeatureFlags",
      () =>
        this.getAllFeatureFlags().then((result) => {
          if (result.error) {
            throw result.error;
          }
          return result.data!;
        }),
    );
  }

  /**
   * Archive feature flags with enhanced error recovery
   * @param flagKeys Flag keys to archive
   * @returns Result with archived flags or error with fallback handling
   */
  async archiveFeatureFlagsWithRecovery(
    flagKeys: string[] | string,
  ): Promise<Result<Record<string, OptimizelyFlag>, Error>> {
    return await this.executeWithRecovery(
      `archiveFeatureFlags-${Array.isArray(flagKeys) ? flagKeys.join(",") : flagKeys}`,
      () =>
        this.archiveFeatureFlags(flagKeys).then((result) => {
          if (result.error) {
            throw result.error;
          }
          return result.data!;
        }),
    );
  }

  /**
   * Get comprehensive API status report
   * @returns API status report
   */
  getApiStatusReport() {
    const healthStats = this.getHealthStats();
    const circuitBreakerStats = this.getCircuitBreakerStats();
    const fallbackStats = this.fallbackManager.getCacheStats();

    return {
      timestamp: Date.now(),
      health: {
        status: healthStats.currentStatus,
        uptime: healthStats.uptime,
        averageResponseTime: healthStats.averageResponseTimeMs,
        successRate: healthStats.successRate,
        totalChecks: healthStats.totalChecks,
        lastCheckTime: healthStats.lastCheckTime,
      },
      circuitBreaker: {
        state: circuitBreakerStats.state,
        failureCount: circuitBreakerStats.failureCount,
        successCount: circuitBreakerStats.successCount,
        totalRequests: circuitBreakerStats.totalRequests,
        lastFailureTime: circuitBreakerStats.lastFailureTime,
      },
      fallback: {
        totalEntries: fallbackStats.totalEntries,
        oldestEntryAge: fallbackStats.oldestEntryAge,
        newestEntryAge: fallbackStats.newestEntryAge,
      },
      api: {
        isAvailable: this.isApiAvailable(),
        tokenValidated: this.tokenValidated,
        baseUrl: this.baseUrl,
        maxRps: this.maxRps,
        timeoutMs: this.timeoutMs,
        gracefulDegradation: this.enableGracefulDegradation,
      },
    };
  }
}
