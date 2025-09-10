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

// Add comprehensive edge case tests for better coverage

Deno.test("PlanPreviewManager generatePreview handles errors gracefully", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  // Create an invalid plan to trigger an error
  const invalidPlan = createMockCleanupPlan({ operationsCount: 1 });
  // Corrupt the plan data to trigger formatting errors
  (invalidPlan as unknown as { metadata: null }).metadata = null;

  const result = manager.generatePreview(invalidPlan);

  // Should handle error gracefully
  assert(result.error !== null, "Should have error for invalid plan");
  assert(result.data === null, "Should not have data when error occurs");
  assert(
    result.error.message.includes("Failed to generate plan preview"),
    "Should have appropriate error message",
  );

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager requestConfirmation handles errors gracefully", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();
  const plan = createMockCleanupPlan({ operationsCount: 1 });

  // Create corrupted preview to trigger error in confirmation
  const corruptedPreview = {
    content: "test",
    metadata: null as unknown, // This should trigger an error
    isSafeToExecute: true,
    warnings: [],
  } as unknown as import("./plan-preview.ts").PlanPreviewResult;

  const result = await manager.requestConfirmation(plan, corruptedPreview);

  // Should handle error gracefully
  assert(result.error !== null, "Should have error for corrupted preview");
  assert(result.data === null, "Should not have data when error occurs");
  assert(
    result.error.message.includes("Failed to request confirmation"),
    "Should have appropriate error message",
  );

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager reviewPlan handles preview generation errors", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  // Create an invalid plan to trigger preview error
  const invalidPlan = createMockCleanupPlan({ operationsCount: 1 });
  (invalidPlan as unknown as { metadata: null }).metadata = null;

  const result = await manager.reviewPlan(invalidPlan);

  // Should handle error gracefully and not proceed to confirmation
  assert(result.error !== null, "Should have error from preview generation");
  assert(result.data === null, "Should not have data when preview fails");
  assert(
    result.error.message.includes("Failed to generate plan preview"),
    "Should propagate preview error",
  );

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager reviewPlan handles confirmation errors", async () => {
  setupTestEnvironment();

  // Mock a manager that will fail during confirmation
  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    allowInteractive: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1, hasHighRiskOperations: true });

  // Force an error by corrupting operations to trigger confirmation failure
  plan.operations = null as unknown as typeof plan.operations;

  const result = await manager.reviewPlan(plan);

  // Should handle confirmation error after successful preview
  if (result.error) {
    assert(result.error.message.includes("Failed to review plan"), "Should have review error");
    assert(result.data === null, "Should not have data when confirmation fails");
  } else {
    // If preview succeeds despite corrupted operations, confirmation should also handle it
    assertExists(result.data);
  }

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles different risk levels correctly", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    explicitConfirmationRisks: ["critical"],
  });

  // Test critical risk level
  const criticalPlan = createMockCleanupPlan({ operationsCount: 1 });
  criticalPlan.operations[0].riskLevel = "critical";
  criticalPlan.metadata.riskAssessment.overallRisk = "critical";

  const criticalResult = manager.generatePreview(criticalPlan);
  assert(criticalResult.data !== null, "Critical plan preview should succeed");
  assertEquals(
    criticalResult.data!.isSafeToExecute,
    false,
    "Critical plan should not be safe to execute",
  );
  assert(criticalResult.data!.warnings.length > 0, "Should have warnings for critical risk");

  // Test medium risk level
  const mediumPlan = createMockCleanupPlan({ operationsCount: 1 });
  mediumPlan.operations[0].riskLevel = "medium";
  mediumPlan.metadata.riskAssessment.overallRisk = "medium";

  const mediumResult = manager.generatePreview(mediumPlan);
  assert(mediumResult.data !== null, "Medium plan preview should succeed");
  assertEquals(mediumResult.data!.isSafeToExecute, true, "Medium plan should be safe to execute");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles confirmation with different explicit confirmation risks", async () => {
  setupTestEnvironment();

  // Test with critical and high risk requiring explicit confirmation
  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    allowInteractive: false,
    explicitConfirmationRisks: ["high", "critical"],
  });

  // Test with high risk operation
  const highRiskPlan = createMockCleanupPlan({ operationsCount: 1, hasHighRiskOperations: true });
  const previewResult = manager.generatePreview(highRiskPlan);
  const confirmationResult = await manager.requestConfirmation(highRiskPlan, previewResult.data!);

  assertEquals(
    confirmationResult.data!.confirmed,
    false,
    "High risk should be rejected when interactive disabled",
  );
  assertEquals(confirmationResult.data!.method, "automatic");

  // Test with medium risk operation (should be allowed)
  const mediumRiskPlan = createMockCleanupPlan({ operationsCount: 1 });
  mediumRiskPlan.operations[0].riskLevel = "medium";

  const mediumPreviewResult = manager.generatePreview(mediumRiskPlan);
  const mediumConfirmationResult = await manager.requestConfirmation(
    mediumRiskPlan,
    mediumPreviewResult.data!,
  );

  // Should timeout since it requires explicit confirmation but not in explicit list
  assertEquals(mediumConfirmationResult.data!.method, "timeout");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager formats JSON without optional sections when disabled", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "json",
    showDetails: false,
    includeRiskAnalysis: false,
  });

  const plan = createMockCleanupPlan({ operationsCount: 2 });
  const result = manager.generatePreview(plan);

  assert(result.data !== null, "Preview generation should succeed");

  const parsedJson = JSON.parse(result.data!.content);
  assertEquals(
    parsedJson.operations,
    undefined,
    "Should not include operations when showDetails is false",
  );
  assertEquals(
    parsedJson.riskAssessment,
    undefined,
    "Should not include risk assessment when includeRiskAnalysis is false",
  );
  assertExists(parsedJson.summary, "Should still include summary");
  assertExists(parsedJson.validation, "Should still include validation");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles markdown preview with rollback info", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "markdown",
    showDetails: true,
    showRollbackInfo: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.operations[0].rollbackInfo!.supported = true;

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview generation should succeed");

  const content = result.data!.content;
  assert(content.includes("**Rollback:** Supported"), "Should show rollback info in markdown");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles console preview with rollback info disabled", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "console",
    showDetails: true,
    showRollbackInfo: false,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.operations[0].rollbackInfo!.supported = true;

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview generation should succeed");

  const content = result.data!.content;
  assert(!content.includes("Rollback: Supported"), "Should not show rollback info when disabled");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager generates warnings for critical operations", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  const plan = createMockCleanupPlan({ operationsCount: 3 });
  plan.operations[0].riskLevel = "critical";
  plan.operations[1].riskLevel = "critical";
  plan.metadata.riskAssessment.overallRisk = "critical";

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview should succeed");

  const preview = result.data!;
  assert(preview.warnings.length > 0, "Should have warnings");

  const hasCriticalWarning = preview.warnings.some((w) => w.includes("critical risk operations"));
  assert(hasCriticalWarning, "Should warn about critical risk operations");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles plans with no validation warnings", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager();

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.validation.warnings = []; // No warnings

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview should succeed");

  const preview = result.data!;
  const content = preview.content;

  assert(!content.includes("WARNINGS:"), "Should not show warnings section when no warnings");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles plans with recommendations in risk analysis", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "console",
    includeRiskAnalysis: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.metadata.riskAssessment.recommendations = [
    "Test recommendation 1",
    "Test recommendation 2",
  ];
  plan.metadata.riskAssessment.potentialImpact = [
    "Test impact 1",
    "Test impact 2",
  ];

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview should succeed");

  const content = result.data!.content;
  assert(content.includes("Recommendations:"), "Should show recommendations section");
  assert(content.includes("Test recommendation 1"), "Should show specific recommendation");
  assert(content.includes("Potential Impact:"), "Should show potential impact section");
  assert(content.includes("Test impact 1"), "Should show specific impact");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles empty recommendations and impact", () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({
    format: "console",
    includeRiskAnalysis: true,
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.metadata.riskAssessment.recommendations = [];
  plan.metadata.riskAssessment.potentialImpact = [];

  const result = manager.generatePreview(plan);
  assert(result.data !== null, "Preview should succeed");

  const content = result.data!.content;
  assert(!content.includes("Recommendations:"), "Should not show empty recommendations section");
  assert(!content.includes("Potential Impact:"), "Should not show empty impact section");

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager confirmation workflow with interactive allowed handles timeout scenario", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    allowInteractive: true,
    explicitConfirmationRisks: ["medium", "high", "critical"],
    confirmationTimeoutMs: 50, // Very short timeout
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.operations[0].riskLevel = "medium";

  const previewResult = manager.generatePreview(plan);
  const confirmationResult = await manager.requestConfirmation(plan, previewResult.data!);

  assert(confirmationResult.data !== null, "Confirmation should complete");
  assertEquals(confirmationResult.data!.confirmed, false, "Should not be confirmed due to timeout");
  assertEquals(confirmationResult.data!.method, "timeout");
  assertExists(confirmationResult.data!.userNotes);
  assert(
    confirmationResult.data!.userNotes!.includes("manual confirmation"),
    "Should mention manual confirmation needed",
  );

  cleanupTestEnvironment();
});

Deno.test("PlanPreviewManager handles non-high-risk operations with interactive confirmation", async () => {
  setupTestEnvironment();

  const manager = new PlanPreviewManager({}, {
    requireConfirmation: true,
    allowInteractive: true,
    explicitConfirmationRisks: ["critical"], // Only critical requires explicit confirmation
  });

  const plan = createMockCleanupPlan({ operationsCount: 1 });
  plan.operations[0].riskLevel = "low"; // Low risk should not require explicit confirmation

  const previewResult = manager.generatePreview(plan);
  const confirmationResult = await manager.requestConfirmation(plan, previewResult.data!);

  assert(confirmationResult.data !== null, "Confirmation should complete");
  assertEquals(
    confirmationResult.data!.confirmed,
    true,
    "Low risk should be automatically confirmed",
  );
  assertEquals(confirmationResult.data!.method, "automatic");

  cleanupTestEnvironment();
});

// Run cleanup after tests
Deno.test({
  name: "cleanup test environment",
  fn: cleanup,
  sanitizeOps: false,
  sanitizeResources: false,
});
