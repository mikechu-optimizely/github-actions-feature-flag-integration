import { loadEnvironmentVariables } from "../config/environment.ts";
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
   * @param options Client configuration options
   */
  constructor(options: OptimizelyApiClientOptions = {}) {
    const env = loadEnvironmentVariables();
    this.token = env.OPTIMIZELY_API_TOKEN;
    this.baseUrl = options.baseUrl ?? "https://api.optimizely.com/v2";
    this.maxRps = options.maxRps ?? 5;
    this.maxRetries = options.maxRetries ?? 3;
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
    } catch (error) {
      return { data: null, error: error as Error };
    }
  }

  async #rateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.maxRps;
    const elapsed = now - this.lastRequestTime;
    if (elapsed < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - elapsed)
      );
    }
    this.lastRequestTime = Date.now();
  }
}
