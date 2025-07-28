/**
 * Optimizely API response types and interfaces
 */

/**
 * Optimizely Feature Flag object
 */
export interface OptimizelyFlag {
  /** Unique key for the feature flag */
  key: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** API URL for this flag */
  url: string;
  /** Whether the flag is archived */
  archived: boolean;
  /** Environment-specific configurations */
  environments?: Record<string, OptimizelyEnvironment>;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Optimizely Environment configuration
 */
export interface OptimizelyEnvironment {
  /** Environment key */
  key: string;
  /** Whether the flag is enabled in this environment */
  enabled: boolean;
  /** Rollout rules and targeting */
  rolloutRules?: Array<{
    audienceIds?: string[];
    percentage: number;
  }>;
  /** Additional environment metadata */
  [key: string]: unknown;
}

/**
 * Optimizely Project object
 */
export interface OptimizelyProject {
  /** Project ID */
  id: string;
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Available environments */
  environments?: OptimizelyEnvironment[];
  /** Additional project metadata */
  [key: string]: unknown;
}

/**
 * Optimizely API pagination response wrapper
 */
export interface OptimizelyPaginatedResponse<T> {
  /** Array of items */
  items: T[];
  /** Total count of items */
  totalCount?: number;
  /** Next page token for pagination */
  nextPageToken?: string;
}

/**
 * Optimizely API error response
 */
export interface OptimizelyApiError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}
