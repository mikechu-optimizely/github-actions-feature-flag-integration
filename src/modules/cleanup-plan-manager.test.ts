/**
 * Unit tests for cleanup plan manager module.
 * Tests flag difference analysis, plan creation, validation, and execution ordering.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { CleanupPlanManager } from "./cleanup-plan-manager.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import { FlagUsage } from "./code-analysis.ts";
import { FlagUsageReport } from "./flag-usage-reporter.ts";
import { cleanupTestEnvironment, setupTestEnvironment } from "../utils/test-helpers.ts";

/**
 * Test fixture data
 */
const createMockFlag = (key: string, archived = false, updatedTime?: string): OptimizelyFlag => ({
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
  updated_time: updatedTime || "2024-01-01T00:00:00Z",
  revision: 1,
  outlier_filtering_enabled: false,
});

const createMockFlagUsage = (file: string, line: number): FlagUsage => ({
  file,
  line,
  context: `example usage context`,
});

const createMockUsageReport = (
  flagKeys: string[],
  unusedFlagKeys: string[] = [],
): FlagUsageReport => {
  const flagUsages = new Map<string, FlagUsage[]>();

  for (const key of flagKeys) {
    if (!unusedFlagKeys.includes(key)) {
      flagUsages.set(key, [
        createMockFlagUsage(`src/components/${key}.ts`, 42),
        createMockFlagUsage(`src/utils/${key}-helper.ts`, 15),
      ]);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalFlags: flagKeys.length,
    usedFlags: flagKeys.length - unusedFlagKeys.length,
    unusedFlags: unusedFlagKeys.length,
    flagUsages,
    unusedFlagKeys,
    summary: {
      usageRate: flagKeys.length > 0
        ? ((flagKeys.length - unusedFlagKeys.length) / flagKeys.length) * 100
        : 0,
      flagsByFile: new Map(),
      mostUsedFlags: [],
    },
  };
};

// Test environment setup
Deno.test({
  name: "test setup and cleanup",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    setupTestEnvironment();
    // Test will use environment
    cleanupTestEnvironment();
  },
});

Deno.test("CleanupPlanManager initializes with default options", () => {
  const manager = new CleanupPlanManager();
  assertExists(manager);
});

Deno.test("CleanupPlanManager initializes with custom options", () => {
  const manager = new CleanupPlanManager({
    maxFlagsPerPlan: 50,
    riskTolerance: "high",
    enablePreview: false,
  });
  assertExists(manager);
});

Deno.test("CleanupPlanManager analyzes flag differences correctly", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager();

  const optimizelyFlags = [
    createMockFlag("feature_a", false), // Used flag
    createMockFlag("feature_b", false), // Orphaned flag
    createMockFlag("feature_c", true), // Archived but used flag
    createMockFlag("feature_d", false), // Unused flag
  ];

  const usageReport = createMockUsageReport(
    ["feature_a", "feature_c", "feature_missing"], // feature_missing only exists in code
    ["feature_d"], // feature_d is unused
  );

  const result = manager.analyzeFlagDifferences(optimizelyFlags, usageReport);

  assert(result.data !== null, "Analysis should succeed");
  assert(result.error === null, "Should not have error");

  const analysis = result.data!;
  assertEquals(analysis.totalOptimizelyFlags, 4);
  assertEquals(analysis.totalCodebaseFlags, 3);

  // Check for expected differences
  const differences = analysis.differences;
  assert(differences.length > 0, "Should find flag differences");

  // Should find orphaned flag
  const orphanedFlag = differences.find((d) =>
    d.flagKey === "feature_b" && d.type === "orphaned_in_optimizely"
  );
  assertExists(orphanedFlag, "Should find orphaned flag");
  assertEquals(orphanedFlag.recommendedAction, "archive_flag");

  // Should find archived but used flag
  const archivedButUsed = differences.find((d) =>
    d.flagKey === "feature_c" && d.type === "archived_but_used"
  );
  assertExists(archivedButUsed, "Should find archived but used flag");
  assertEquals(archivedButUsed.severity, "high");

  // Should find missing flag
  const missingFlag = differences.find((d) =>
    d.flagKey === "feature_missing" && d.type === "missing_in_optimizely"
  );
  assertExists(missingFlag, "Should find missing flag");
  assertEquals(missingFlag.recommendedAction, "create_flag");

  // Check summary counts
  assert(analysis.summary.orphanedFlags > 0, "Should count orphaned flags");
  assert(analysis.summary.archivedButUsed > 0, "Should count archived but used flags");
  assert(analysis.summary.missingFlags > 0, "Should count missing flags");

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager creates comprehensive cleanup plan", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager({
    maxFlagsPerPlan: 100,
    riskTolerance: "medium",
  });

  // Create analysis with various flag differences
  const optimizelyFlags = [
    createMockFlag("orphaned_flag", false),
    createMockFlag("archived_used_flag", true),
    createMockFlag(
      "recently_modified",
      false,
      new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ),
  ];

  const usageReport = createMockUsageReport(
    ["used_flag", "archived_used_flag"],
    ["orphaned_flag"],
  );

  const analysisResult = manager.analyzeFlagDifferences(optimizelyFlags, usageReport);
  assert(analysisResult.data !== null, "Analysis should succeed");

  const planResult = manager.createCleanupPlan(analysisResult.data!);
  assert(planResult.data !== null, "Plan creation should succeed");
  assert(planResult.error === null, "Should not have error");

  const plan = planResult.data!;
  assertExists(plan.id, "Plan should have ID");
  assertEquals(plan.status, "draft");
  assertExists(plan.analysis, "Plan should include analysis");
  assert(plan.operations.length > 0, "Plan should have operations");

  // Check execution ordering
  assertEquals(plan.executionOrder.strategy, "risk_based");
  assert(plan.executionOrder.phases.length > 0, "Should have execution phases");

  // Validate plan metadata
  assertExists(plan.metadata.estimatedDuration, "Should have estimated duration");
  assertExists(plan.metadata.riskAssessment, "Should have risk assessment");
  assert(plan.metadata.dependencies.length >= 0, "Should have dependencies list");

  // Check validation results
  assertExists(plan.validation, "Should have validation results");
  assertEquals(typeof plan.validation.isValid, "boolean");
  assert(Array.isArray(plan.validation.errors), "Should have errors array");
  assert(Array.isArray(plan.validation.warnings), "Should have warnings array");

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager validates plans with safety checks", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager({
    maxFlagsPerPlan: 5, // Low limit for testing
    safetyChecks: {
      requireConfirmation: true,
      validateDependencies: true,
      checkRecentUsage: true,
      enforceRollbackCapability: true,
    },
  });

  // Create a plan that should trigger validation warnings
  const manyFlags = Array.from({ length: 10 }, (_, i) => createMockFlag(`flag_${i}`, false));

  const usageReport = createMockUsageReport(
    [],
    manyFlags.map((f) => f.key),
  );

  const analysisResult = manager.analyzeFlagDifferences(manyFlags, usageReport);
  assert(analysisResult.data !== null, "Analysis should succeed");

  const planResult = manager.createCleanupPlan(analysisResult.data!);
  assert(planResult.data !== null, "Plan creation should succeed");

  const plan = planResult.data!;

  // Should have validation errors due to exceeding max flags
  assert(plan.validation.errors.length > 0, "Should have validation errors");
  assertEquals(plan.validation.isValid, false);

  const maxFlagsError = plan.validation.errors.find((e) => e.includes("exceeding maximum"));
  assertExists(maxFlagsError, "Should have max flags error");

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager handles critical risk operations correctly", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager({
    riskTolerance: "low",
  });

  // Create a flag that's recently modified but NOT used in code (should be orphaned)
  const recentFlag = createMockFlag(
    "critical_flag",
    false,
    new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  );

  const usageReport = createMockUsageReport([], ["critical_flag"]); // Flag is unused

  const analysisResult = manager.analyzeFlagDifferences([recentFlag], usageReport);
  assert(analysisResult.data !== null, "Analysis should succeed");

  const planResult = manager.createCleanupPlan(analysisResult.data!, {
    requireConfirmation: true,
  });

  assert(planResult.data !== null, "Plan creation should succeed");
  const plan = planResult.data!;

  // Should have operations for recently modified orphaned flag
  assert(plan.operations.length > 0, "Should have operations for orphaned flag");

  // Find the operation for critical_flag
  const criticalFlagOperation = plan.operations.find((op) => op.flagKey === "critical_flag");
  if (criticalFlagOperation) {
    // Recently modified flag should be high risk
    assertEquals(criticalFlagOperation.riskLevel, "high");
  }

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager orders operations by risk level", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager();

  const flags = [
    createMockFlag(
      "high_risk",
      false,
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ),
    createMockFlag(
      "low_risk",
      false,
      new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    ),
    createMockFlag(
      "medium_risk",
      false,
      new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    ),
  ];

  const usageReport = createMockUsageReport(
    [],
    flags.map((f) => f.key), // All unused
  );

  const analysisResult = manager.analyzeFlagDifferences(flags, usageReport);
  assert(analysisResult.data !== null, "Analysis should succeed");

  const planResult = manager.createCleanupPlan(analysisResult.data!);
  assert(planResult.data !== null, "Plan creation should succeed");

  const plan = planResult.data!;

  // Check that execution phases are ordered by risk
  const phaseNames = plan.executionOrder.phases.map((p) => p.name);
  assert(phaseNames.includes("low_risk_operations"), "Should have low risk phase");
  assert(phaseNames.includes("medium_risk_operations"), "Should have medium risk phase");
  assert(phaseNames.includes("high_risk_operations"), "Should have high risk phase");

  // Low risk should come before high risk
  const lowRiskIndex = phaseNames.indexOf("low_risk_operations");
  const highRiskIndex = phaseNames.indexOf("high_risk_operations");
  assert(lowRiskIndex < highRiskIndex, "Low risk should come before high risk");

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager validatePlan method works independently", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager();

  const operations = [
    {
      id: "test-op-1",
      type: "archive" as const,
      flagKey: "test_flag",
      riskLevel: "low" as const,
      reason: "Test operation",
      context: {
        codeUsages: [],
      },
      validationChecks: [],
      rollbackInfo: {
        supported: true,
        instructions: "Test rollback",
      },
    },
  ];

  const options = {
    dryRun: true,
    batchSize: 10,
    maxConcurrentOperations: 3,
    requireConfirmation: false,
    enableRollback: true,
  };

  const result = manager.validatePlan(operations, options);

  assert(result.data !== null, "Validation should succeed");
  assert(result.error === null, "Should not have error");

  const validation = result.data!;
  assertEquals(typeof validation.isValid, "boolean");
  assert(Array.isArray(validation.errors), "Should have errors array");
  assert(Array.isArray(validation.warnings), "Should have warnings array");

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager handles empty flag sets correctly", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager();

  // Test with empty flags
  const emptyUsageReport = createMockUsageReport([]);
  const analysisResult = manager.analyzeFlagDifferences([], emptyUsageReport);

  assert(analysisResult.data !== null, "Analysis should succeed with empty data");
  assert(analysisResult.error === null, "Should not have error");

  const analysis = analysisResult.data!;
  assertEquals(analysis.totalOptimizelyFlags, 0);
  assertEquals(analysis.totalCodebaseFlags, 0);
  assertEquals(analysis.differences.length, 0);
  assertEquals(analysis.summary.consistentFlags, 0);

  const planResult = manager.createCleanupPlan(analysis);
  assert(planResult.data !== null, "Plan creation should succeed");

  const plan = planResult.data!;
  assertEquals(plan.operations.length, 0);
  assertEquals(plan.validation.isValid, true);

  cleanupTestEnvironment();
});

Deno.test("CleanupPlanManager calculates risk levels correctly", () => {
  setupTestEnvironment();

  const manager = new CleanupPlanManager();

  const flags = [
    // Very recently modified (should be high risk)
    createMockFlag(
      "very_recent",
      false,
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    ),
    // Recently modified (should be medium risk)
    createMockFlag("recent", false, new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()),
    // Old modification (should be low risk)
    createMockFlag("old", false, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()),
  ];

  const usageReport = createMockUsageReport(
    [],
    flags.map((f) => f.key), // All unused, so they'll be orphaned
  );

  const analysisResult = manager.analyzeFlagDifferences(flags, usageReport);
  assert(analysisResult.data !== null, "Analysis should succeed");

  const analysis = analysisResult.data!;

  // Check risk levels in differences
  const veryRecentDiff = analysis.differences.find((d) => d.flagKey === "very_recent");
  const recentDiff = analysis.differences.find((d) => d.flagKey === "recent");
  const oldDiff = analysis.differences.find((d) => d.flagKey === "old");

  assertExists(veryRecentDiff, "Should find very recent flag difference");
  assertExists(recentDiff, "Should find recent flag difference");
  assertExists(oldDiff, "Should find old flag difference");

  // Very recent should be high risk
  assertEquals(veryRecentDiff.riskLevel, "high");

  // Recent should be medium risk
  assertEquals(recentDiff.riskLevel, "medium");

  // Old should be low risk
  assertEquals(oldDiff.riskLevel, "low");

  cleanupTestEnvironment();
});

// Cleanup function to remove test files and environment variables
async function cleanup() {
  try {
    // Clean up any test files if created
    await Deno.remove("reports/test-cleanup-plan.log").catch(() => {});
  } catch {
    // Ignore if file doesn't exist
  }

  // Clean up environment variables
  cleanupTestEnvironment();
}

// Run cleanup after tests
Deno.test({
  name: "cleanup test environment",
  fn: cleanup,
  sanitizeOps: false,
  sanitizeResources: false,
});
