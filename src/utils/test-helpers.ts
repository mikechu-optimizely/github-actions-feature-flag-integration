/**
 * Test utilities and helper functions for the comprehensive test suite.
 * Provides common testing patterns, mocks, and fixtures.
 */

import { assertEquals } from "@std/assert";
import { EnvironmentConfig, OperationType } from "../types/config.ts";
import { OptimizelyEnvironmentListItem, OptimizelyFlag } from "../types/optimizely.ts";
import { AuditEvent, AuditEventType } from "../modules/audit-reporter.ts";

/**
 * Mock environment configuration for testing.
 */
export function createMockEnvironment(
  overrides: Partial<EnvironmentConfig> = {},
): EnvironmentConfig {
  return {
    OPTIMIZELY_API_TOKEN: "test-token-12345",
    OPTIMIZELY_PROJECT_ID: "123456",
    ENVIRONMENT: "test",
    OPERATION: "cleanup" as OperationType,
    DRY_RUN: true,
    REPORTS_PATH: "test-reports",
    LOG_LEVEL: "info",
    API_RATE_LIMIT: 5,
    API_TIMEOUT: 30000,
    MAX_RETRIES: 3,
    CONCURRENCY_LIMIT: 5,
    GITHUB_TOKEN: "gh-test-token",
    GITHUB_RUN_ID: "test-run-123",
    ...overrides,
  };
}

/**
 * Creates a mock Optimizely flag for testing.
 */
export function createMockFlag(overrides: Partial<OptimizelyFlag> = {}): OptimizelyFlag {
  return {
    key: "test_flag_" + Math.random().toString(36).substr(2, 9),
    name: "Test Flag",
    description: "A test feature flag",
    url: "/flags/test-flag",
    archived: false,
    id: 12345,
    urn: "flags.flags.optimizely.com::12345",
    project_id: 4678434014625792,
    account_id: 21468570738,
    created_by_user_id: "test@optimizely.com",
    created_by_user_email: "test@optimizely.com",
    role: "admin",
    created_time: "2024-01-01T00:00:00Z",
    updated_time: "2024-01-01T00:00:00Z",
    revision: 1,
    outlier_filtering_enabled: false,
    update_url: "/projects/4678434014625792/flags",
    delete_url: "/projects/4678434014625792/flags/test-flag",
    archive_url: "/projects/4678434014625792/flags/archived",
    variable_definitions: {
      enabled: {
        key: "enabled",
        description: "Whether the feature is enabled",
        type: "boolean",
        default_value: "false",
        created_time: "2024-01-01T00:00:00Z",
        updated_time: "2024-01-01T00:00:00Z",
      },
    },
    environments: {
      production: {
        key: "production",
        name: "Production",
        enabled: true,
        id: 123456,
        has_restricted_permissions: false,
        priority: 1,
        status: "running",
        rules_summary: {},
        rules_detail: [],
        created_time: "2024-01-01T00:00:00Z",
        disable_url:
          "/projects/4678434014625792/flags/test-flag/environments/production/ruleset/disabled",
      },
      development: {
        key: "development",
        name: "Development",
        enabled: false,
        id: 123457,
        has_restricted_permissions: false,
        priority: 2,
        status: "draft",
        rules_summary: {},
        rules_detail: [],
        created_time: "2024-01-01T00:00:00Z",
        enable_url:
          "/projects/4678434014625792/flags/test-flag/environments/development/ruleset/enabled",
      },
    },
    ...overrides,
  };
}

/**
 * Creates a mock Optimizely environment list item for testing.
 */
export function createMockEnvironmentListItem(
  overrides: Partial<OptimizelyEnvironmentListItem> = {},
): OptimizelyEnvironmentListItem {
  return {
    key: "test_env_" + Math.random().toString(36).substr(2, 9),
    name: "Test Environment",
    archived: false,
    priority: 1,
    account_id: 21468570738,
    project_id: 4678434014625792,
    role: "admin",
    id: 101746715916459,
    has_restricted_permissions: false,
    ...overrides,
  };
}

/**
 * Creates a mock audit event for testing.
 */
export function createMockAuditEvent(
  type: AuditEventType = "flag_in_use",
  overrides: Partial<AuditEvent> = {},
): AuditEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    message: `Test audit event: ${type}`,
    details: {
      flagKey: "test_flag",
      operation: "test",
      userId: "test-user",
    },
    ...overrides,
  };
}

/**
 * Mock fetch function for testing HTTP requests.
 */
export function createMockFetch(
  responses: Array<{
    url?: string | RegExp;
    status?: number;
    statusText?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }>,
): typeof globalThis.fetch {
  let callCount = 0;

  return (input: string | Request | URL, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const response = responses[callCount] || responses[responses.length - 1];
    callCount++;

    // Check if URL matches (if specified)
    if (response.url) {
      if (typeof response.url === "string" && !url.includes(response.url)) {
        throw new Error(`Unexpected URL: ${url}, expected: ${response.url}`);
      }
      if (response.url instanceof RegExp && !response.url.test(url)) {
        throw new Error(`URL ${url} does not match pattern: ${response.url}`);
      }
    }

    const body = response.body ? JSON.stringify(response.body) : "";
    const status = response.status ?? 200;
    const statusText = response.statusText ?? "OK";
    const headers = {
      "Content-Type": "application/json",
      ...response.headers,
    };

    return Promise.resolve(new Response(body, { status, statusText, headers }));
  };
}

/**
 * Sets up environment variables for testing.
 */
export function setupTestEnvironment(env: Partial<Record<string, string>> = {}): void {
  const defaultEnv = {
    OPTIMIZELY_API_TOKEN: "test-token-12345",
    OPTIMIZELY_PROJECT_ID: "123456",
    ENVIRONMENT: "test",
    OPERATION: "cleanup",
    DRY_RUN: "true",
    REPORTS_PATH: "test-reports",
    LOG_LEVEL: "info",
    API_RATE_LIMIT: "5",
    API_TIMEOUT: "30000",
    MAX_RETRIES: "3",
    CONCURRENCY_LIMIT: "5",
    GITHUB_TOKEN: "gh-test-token",
    GITHUB_RUN_ID: "test-run-123",
    ...env,
  };

  for (const [key, value] of Object.entries(defaultEnv)) {
    Deno.env.set(key, value);
  }
}

/**
 * Cleans up test environment variables.
 */
export function cleanupTestEnvironment(): void {
  const envVars = [
    "OPTIMIZELY_API_TOKEN",
    "OPTIMIZELY_PROJECT_ID",
    "ENVIRONMENT",
    "OPERATION",
    "DRY_RUN",
    "REPORTS_PATH",
    "LOG_LEVEL",
    "API_RATE_LIMIT",
    "API_TIMEOUT",
    "MAX_RETRIES",
    "CONCURRENCY_LIMIT",
    "GITHUB_TOKEN",
    "GITHUB_RUN_ID",
  ];

  for (const envVar of envVars) {
    Deno.env.delete(envVar);
  }
}

/**
 * Executes a test function with isolated environment variables.
 * Automatically cleans up environment variables after test execution.
 * @param envVars Environment variables to set for the test
 * @param testFn Test function to execute
 */
export async function withTestEnvironment(
  envVars: Record<string, string>,
  testFn: () => Promise<void> | void,
): Promise<void> {
  // Store original values for all potentially affected environment variables
  const originalValues: Record<string, string | undefined> = {};

  const allEnvKeys = [
    "OPTIMIZELY_API_TOKEN",
    "OPTIMIZELY_PROJECT_ID",
    "ENVIRONMENT",
    "OPERATION",
    "DRY_RUN",
    "REPORTS_PATH",
    "LOG_LEVEL",
    "API_RATE_LIMIT",
    "API_TIMEOUT",
    "MAX_RETRIES",
    "CONCURRENCY_LIMIT",
    "GITHUB_TOKEN",
    "GITHUB_RUN_ID",
  ];

  // Store original values
  for (const key of allEnvKeys) {
    originalValues[key] = Deno.env.get(key);
  }

  try {
    // Clear all test-related environment variables first to ensure clean state
    for (const key of allEnvKeys) {
      Deno.env.delete(key);
    }

    // Set test environment variables
    for (const [key, value] of Object.entries(envVars)) {
      Deno.env.set(key, value);
    }

    await testFn();
  } finally {
    // Restore original values
    for (const key of allEnvKeys) {
      if (originalValues[key] === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, originalValues[key]!);
      }
    }
  }
}

/**
 * Creates a temporary directory for test files.
 */
export async function createTempDir(prefix = "test-"): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix });
  return tempDir;
}

/**
 * Cleans up a temporary directory and its contents.
 */
export async function cleanupTempDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

/**
 * Asserts that a file exists.
 */
export async function assertFileExists(path: string): Promise<void> {
  try {
    await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Expected file to exist: ${path}`);
    }
    throw error;
  }
}

/**
 * Asserts that a file contains specific content.
 */
export async function assertFileContains(path: string, content: string): Promise<void> {
  const fileContent = await Deno.readTextFile(path);
  if (!fileContent.includes(content)) {
    throw new Error(`File ${path} does not contain expected content: ${content}`);
  }
}

/**
 * Asserts that a string matches a JSON structure.
 */
export function assertJsonStructure(
  actual: string,
  expected: Record<string, unknown>,
): void {
  const parsed = JSON.parse(actual);
  assertEquals(typeof parsed, "object");

  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === "object" && value !== null) {
      assertEquals(typeof parsed[key], "object");
    } else {
      assertEquals(parsed[key], value);
    }
  }
}

/**
 * Creates a spy function that records calls.
 */
export function createSpy<T extends (...args: unknown[]) => unknown>(
  originalFn?: T,
): T & { calls: unknown[][]; callCount: number; reset: () => void } {
  const calls: unknown[][] = [];

  const spy = ((...args: unknown[]) => {
    calls.push(args);
    return originalFn?.(...args);
  }) as T & { calls: unknown[][]; callCount: number; reset: () => void };

  Object.defineProperty(spy, "calls", {
    get: () => calls,
  });

  Object.defineProperty(spy, "callCount", {
    get: () => calls.length,
  });

  spy.reset = () => {
    calls.length = 0;
  };

  return spy;
}

/**
 * Waits for a condition to be true with timeout.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Test fixture data for various testing scenarios.
 */
export const TestFixtures = {
  /**
   * Sample code snippets containing feature flags.
   */
  codeSnippets: {
    typescript: `
      import { optimizely } from './optimizely-client';
      
      function handleFeature() {
        if (optimizely.isFeatureEnabled('feature_flag_1')) {
          return doNewFeature();
        }
        return doOldFeature();
      }
      
      const config = {
        flags: {
          'feature_flag_2': true,
          'disabled_flag': false
        }
      };
    `,
    javascript: `
      const enabled = optimizely.isFeatureEnabled('js_feature_flag');
      if (enabled) {
        console.log('Feature is enabled');
      }
    `,
    python: `
      def check_feature():
          if optimizely.is_feature_enabled('python_feature_flag'):
              return new_implementation()
          return old_implementation()
    `,
  },

  /**
   * Sample Optimizely API responses.
   */
  apiResponses: {
    featureFlags: {
      url: "/projects/4678434014625792/flags",
      fetch_flag_url: "/projects/4678434014625792/flags/{flag_key}",
      create_url: "/projects/4678434014625792/flags",
      last_url: "/projects/4678434014625792/flags",
      first_url: "/projects/4678434014625792/flags",
      count: 3,
      total_pages: 1,
      total_count: 3,
      page: 1,
      items: [
        {
          key: "feature_flag_1",
          name: "Feature Flag 1",
          description: "First test feature flag",
          url: "/projects/4678434014625792/flags/feature_flag_1",
          update_url: "/projects/4678434014625792/flags",
          delete_url: "/projects/4678434014625792/flags/feature_flag_1",
          archive_url: "/projects/4678434014625792/flags/archived",
          archived: false,
          id: 415337,
          urn: "flags.flags.optimizely.com::415337",
          project_id: 4678434014625792,
          account_id: 21468570738,
          created_by_user_id: "test@optimizely.com",
          created_by_user_email: "test@optimizely.com",
          role: "admin",
          created_time: "2025-05-08T16:31:57.402712Z",
          updated_time: "2025-05-12T20:23:40.825440Z",
          revision: 4,
          outlier_filtering_enabled: false,
          variable_definitions: {
            enabled: {
              key: "enabled",
              description: "Whether the feature is enabled",
              type: "boolean",
              default_value: "false",
              created_time: "2025-05-08T16:44:36.100744Z",
              updated_time: "2025-05-08T16:44:36.100749Z",
            },
          },
          environments: {
            production: {
              key: "production",
              name: "Production",
              enabled: true,
              id: 101746715916459,
              has_restricted_permissions: true,
              priority: 1,
              status: "running",
              rules_summary: {},
              rules_detail: [],
              created_time: "2025-05-08T14:51:56.000000Z",
              disable_url:
                "/projects/4678434014625792/flags/feature_flag_1/environments/production/ruleset/disabled",
            },
            development: {
              key: "development",
              name: "Development",
              enabled: false,
              id: 361746715916479,
              has_restricted_permissions: false,
              priority: 2,
              status: "draft",
              rules_summary: {},
              rules_detail: [],
              created_time: "2025-05-08T14:51:56.000000Z",
              enable_url:
                "/projects/4678434014625792/flags/feature_flag_1/environments/development/ruleset/enabled",
            },
          },
        },
        {
          key: "feature_flag_2",
          name: "Feature Flag 2",
          description: "Second test feature flag",
          url: "/projects/4678434014625792/flags/feature_flag_2",
          update_url: "/projects/4678434014625792/flags",
          delete_url: "/projects/4678434014625792/flags/feature_flag_2",
          archive_url: "/projects/4678434014625792/flags/archived",
          archived: false,
          id: 415338,
          urn: "flags.flags.optimizely.com::415338",
          project_id: 4678434014625792,
          account_id: 21468570738,
          created_by_user_id: "test@optimizely.com",
          created_by_user_email: "test@optimizely.com",
          role: "admin",
          created_time: "2025-05-08T16:31:57.402712Z",
          updated_time: "2025-05-12T20:23:40.825440Z",
          revision: 4,
          outlier_filtering_enabled: false,
          variable_definitions: {
            theme: {
              key: "theme",
              description: "UI theme setting",
              type: "string",
              default_value: "default",
              created_time: "2025-05-08T16:44:36.100744Z",
              updated_time: "2025-05-08T16:44:36.100749Z",
            },
          },
          environments: {
            production: {
              key: "production",
              name: "Production",
              enabled: false,
              id: 101746715916459,
              has_restricted_permissions: true,
              priority: 1,
              status: "draft",
              rules_summary: {},
              rules_detail: [],
              created_time: "2025-05-08T14:51:56.000000Z",
              enable_url:
                "/projects/4678434014625792/flags/feature_flag_2/environments/production/ruleset/enabled",
            },
            development: {
              key: "development",
              name: "Development",
              enabled: true,
              id: 361746715916479,
              has_restricted_permissions: false,
              priority: 2,
              status: "running",
              rules_summary: {},
              rules_detail: [],
              created_time: "2025-05-08T14:51:56.000000Z",
              disable_url:
                "/projects/4678434014625792/flags/feature_flag_2/environments/development/ruleset/disabled",
            },
          },
        },
        {
          key: "archived_flag",
          name: "Archived Flag",
          description: "An archived flag",
          url: "/projects/4678434014625792/flags/archived_flag",
          update_url: "/projects/4678434014625792/flags",
          delete_url: "/projects/4678434014625792/flags/archived_flag",
          archive_url: "/projects/4678434014625792/flags/archived",
          archived: true,
          id: 415339,
          urn: "flags.flags.optimizely.com::415339",
          project_id: 4678434014625792,
          account_id: 21468570738,
          created_by_user_id: "test@optimizely.com",
          created_by_user_email: "test@optimizely.com",
          role: "admin",
          created_time: "2025-05-08T16:31:57.402712Z",
          updated_time: "2025-05-12T20:23:40.825440Z",
          revision: 4,
          outlier_filtering_enabled: false,
          variable_definitions: {},
          environments: {},
        },
      ],
    },
  },

  /**
   * Sample audit events.
   */
  auditEvents: [
    {
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "flag_in_use" as AuditEventType,
      message: "Flag found in codebase",
      details: { flagKey: "feature_flag_1", files: ["src/feature.ts"] },
    },
    {
      timestamp: "2024-01-01T00:01:00.000Z",
      type: "flag_unused" as AuditEventType,
      message: "Flag not found in codebase",
      details: { flagKey: "unused_flag" },
    },
    {
      timestamp: "2024-01-01T00:02:00.000Z",
      type: "flag_archived" as AuditEventType,
      message: "Flag archived successfully",
      details: { flagKey: "old_flag", archivedBy: "test-user" },
    },
  ],
};
