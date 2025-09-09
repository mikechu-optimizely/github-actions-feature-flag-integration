/**
 * Unit tests for flag-sync-core module.
 * Tests sync plan creation, validation, and execution functionality.
 */

import { assertEquals, assertExists } from "@std/assert";
import { FlagSyncCore } from "./flag-sync-core.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { FlagUsage } from "./code-analysis.ts";
import { FlagUsageReport } from "./flag-usage-reporter.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";

/**
 * Mock OptimizelyApiClient for testing
 */
class MockOptimizelyApiClient extends OptimizelyApiClient {
  constructor() {
    // Use a test token and minimal options
    super("test-token", { baseUrl: "https://test.example.com" });
  }
}

/**
 * Test fixture data
 */
const createMockFlag = (key: string, archived = false): OptimizelyFlag => ({
  key,
  name: `Test Flag ${key}`,
  description: `Test flag for ${key}`,
  url: `https://test.example.com/flags/${key}`,
  archived,
  id: Math.floor(Math.random() * 10000),
  urn: `urn:optimizely:flag:${key}`,
  project_id: 12345,
  account_id: 67890,
  created_by_user_id: "user123",
  created_by_user_email: "test@example.com",
  role: "admin",
  created_time: "2024-01-01T00:00:00Z",
  updated_time: "2024-01-01T00:00:00Z",
  revision: 1,
  outlier_filtering_enabled: false,
});

const createMockFlagUsage = (flagKey: string, file: string, line: number): FlagUsage => ({
  file,
  line,
  context: `example usage of ${flagKey}`,
});

const createMockUsageReport = (
  flagKeys: string[],
  usageMap: Map<string, FlagUsage[]>,
): FlagUsageReport => ({
  timestamp: new Date().toISOString(),
  totalFlags: flagKeys.length,
  usedFlags: Array.from(usageMap.keys()).filter((key) => usageMap.get(key)!.length > 0).length,
  unusedFlags:
    flagKeys.filter((key) => !usageMap.has(key) || usageMap.get(key)!.length === 0).length,
  flagUsages: usageMap,
  unusedFlagKeys: flagKeys.filter((key) => !usageMap.has(key) || usageMap.get(key)!.length === 0),
  summary: {
    usageRate: 0,
    flagsByFile: new Map(),
    mostUsedFlags: [],
  },
});

// Test helper to create a FlagSyncCore instance
function createTestFlagSyncCore(): FlagSyncCore {
  const mockApiClient = new MockOptimizelyApiClient();
  return new FlagSyncCore(mockApiClient, {
    dryRun: true,
    maxConcurrentOperations: 2,
    riskTolerance: "medium",
  });
}

Deno.test("FlagSyncCore - should create sync plan for unused flags", async () => {
  const flagSyncCore = createTestFlagSyncCore();
  const flags = [
    createMockFlag("used_flag", false),
    createMockFlag("unused_flag", false),
    createMockFlag("archived_flag", true),
  ];

  const usageMap = new Map([
    ["used_flag", [createMockFlagUsage("used_flag", "src/test.ts", 10)]],
    ["unused_flag", []],
    ["archived_flag", []],
  ]);

  const usageReport = createMockUsageReport(
    flags.map((f) => f.key),
    usageMap,
  );

  const result = await flagSyncCore.createSyncPlan(flags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);

  const syncPlan = result.data!;
  assertEquals(syncPlan.status, "pending");
  assertEquals(syncPlan.operations.length, 1); // Only unused_flag should have an operation

  const archiveOperation = syncPlan.operations.find((op) => op.type === "archive");
  assertExists(archiveOperation);
  assertEquals(archiveOperation!.flagKey, "unused_flag");
  assertEquals(archiveOperation!.riskLevel, "medium");
});

Deno.test("FlagSyncCore - should create enable operation for archived but used flags", async () => {
  const flagSyncCore = createTestFlagSyncCore();
  const flags = [
    createMockFlag("used_but_archived", true),
  ];

  const usageMap = new Map([
    ["used_but_archived", [createMockFlagUsage("used_but_archived", "src/test.ts", 15)]],
  ]);

  const usageReport = createMockUsageReport(
    flags.map((f) => f.key),
    usageMap,
  );

  const result = await flagSyncCore.createSyncPlan(flags, usageReport);

  assertExists(result.data);
  const syncPlan = result.data!;

  const enableOperation = syncPlan.operations.find((op) => op.type === "enable");
  assertExists(enableOperation);
  assertEquals(enableOperation!.flagKey, "used_but_archived");
  assertEquals(enableOperation!.riskLevel, "high");
});

Deno.test("FlagSyncCore - should validate flag consistency", async () => {
  const flagSyncCore = createTestFlagSyncCore();
  const flags = [
    createMockFlag("orphaned_flag", false),
    createMockFlag("used_flag", false),
  ];

  const usageMap = new Map([
    ["used_flag", [createMockFlagUsage("used_flag", "src/test.ts", 25)]],
    ["orphaned_flag", []],
  ]);

  const usageReport = createMockUsageReport(
    flags.map((f) => f.key),
    usageMap,
  );

  const results = await flagSyncCore.validateFlagConsistency(flags, usageReport);

  assertEquals(results.length, 2);

  const orphanedResult = results.find((r) => r.flagKey === "orphaned_flag");
  assertExists(orphanedResult);
  assertEquals(orphanedResult!.isConsistent, false);
  assertEquals(orphanedResult!.issues.length, 1);
  assertEquals(orphanedResult!.issues[0].type, "orphaned_flag");
  assertEquals(orphanedResult!.issues[0].severity, "medium");
});

Deno.test("FlagSyncCore - should execute sync plan in dry run mode", async () => {
  const flagSyncCore = createTestFlagSyncCore();
  const flags = [createMockFlag("test_flag", false)];
  const usageMap = new Map([["test_flag", []]]);
  const usageReport = createMockUsageReport(flags.map((f) => f.key), usageMap);

  const syncPlanResult = await flagSyncCore.createSyncPlan(flags, usageReport);
  assertExists(syncPlanResult.data);

  const syncPlan = syncPlanResult.data!;
  const executionResult = await flagSyncCore.executeSyncPlan(syncPlan);

  assertExists(executionResult.data);
  assertEquals(executionResult.error, null);

  const result = executionResult.data!;
  assertEquals(result.status, "success");
  assertEquals(result.summary.successful, 1);
  assertEquals(result.summary.failed, 0);

  // Check that operations were simulated in dry run
  const operationResult = result.operationResults[0];
  assertEquals(operationResult.status, "success");
  assertEquals(operationResult.message.includes("DRY RUN"), true);
});

Deno.test("FlagSyncCore - should handle empty flag list", async () => {
  const flagSyncCore = createTestFlagSyncCore();
  const flags: OptimizelyFlag[] = [];
  const usageReport = createMockUsageReport([], new Map());

  const result = await flagSyncCore.createSyncPlan(flags, usageReport);

  assertExists(result.data);
  assertEquals(result.data!.operations.length, 0);
  assertEquals(result.data!.summary.totalOperations, 0);
});

Deno.test("FlagSyncCore - should use default options", () => {
  const mockApiClient = new MockOptimizelyApiClient();
  const defaultSyncCore = new FlagSyncCore(mockApiClient);

  // Verify through behavior - default should be dry run enabled
  assertEquals(defaultSyncCore["options"].dryRun, true);
  assertEquals(defaultSyncCore["options"].maxConcurrentOperations, 3);
  assertEquals(defaultSyncCore["options"].riskTolerance, "medium");
});

// Enhanced Mock Client for archiving tests
class EnhancedMockOptimizelyApiClient extends MockOptimizelyApiClient {
  private archivedFlags: Set<string> = new Set();
  private shouldFailArchive = false;
  private shouldFailConsistencyCheck = false;
  private enabledFlags: Set<string> = new Set();
  private flagsWithRules: Set<string> = new Set();

  setShouldFailArchive(fail: boolean) {
    this.shouldFailArchive = fail;
  }

  setShouldFailConsistencyCheck(fail: boolean) {
    this.shouldFailConsistencyCheck = fail;
  }

  setFlagEnabled(flagKey: string, enabled: boolean) {
    if (enabled) {
      this.enabledFlags.add(flagKey);
    } else {
      this.enabledFlags.delete(flagKey);
    }
  }

  setFlagHasRules(flagKey: string, hasRules: boolean) {
    if (hasRules) {
      this.flagsWithRules.add(flagKey);
    } else {
      this.flagsWithRules.delete(flagKey);
    }
  }

  override archiveFeatureFlag(flagKey: string) {
    if (this.shouldFailArchive) {
      return Promise.resolve({ data: null, error: new Error(`Failed to archive ${flagKey}`) });
    }
    this.archivedFlags.add(flagKey);
    return Promise.resolve({ data: true, error: null });
  }

  override archiveFeatureFlagsWithRecovery(flagKeys: string[] | string) {
    const keys = Array.isArray(flagKeys) ? flagKeys : [flagKeys];
    if (this.shouldFailArchive) {
      return Promise.resolve({ data: null, error: new Error("Bulk archive failed") });
    }

    const result: Record<string, OptimizelyFlag> = {};
    for (const key of keys) {
      this.archivedFlags.add(key);
      result[key] = createMockFlag(key, true);
    }
    return Promise.resolve({ data: result, error: null });
  }

  override validateFlagConsistency(flagKey: string) {
    if (this.shouldFailConsistencyCheck) {
      return Promise.resolve({ data: null, error: new Error("Consistency check failed") });
    }

    const enabled = this.enabledFlags.has(flagKey);
    const hasRules = this.flagsWithRules.has(flagKey);

    return Promise.resolve({
      data: {
        flagKey,
        isConsistent: true,
        environments: {
          production: {
            key: "production",
            name: "Production",
            enabled,
            status: "running",
            hasTargetingRules: hasRules,
            priority: 1,
          },
        },
        inconsistencies: [],
        summary: {
          totalEnvironments: 1,
          enabledEnvironments: enabled ? 1 : 0,
          disabledEnvironments: enabled ? 0 : 1,
          archivedEnvironments: 0,
        },
      },
      error: null,
    });
  }

  override unarchiveFeatureFlag(flagKey: string) {
    this.archivedFlags.delete(flagKey);
    return Promise.resolve({ data: true, error: null });
  }

  isArchived(flagKey: string): boolean {
    return this.archivedFlags.has(flagKey);
  }
}

// Helper to create enhanced test instance
function createEnhancedTestFlagSyncCore(dryRun = true): {
  flagSyncCore: FlagSyncCore;
  mockClient: EnhancedMockOptimizelyApiClient;
} {
  const mockClient = new EnhancedMockOptimizelyApiClient();
  const flagSyncCore = new FlagSyncCore(mockClient, {
    dryRun,
    maxConcurrentOperations: 2,
    riskTolerance: "medium",
  });
  return { flagSyncCore, mockClient };
}

Deno.test("FlagSyncCore.archiveUnusedFlags - dry run mode", async () => {
  const { flagSyncCore } = createEnhancedTestFlagSyncCore(true);

  const optimizelyFlags = [
    createMockFlag("unused_flag_1"),
    createMockFlag("unused_flag_2"),
  ];

  const usageReport = createMockUsageReport(
    ["unused_flag_1", "unused_flag_2"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 2);
  assertEquals(result.data.archived, 0); // In dry run, nothing actually archived
  assertEquals(result.data.skipped, 0);
});

Deno.test("FlagSyncCore.archiveUnusedFlags - real mode with valid flags", async () => {
  const { flagSyncCore, mockClient } = createEnhancedTestFlagSyncCore(false);

  const optimizelyFlags = [
    createMockFlag("unused_flag_1"),
    createMockFlag("unused_flag_2"),
  ];

  const usageReport = createMockUsageReport(
    ["unused_flag_1", "unused_flag_2"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 2);
  assertEquals(result.data.archived, 2);
  assertEquals(result.data.skipped, 0);

  // Verify flags were actually archived in mock
  assertEquals(mockClient.isArchived("unused_flag_1"), true);
  assertEquals(mockClient.isArchived("unused_flag_2"), true);
});

Deno.test("FlagSyncCore.archiveUnusedFlags - skips already archived flags", async () => {
  const { flagSyncCore } = createEnhancedTestFlagSyncCore(false);

  const optimizelyFlags = [
    createMockFlag("unused_flag_1"),
    createMockFlag("already_archived", true), // Already archived
  ];

  const usageReport = createMockUsageReport(
    ["unused_flag_1", "already_archived"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 1);
  assertEquals(result.data.archived, 1); // Only one actually archived
  assertEquals(result.data.skipped, 1); // One skipped (already archived)
  assertEquals(result.data.skippedReasons["already_archived"], "already_archived");
});

Deno.test("FlagSyncCore.archiveUnusedFlags - skips flags not found in Optimizely", async () => {
  const { flagSyncCore } = createEnhancedTestFlagSyncCore(false);

  const optimizelyFlags = [
    createMockFlag("unused_flag_1"),
    // missing_flag is not in the optimizelyFlags array
  ];

  const usageReport = createMockUsageReport(
    ["unused_flag_1", "missing_flag"], // missing_flag doesn't exist in Optimizely
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 1);
  assertEquals(result.data.archived, 1);
  assertEquals(result.data.skipped, 1);
  assertEquals(result.data.skippedReasons["missing_flag"], "flag_not_found_in_optimizely");
});

Deno.test("FlagSyncCore.archiveUnusedFlags - handles empty unused flags list", async () => {
  const { flagSyncCore } = createEnhancedTestFlagSyncCore(false);

  const optimizelyFlags = [
    createMockFlag("used_flag"),
  ];

  const usageReport = createMockUsageReport([], new Map()); // No unused flags

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 0);
  assertEquals(result.data.archived, 0);
  assertEquals(result.data.skipped, 0);
});

Deno.test("FlagSyncCore.archiveUnusedFlags - handles consistency check failures", async () => {
  const { flagSyncCore, mockClient } = createEnhancedTestFlagSyncCore(false);

  // Set the mock to fail consistency checks
  mockClient.setShouldFailConsistencyCheck(true);

  const optimizelyFlags = [
    createMockFlag("problematic_flag"),
  ];

  const usageReport = createMockUsageReport(
    ["problematic_flag"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 0);
  assertEquals(result.data.archived, 0);
  assertEquals(result.data.skipped, 1);
  assertEquals(
    result.data.skippedReasons["problematic_flag"].includes("consistency_check_failed"),
    true,
  );
});

Deno.test("FlagSyncCore.archiveUnusedFlags - skips flags enabled in environments", async () => {
  const { flagSyncCore, mockClient } = createEnhancedTestFlagSyncCore(false);

  // Set the flag as enabled in the mock
  mockClient.setFlagEnabled("enabled_flag", true);

  const optimizelyFlags = [
    createMockFlag("enabled_flag"),
  ];

  const usageReport = createMockUsageReport(
    ["enabled_flag"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 0);
  assertEquals(result.data.archived, 0);
  assertEquals(result.data.skipped, 1);
  assertEquals(result.data.skippedReasons["enabled_flag"], "enabled_in_some_environment");
});

Deno.test("FlagSyncCore.archiveUnusedFlags - skips flags with targeting rules", async () => {
  const { flagSyncCore, mockClient } = createEnhancedTestFlagSyncCore(false);

  // Set the flag as having targeting rules in the mock
  mockClient.setFlagHasRules("flag_with_rules", true);

  const optimizelyFlags = [
    createMockFlag("flag_with_rules"),
  ];

  const usageReport = createMockUsageReport(
    ["flag_with_rules"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 0);
  assertEquals(result.data.archived, 0);
  assertEquals(result.data.skipped, 1);
  assertEquals(result.data.skippedReasons["flag_with_rules"], "targeting_rules_present");
});

Deno.test("FlagSyncCore.archiveUnusedFlags - handles batch size limits", async () => {
  const { flagSyncCore } = createEnhancedTestFlagSyncCore(false);

  const optimizelyFlags = [
    createMockFlag("unused_flag_1"),
    createMockFlag("unused_flag_2"),
    createMockFlag("unused_flag_3"),
    createMockFlag("unused_flag_4"),
  ];

  const usageReport = createMockUsageReport(
    ["unused_flag_1", "unused_flag_2", "unused_flag_3", "unused_flag_4"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 4);
  assertEquals(result.data.archived, 4); // All should be archived despite batching
  assertEquals(result.data.skipped, 0);
});

Deno.test("FlagSyncCore.archiveUnusedFlags - handles API errors gracefully with fallback", async () => {
  const { flagSyncCore, mockClient } = createEnhancedTestFlagSyncCore(false);

  // Set bulk archive to fail, but individual archive should succeed
  mockClient.setShouldFailArchive(false); // Individual calls will succeed

  // Override the bulk method to fail
  mockClient.archiveFeatureFlagsWithRecovery = (_flagKeys: string[] | string) => {
    return Promise.resolve({ data: null, error: new Error("Bulk archive failed") });
  };

  const optimizelyFlags = [
    createMockFlag("fallback_flag"),
  ];

  const usageReport = createMockUsageReport(
    ["fallback_flag"],
    new Map(),
  );

  const result = await flagSyncCore.archiveUnusedFlags(optimizelyFlags, usageReport);

  assertExists(result.data);
  assertEquals(result.error, null);
  assertEquals(result.data.attempted, 1);
  assertEquals(result.data.archived, 1); // Should succeed with fallback
  assertEquals(result.data.skipped, 0);
});
