/**
 * Unit tests for plan preview module.
 * Tests preview generation, confirmation workflows, and different output formats.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { PlanPreviewManager } from "./plan-preview.ts";
import { CleanupPlan, CleanupPlanOptions } from "../types/sync.ts";
import { cleanupTestEnvironment, setupTestEnvironment } from "../utils/test-helpers.ts";

/**
 * Creates a mock cleanup plan for testing
 */
function createMockCleanupPlan(options: {
  operationsCount?: number;
  hasHighRiskOperations?: boolean;
  hasValidationErrors?: boolean;
  estimatedDuration?: number;
} = {}): CleanupPlan {
  const {
    operationsCount = 3,
    hasHighRiskOperations = false,
    hasValidationErrors = false,
    estimatedDuration = 15000,
  } = options;

  const operations = Array.from({ length: operationsCount }, (_, i) => ({
    id: `op-${i + 1}`,
    type: "archive" as const,
    flagKey: `test_flag_${i + 1}`,
    riskLevel: hasHighRiskOperations && i === 0 ? "high" as const : "low" as const,
    reason: `Test operation ${i + 1}`,
    context: {
      codeUsages: [],
    },
    validationChecks: [],
    rollbackInfo: {
      supported: true,
      instructions: `Rollback operation ${i + 1}`,
    },
  }));

  const planOptions: CleanupPlanOptions = {
    dryRun: true,
    batchSize: 10,
    maxConcurrentOperations: 3,
    requireConfirmation: true,
    enableRollback: true,
  };

  return {
    id: "test-plan-123",
    timestamp: new Date().toISOString(),
    status: "draft",
    analysis: {
      timestamp: new Date().toISOString(),
      totalOptimizelyFlags: 10,
      totalCodebaseFlags: 8,
      differences: [],
      summary: {
        orphanedFlags: 2,
        missingFlags: 1,
        archivedButUsed: 1,
        activeButUnused: 3,
        consistentFlags: 5,
      },
    },
    operations,
    executionOrder: {
      strategy: "risk_based",
      phases: [
        {
          name: "low_risk_operations",
          description: "Execute low-risk operations",
          operations: operations.map((op) => ({ flagKey: op.flagKey, reason: "Low risk" })),
        },
      ],
      dependencies: new Map(),
    },
    options: planOptions,
    validation: {
      isValid: !hasValidationErrors,
      errors: hasValidationErrors ? ["Test validation error"] : [],
      warnings: ["Test warning"],
      info: [],
      riskAssessment: {
        overallRisk: hasHighRiskOperations ? "high" : "low",
        highRiskOperations: hasHighRiskOperations ? 1 : 0,
        potentialImpact: ["Test impact"],
        recommendations: ["Test recommendation"],
      },
    },
    metadata: {
      createdBy: "test-user",
      estimatedDuration,
      riskAssessment: {
        overallRisk: hasHighRiskOperations ? "high" : "low",
        highRiskOperations: hasHighRiskOperations ? 1 : 0,
        potentialImpact: ["Test impact"],
        recommendations: ["Test recommendation"],
      },
      dependencies: ["Test dependency"],
    },
  };
}

// Test environment setup
Deno.test({
  name: "test setup and cleanup",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    setupTestEnvironment();
    cleanupTestEnvironment();
  },
});

Deno.test("PlanPreviewManager initializes with default options", () => {
  const manager = new PlanPreviewManager();
  assertExists(manager);
});

Deno.test("PlanPreviewManager initializes with custom options", () => {
  const manager = new PlanPreviewManager(
    { format: "markdown", showDetails: false },
    { requireConfirmation: false, allowInteractive: false },
  );
  assertExists(manager);
});

Deno.test("PlanPreviewManager generates console preview correctly", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "console",
    showDetails: true,
    includeRiskAnalysis: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 2 });
  const result = manager.generatePreview(plan);

  assert(result.data !== null, "Preview generation should succeed");
  assert(result.error === null, "Should not have error");

  const preview = result.data!;
  assert(preview.content.includes("CLEANUP PLAN PREVIEW"), "Should contain title");
  assert(preview.content.includes("Plan ID: test-plan-123"), "Should contain plan ID");
  assert(preview.content.includes("Total Operations: 2"), "Should show operation count");
  assert(preview.content.includes("OPERATIONS:"), "Should show operations section");
  assert(preview.content.includes("RISK ANALYSIS:"), "Should show risk analysis");

  // Check metadata
  assertEquals(preview.metadata.totalOperations, 2);
  assertEquals(preview.metadata.overallRisk, "low");
  assertEquals(typeof preview.metadata.estimatedDurationMs, "number");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager generates markdown preview correctly", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "markdown",
    showDetails: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  const result = manager.generatePreview(plan);

  assert(result.data !== null, "Preview generation should succeed");
  const preview = result.data!;

  assert(preview.content.includes("# Cleanup Plan Preview"), "Should contain markdown title");
  assert(preview.content.includes("**Plan ID:**"), "Should contain plan ID in markdown format");
  assert(preview.content.includes("## Summary"), "Should have summary section");
  assert(preview.content.includes("## Flag Analysis"), "Should have flag analysis section");
  assert(preview.content.includes("## Operations"), "Should have operations section");
  assert(preview.content.includes("`test_flag_1`"), "Should format flag keys as code");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager generates JSON preview correctly", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "json",
    showDetails: true,
    includeRiskAnalysis: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  const result = manager.generatePreview(plan);

  assert(result.data !== null, "Preview generation should succeed");
  const preview = result.data!;

  // Should be valid JSON
  const parsedJson = JSON.parse(preview.content);
  assertExists(parsedJson.planId);
  assertEquals(parsedJson.planId, "test-plan-123");
  assertExists(parsedJson.summary);
  assertExists(parsedJson.operations);
  assertEquals(parsedJson.operations.length, 1);
  assertExists(parsedJson.riskAssessment);

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles high-risk operations in preview", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  const plan = createMockCleanupPlan({
    operationsCount: 2,
    hasHighRiskOperations: true,
  });

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview generation should succeed");

  const preview = result.data!;
  assertEquals(preview.metadata.overallRisk, "high");
  assertEquals(preview.metadata.highRiskOperations, 1);
  assert(preview.warnings.length > 0, "Should have warnings for high-risk operations");

  // Should not be safe to execute automatically
  assertEquals(preview.isSafeToExecute, false);

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager generates appropriate warnings", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  const plan = createMockCleanupPlan({
    operationsCount: 5,
    hasHighRiskOperations: true,
    estimatedDuration: 400000, // > 5 minutes
  });

  // Add some operations without rollback support
  plan.operations[0].rollbackInfo!.supported = false;
  plan.operations[1].rollbackInfo!.supported = false;

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview generation should succeed");

  const preview = result.data!;
  assert(preview.warnings.length > 0, "Should have warnings");

  // Check for specific warnings
  const hasRollbackWarning = preview.warnings.some((w) =>
    w.includes("do not support automatic rollback")
  );
  const hasDurationWarning = preview.warnings.some((w) =>
    w.includes("may take longer than 5 minutes")
  );

  assert(hasRollbackWarning, "Should warn about rollback support");
  assert(hasDurationWarning, "Should warn about long execution time");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager confirms safe plans automatically", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: false,
  });

  const plan = createMockCleanupPlan({
    operationsCount: 1,
    hasHighRiskOperations: false,
  });

  const previewResult = manager.generatePreview(plan);
  assert(previewResult.data !== null, "Preview generation should succeed");

  const confirmationResult = await manager.requestConfirmation(plan, previewResult.data!);
  assert(confirmationResult.data !== null, "Confirmation should succeed");

  const confirmation = confirmationResult.data!;
  assertEquals(confirmation.confirmed, true);
  assertEquals(confirmation.method, "automatic");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager rejects high-risk plans when interactive is disabled", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    allowInteractive: false,
    explicitConfirmationRisks: ["high", "critical"],
  });

  const plan = createMockCleanupPlan({
    operationsCount: 1,
    hasHighRiskOperations: true,
  });

  const previewResult = manager.generatePreview(plan);
  assert(previewResult.data !== null, "Preview generation should succeed");

  const confirmationResult = await manager.requestConfirmation(plan, previewResult.data!);
  assert(confirmationResult.data !== null, "Confirmation should complete");

  const confirmation = confirmationResult.data!;
  assertEquals(confirmation.confirmed, false);
  assertEquals(confirmation.method, "automatic");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles confirmation timeout for high-risk operations", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    allowInteractive: true,
    explicitConfirmationRisks: ["high", "critical"],
    confirmationTimeoutMs: 1000,
  });

  const plan = createMockCleanupPlan({
    operationsCount: 1,
    hasHighRiskOperations: true,
  });

  const previewResult = manager.generatePreview(plan);
  assert(previewResult.data !== null, "Preview generation should succeed");

  const confirmationResult = await manager.requestConfirmation(plan, previewResult.data!);
  assert(confirmationResult.data !== null, "Confirmation should complete");

  const confirmation = confirmationResult.data!;
  assertEquals(confirmation.confirmed, false);
  assertEquals(confirmation.method, "timeout");
  assertExists(confirmation.userNotes);
  assert(confirmation.userNotes!.includes("timeout"), "Should mention timeout");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager reviewPlan combines preview and confirmation", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: false,
  });

  const plan = createMockCleanupPlan({
    operationsCount: 1,
    hasHighRiskOperations: false,
  });

  const result = await manager.reviewPlan(plan);
  assert(result.data !== null, "Review should succeed");
  assert(result.error === null, "Should not have error");

  const review = result.data!;
  assertExists(review.preview, "Should have preview");
  assertExists(review.confirmation, "Should have confirmation");

  assertEquals(review.preview.metadata.totalOperations, 1);
  assertEquals(review.confirmation.confirmed, true);

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles validation errors in preview", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  const plan = createMockCleanupPlan({
    operationsCount: 1,
    hasValidationErrors: true,
  });

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview generation should succeed");

  const preview = result.data!;
  assertEquals(preview.isSafeToExecute, false);
  assert(preview.content.includes("VALIDATION ERRORS:"), "Should show validation errors");
  assert(preview.content.includes("Test validation error"), "Should show specific error");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager formats console preview without optional sections", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "console",
    showDetails: false,
    includeRiskAnalysis: false,
    showRollbackInfo: false,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  const result = manager.generatePreview(plan);

  assert(result.data !== null, "Preview generation should succeed");
  const preview = result.data!;

  assert(!preview.content.includes("OPERATIONS:"), "Should not show operations detail");
  assert(!preview.content.includes("RISK ANALYSIS:"), "Should not show risk analysis");
  assert(preview.content.includes("SUMMARY:"), "Should still show summary");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles empty plan correctly", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  const plan = createMockCleanupPlan({ operationsCount: 0 });
  const result = manager.generatePreview(plan);

  assert(result.data !== null, "Preview generation should succeed");
  const preview = result.data!;

  assertEquals(preview.metadata.totalOperations, 0);
  assertEquals(preview.metadata.highRiskOperations, 0);
  assertEquals(preview.isSafeToExecute, true); // Empty plan is safe

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager assesses plan safety correctly", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  // Test safe plan
  const safePlan = createMockCleanupPlan({
    operationsCount: 1,
    hasHighRiskOperations: false,
    hasValidationErrors: false,
  });

  const safeResult = manager.generatePreview(safePlan);
  assert(safeResult.data !== null, "Preview should succeed");
  assertEquals(safeResult.data!.isSafeToExecute, true);

  // Test unsafe plan (validation errors)
  const invalidPlan = createMockCleanupPlan({
    operationsCount: 1,
    hasValidationErrors: true,
  });

  const invalidResult = manager.generatePreview(invalidPlan);
  assert(invalidResult.data !== null, "Preview should succeed");
  assertEquals(invalidResult.data!.isSafeToExecute, false);

  // Test unsafe plan (high risk)
  const highRiskPlan = createMockCleanupPlan({
    operationsCount: 1,
    hasHighRiskOperations: true,
  });
  // Set overall risk to high
  highRiskPlan.metadata.riskAssessment.overallRisk = "high";

  const highRiskResult = manager.generatePreview(highRiskPlan);
  assert(highRiskResult.data !== null, "Preview should succeed");
  assertEquals(highRiskResult.data!.isSafeToExecute, false);

  cleanupTestEnvironment();
});

// Cleanup function
async function cleanup() {
  try {
    // Clean up any test files if created
    await Deno.remove("reports/test-plan-preview.log").catch(() => {});
  } catch {
    // Ignore if file doesn't exist
  }

  cleanupTestEnvironment();
}

// Run cleanup after tests
Deno.test({
  name: "cleanup test environment",
  fn: cleanup,
  sanitizeOps: false,
  sanitizeResources: false,
});
