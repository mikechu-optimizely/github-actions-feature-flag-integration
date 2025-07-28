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
  /** Numeric ID for the flag */
  id: number;
  /** URN identifier */
  urn: string;
  /** Project ID this flag belongs to */
  project_id: number;
  /** Account ID */
  account_id: number;
  /** User ID who created the flag */
  created_by_user_id: string;
  /** Email of user who created the flag */
  created_by_user_email: string;
  /** User role */
  role: string;
  /** Creation timestamp */
  created_time: string;
  /** Last update timestamp */
  updated_time: string;
  /** Revision number */
  revision: number;
  /** Whether outlier filtering is enabled */
  outlier_filtering_enabled: boolean;
  /** Environment-specific configurations */
  environments?: Record<string, OptimizelyEnvironment>;
  /** Variable definitions for the flag */
  variable_definitions?: Record<string, OptimizelyVariableDefinition>;
  /** URLs for various operations */
  update_url?: string;
  delete_url?: string;
  archive_url?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Variable definition for feature flags
 */
export interface OptimizelyVariableDefinition {
  /** Variable key */
  key: string;
  /** Variable description */
  description: string;
  /** Variable type */
  type: string;
  /** Default value */
  default_value: string;
  /** Creation timestamp */
  created_time: string;
  /** Last update timestamp */
  updated_time: string;
}

/**
 * Optimizely Environment configuration
 */
export interface OptimizelyEnvironment {
  /** Environment key */
  key: string;
  /** Environment name */
  name: string;
  /** Whether the flag is enabled in this environment */
  enabled: boolean;
  /** Environment ID */
  id: number;
  /** Whether the environment has restricted permissions */
  has_restricted_permissions: boolean;
  /** Priority level */
  priority: number;
  /** Current status */
  status: string;
  /** Rules summary */
  rules_summary?: Record<string, unknown>;
  /** Detailed rules */
  rules_detail?: Array<Record<string, unknown>>;
  /** Creation timestamp */
  created_time: string;
  /** URL to enable environment */
  enable_url?: string;
  /** URL to disable environment */
  disable_url?: string;
  /** Rollout rules and targeting */
  rolloutRules?: Array<{
    audienceIds?: string[];
    percentage: number;
  }>;
  /** Additional environment metadata */
  [key: string]: unknown;
}

/**
 * Optimizely Environment from environments list API
 */
export interface OptimizelyEnvironmentListItem {
  /** Environment key */
  key: string;
  /** Environment name */
  name: string;
  /** Whether the environment is archived */
  archived: boolean;
  /** Priority level */
  priority: number;
  /** Account ID */
  account_id: number;
  /** Project ID */
  project_id: number;
  /** User role */
  role: string;
  /** Environment ID */
  id: number;
  /** Whether the environment has restricted permissions */
  has_restricted_permissions: boolean;
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
  /** API URL for this resource */
  url: string;
  /** URL template for fetching individual flags */
  fetch_flag_url?: string;
  /** Array of items */
  items: T[];
  /** URL to create new items */
  create_url: string;
  /** URL for last page */
  last_url: string;
  /** URL for first page */
  first_url: string;
  /** Number of items on current page */
  count: number;
  /** Total number of pages */
  total_pages: number;
  /** Total count of all items */
  total_count: number;
  /** Current page number */
  page: number;
  /** Next page token for pagination (if using token-based pagination) */
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
