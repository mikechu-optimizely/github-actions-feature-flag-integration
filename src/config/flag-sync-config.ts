/**
 * Flag synchronization configuration management.
 * Provides configuration factories, defaults, and validation for the flag sync system.
 */

import {
  CodeAnalysisConfig,
  EnvironmentConfig,
  FlagSyncConfig,
  GitHubActionsConfig,
  LoggingConfig,
  LogLevel,
  OptimizelyClientConfig,
  RuntimeConfig,
  SecurityConfig,
  ValidationResult,
} from "../types/config.ts";

/**
 * Default configuration values for various components.
 */
export const DEFAULT_CONFIG = {
  // Code analysis defaults
  CODE_ANALYSIS: {
    EXCLUDE_PATTERNS: [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/__tests__/**",
      "**/*.md",
      "**/*.json",
      "**/*.yml",
      "**/*.yaml",
      "**/package-lock.json",
      "**/yarn.lock",
      "**/deno.lock",
    ],
    SUPPORTED_LANGUAGES: [
      "javascript",
      "typescript",
      "python",
      "java",
      "csharp",
      "go",
      "php",
    ],
    MAX_FILE_SIZE: 1024 * 1024, // 1MB
  },

  // Optimizely API defaults
  OPTIMIZELY: {
    BASE_URL: "https://api.optimizely.com/v2",
    RATE_LIMIT: 5,
    TIMEOUT: 30000, // 30 seconds
    MAX_RETRIES: 3,
  },

  // Logging defaults
  LOGGING: {
    LEVEL: "info",
    ENABLE_CONSOLE: true,
    ENABLE_FILE: true,
    STRUCTURED_LOGGING: true,
  },

  // Security defaults
  SECURITY: {
    SANITIZE_LOGS: true,
    ENCRYPT_SECRETS: false,
    VALIDATE_TOKENS: true,
    AUDIT_SECURITY_EVENTS: true,
  },
} as const;

/**
 * Creates an Optimizely client configuration from environment config.
 */
export function createOptimizelyClientConfig(
  env: EnvironmentConfig,
): OptimizelyClientConfig {
  return {
    apiToken: env.OPTIMIZELY_API_TOKEN,
    projectId: env.OPTIMIZELY_PROJECT_ID,
    rateLimit: env.API_RATE_LIMIT,
    timeout: env.API_TIMEOUT,
    maxRetries: env.MAX_RETRIES,
    baseUrl: DEFAULT_CONFIG.OPTIMIZELY.BASE_URL,
  };
}

/**
 * Creates a code analysis configuration from environment config.
 */
export function createCodeAnalysisConfig(
  env: EnvironmentConfig,
  workspaceRoot: string = Deno.cwd(),
): CodeAnalysisConfig {
  return {
    workspaceRoot,
    excludePatterns: [...DEFAULT_CONFIG.CODE_ANALYSIS.EXCLUDE_PATTERNS],
    languages: [...DEFAULT_CONFIG.CODE_ANALYSIS.SUPPORTED_LANGUAGES],
    concurrencyLimit: env.CONCURRENCY_LIMIT,
    maxFileSize: DEFAULT_CONFIG.CODE_ANALYSIS.MAX_FILE_SIZE,
  };
}

/**
 * Creates a logging configuration from environment config.
 */
export function createLoggingConfig(env: EnvironmentConfig): LoggingConfig {
  return {
    level: env.LOG_LEVEL as LogLevel,
    enableConsole: DEFAULT_CONFIG.LOGGING.ENABLE_CONSOLE,
    enableFile: DEFAULT_CONFIG.LOGGING.ENABLE_FILE,
    logFilePath: `${env.REPORTS_PATH}/execution.log`,
    auditTrailPath: `${env.REPORTS_PATH}/audit-trail.jsonl`,
    structuredLogging: DEFAULT_CONFIG.LOGGING.STRUCTURED_LOGGING,
  };
}

/**
 * Creates a security configuration with defaults.
 */
export function createSecurityConfig(): SecurityConfig {
  return {
    sanitizeLogs: DEFAULT_CONFIG.SECURITY.SANITIZE_LOGS,
    encryptSecrets: DEFAULT_CONFIG.SECURITY.ENCRYPT_SECRETS,
    validateTokens: DEFAULT_CONFIG.SECURITY.VALIDATE_TOKENS,
    auditSecurityEvents: DEFAULT_CONFIG.SECURITY.AUDIT_SECURITY_EVENTS,
  };
}

/**
 * Creates GitHub Actions configuration from environment variables.
 */
export function createGitHubActionsConfig(): GitHubActionsConfig {
  return {
    token: Deno.env.get("GITHUB_TOKEN"),
    runId: Deno.env.get("GITHUB_RUN_ID"),
    repository: Deno.env.get("GITHUB_REPOSITORY"),
    ref: Deno.env.get("GITHUB_REF"),
    actor: Deno.env.get("GITHUB_ACTOR"),
    eventName: Deno.env.get("GITHUB_EVENT_NAME"),
    prNumber: Deno.env.get("GITHUB_EVENT_NUMBER")
      ? parseInt(Deno.env.get("GITHUB_EVENT_NUMBER")!, 10)
      : undefined,
  };
}

/**
 * Creates a complete flag sync configuration from environment config.
 */
export function createFlagSyncConfig(
  env: EnvironmentConfig,
  executionId: string = crypto.randomUUID(),
): FlagSyncConfig {
  return {
    dryRun: env.DRY_RUN,
    operation: env.OPERATION,
    executionId,
    reportsPath: env.REPORTS_PATH,

    optimizely: createOptimizelyClientConfig(env),
    codeAnalysis: createCodeAnalysisConfig(env),
    logging: createLoggingConfig(env),
    security: createSecurityConfig(),
  };
}

/**
 * Creates a complete runtime configuration.
 */
export function createRuntimeConfig(
  env: EnvironmentConfig,
): RuntimeConfig {
  const executionId = env.GITHUB_RUN_ID || crypto.randomUUID();

  return {
    environment: env,
    flagSync: createFlagSyncConfig(env, executionId),
    github: createGitHubActionsConfig(),
    metadata: {
      version: "1.0.0", // TODO: Load from package.json or version file
      buildTime: new Date().toISOString(),
      environment: env.ENVIRONMENT,
      executionId,
    },
  };
}

/**
 * Validates a flag sync configuration for completeness and correctness.
 */
export function validateFlagSyncConfig(config: FlagSyncConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required fields
  if (!config.executionId) {
    errors.push("Missing execution ID");
  }

  if (!config.reportsPath) {
    errors.push("Missing reports path");
  }

  // Validate Optimizely configuration
  if (!config.optimizely.apiToken) {
    errors.push("Missing Optimizely API token");
  }

  if (!config.optimizely.projectId) {
    errors.push("Missing Optimizely project ID");
  }

  if (config.optimizely.rateLimit < 1 || config.optimizely.rateLimit > 100) {
    errors.push("Optimizely rate limit must be between 1 and 100 requests per second");
  }

  if (config.optimizely.timeout < 1000 || config.optimizely.timeout > 300000) {
    errors.push("Optimizely timeout must be between 1000ms and 300000ms");
  }

  // Validate code analysis configuration
  if (!config.codeAnalysis.workspaceRoot) {
    errors.push("Missing workspace root for code analysis");
  }

  if (config.codeAnalysis.concurrencyLimit < 1 || config.codeAnalysis.concurrencyLimit > 20) {
    errors.push("Code analysis concurrency limit must be between 1 and 20");
  }

  // Validate logging configuration
  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(config.logging.level)) {
    errors.push(
      `Invalid log level: ${config.logging.level}. Must be one of: ${validLogLevels.join(", ")}`,
    );
  }

  // Warnings for non-critical issues
  if (config.dryRun && config.operation === "cleanup") {
    warnings.push("Dry run mode is enabled for cleanup operation - no actual changes will be made");
  }

  if (!config.logging.enableConsole && !config.logging.enableFile) {
    warnings.push(
      "Both console and file logging are disabled - you may miss important log messages",
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a runtime configuration.
 */
export function validateRuntimeConfig(config: RuntimeConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate flag sync config
  const flagSyncValidation = validateFlagSyncConfig(config.flagSync);
  errors.push(...flagSyncValidation.errors);
  warnings.push(...flagSyncValidation.warnings);

  // Validate metadata
  if (!config.metadata.version) {
    warnings.push("Missing version information in metadata");
  }

  if (!config.metadata.executionId) {
    errors.push("Missing execution ID in metadata");
  }

  // GitHub-specific validations
  if (config.github?.token && config.github.token.length < 10) {
    warnings.push("GitHub token appears to be invalid or too short");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gets configuration defaults for testing or fallback scenarios.
 */
export function getConfigDefaults() {
  return DEFAULT_CONFIG;
}
