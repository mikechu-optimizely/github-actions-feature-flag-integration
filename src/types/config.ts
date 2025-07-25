/**
 * Configuration types for the feature flag synchronization system.
 * Defines interfaces for environment configuration, flag sync configuration, and operation types.
 */

/**
 * Supported operation types for the flag synchronization system.
 */
export type OperationType = "cleanup" | "audit";

/**
 * Supported log levels.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Environment configuration loaded from environment variables.
 */
export interface EnvironmentConfig {
  // Required Optimizely configuration
  OPTIMIZELY_API_TOKEN: string;
  OPTIMIZELY_PROJECT_ID: string;
  
  // Operation configuration
  ENVIRONMENT: string;
  OPERATION: OperationType;
  DRY_RUN: boolean;
  REPORTS_PATH: string;
  LOG_LEVEL: string;
  
  // API configuration
  API_RATE_LIMIT: number;
  API_TIMEOUT: number;
  MAX_RETRIES: number;
  CONCURRENCY_LIMIT: number;
  
  // Optional GitHub integration
  GITHUB_TOKEN?: string;
  GITHUB_RUN_ID?: string;
}

/**
 * Configuration for the Optimizely API client.
 */
export interface OptimizelyClientConfig {
  apiToken: string;
  projectId: string;
  rateLimit: number;
  timeout: number;
  maxRetries: number;
  baseUrl?: string;
}

/**
 * Configuration for code analysis operations.
 */
export interface CodeAnalysisConfig {
  workspaceRoot: string;
  excludePatterns: string[];
  includePatterns?: string[];
  languages: string[];
  concurrencyLimit: number;
  maxFileSize?: number;
}

/**
 * Configuration for flag synchronization operations.
 */
export interface FlagSyncConfig {
  dryRun: boolean;
  operation: OperationType;
  executionId: string;
  reportsPath: string;
  
  // Feature flags configuration
  optimizely: OptimizelyClientConfig;
  codeAnalysis: CodeAnalysisConfig;
  
  // Operational settings
  logging: LoggingConfig;
  security: SecurityConfig;
}

/**
 * Configuration for logging and audit trail.
 */
export interface LoggingConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logFilePath?: string;
  auditTrailPath: string;
  structuredLogging: boolean;
}

/**
 * Configuration for security settings.
 */
export interface SecurityConfig {
  sanitizeLogs: boolean;
  encryptSecrets: boolean;
  validateTokens: boolean;
  auditSecurityEvents: boolean;
}

/**
 * Configuration validation result.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * GitHub Actions specific configuration.
 */
export interface GitHubActionsConfig {
  token?: string;
  runId?: string;
  repository?: string;
  ref?: string;
  actor?: string;
  eventName?: string;
  prNumber?: number;
}

/**
 * Complete runtime configuration combining all config sources.
 */
export interface RuntimeConfig {
  environment: EnvironmentConfig;
  flagSync: FlagSyncConfig;
  github?: GitHubActionsConfig;
  metadata: {
    version: string;
    buildTime: string;
    environment: string;
    executionId: string;
  };
}
