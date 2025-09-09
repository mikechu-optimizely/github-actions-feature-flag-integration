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
