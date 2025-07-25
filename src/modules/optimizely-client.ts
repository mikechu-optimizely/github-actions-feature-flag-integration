import { loadEnvironment } from "../config/environment.ts";
import * as logger from "../utils/logger.ts";
import * as retry from "../utils/retry.ts";
import * as validation from "../utils/validation.ts";
import { Result } from "../utils/try-catch.ts";

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
}

/**
 * Optimizely Feature Flag object (partial, extend as needed)
 */
export interface OptimizelyFlag {
  key: string;
  name: string;
  description?: string;
  url: string;
  archived: boolean;
  environments?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Optimizely API client supporting authentication, rate limiting, and error handling.
 */
export class OptimizelyApiClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly maxRps: number;
  private readonly maxRetries: number;
  private lastRequestTime: number = 0;

  /**
   * Creates a new OptimizelyApiClient instance.
   * @param token API token for authentication
   * @param options Client configuration options
   */
  constructor(token: string, options: OptimizelyApiClientOptions = {}) {
    this.token = token;
    this.baseUrl = options.baseUrl ?? "https://api.optimizely.com/v2";
    this.maxRps = options.maxRps ?? 5;
    this.maxRetries = options.maxRetries ?? 3;
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
   * Makes an authenticated request to the Optimizely API with rate limiting and error handling.
   * @param path API endpoint path (relative to baseUrl)
   * @param init Fetch options
   * @returns Result object with data or error
   */
  async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<Result<T, Error>> {
    validation.validateApiPath(path);
    await this.#rateLimit();
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    const fetchRequest = async () => {
      const response = await fetch(url, { ...init, headers });
      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          `Optimizely API error: ${response.status} ${response.statusText} - ${errorBody}`,
        );
        throw new Error(
          `Optimizely API error: ${response.status} ${response.statusText}`,
        );
      }
      return await response.json() as T;
    };
    return await retry.withExponentialBackoff<T, Error>(
      fetchRequest,
      this.maxRetries,
    );
  }

  /**
   * Fetches all feature flags for the configured Optimizely project.
   * @returns Result object with array of OptimizelyFlag or error
   */
  async getAllFeatureFlags(): Promise<Result<OptimizelyFlag[], Error>> {
    const env = await loadEnvironment();
    const projectId = env.OPTIMIZELY_PROJECT_ID;
    const path = `/flags/v1/projects/${encodeURIComponent(projectId)}/flags`;
    const result = await this.request<{ items: OptimizelyFlag[] }>(path);
    if (result.error) return { data: null, error: result.error };
    return { data: result.data?.items ?? [], error: null };
  }

  async #rateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.maxRps;
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minInterval) {
      await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}
