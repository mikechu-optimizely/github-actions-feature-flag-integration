/**
 * Test utilities and helper functions for the comprehensive test suite.
 * Provides common testing patterns, mocks, and fixtures.
 */

import { assertEquals } from "@std/assert";
import { EnvironmentConfig, OperationType } from "../types/config.ts";
import { OptimizelyFlag } from "../modules/optimizely-client.ts";
import { AuditEvent, AuditEventType } from "../modules/audit-reporter.ts";

/**
 * Mock environment configuration for testing.
 */
export function createMockEnvironment(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
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
    environments: {
      production: { enabled: true },
      development: { enabled: false },
    },
    ...overrides,
  };
}

/**
 * Creates a mock audit event for testing.
 */
export function createMockAuditEvent(
  type: AuditEventType = "flag_in_use",
  overrides: Partial<AuditEvent> = {}
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
export function createMockFetch(responses: Array<{ 
  url?: string | RegExp;
  status?: number;
  statusText?: string;
  body?: unknown;
  headers?: Record<string, string>;
}>): typeof globalThis.fetch {
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
  expected: Record<string, unknown>
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
  originalFn?: T
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
  intervalMs = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
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
      items: [
        {
          key: "feature_flag_1",
          name: "Feature Flag 1",
          description: "First test feature flag",
          url: "/flags/feature_flag_1",
          archived: false,
          environments: {
            production: { enabled: true },
            development: { enabled: false },
          },
        },
        {
          key: "feature_flag_2", 
          name: "Feature Flag 2",
          description: "Second test feature flag",
          url: "/flags/feature_flag_2",
          archived: false,
          environments: {
            production: { enabled: false },
            development: { enabled: true },
          },
        },
        {
          key: "archived_flag",
          name: "Archived Flag",
          description: "An archived flag",
          url: "/flags/archived_flag",
          archived: true,
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
