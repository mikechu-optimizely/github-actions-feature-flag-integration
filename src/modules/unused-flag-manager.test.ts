import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  UnusedFlagManager,
  UnusedFlagManagerConfig,
  UnusedFlagReport,
} from "./unused-flag-manager.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { AuditReporter, OperationContext, UserContext } from "./audit-reporter.ts";
import { FlagUsage } from "./code-analysis.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import { Result } from "../utils/try-catch.ts";

// Set up environment for tests
const envVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "123456",
  GITHUB_TOKEN: "gh-token",
  OPERATION: "cleanup",
  DRY_RUN: "true",
};

function setTestEnv() {
  for (const [k, v] of Object.entries(envVars)) {
    Deno.env.set(k, v);
  }
}

function createMockOptimizelyApiClient(): OptimizelyApiClient {
  setTestEnv();

  // Create a real client instance for testing
  const client = new OptimizelyApiClient("test-token");

  // Override the archiveFeatureFlag method to return success without making real API calls
  client.archiveFeatureFlag = (_flagKey: string): Promise<Result<boolean, Error>> => {
    // Simulate successful archiving
    return Promise.resolve({ data: true, error: null });
  };

  return client;
}

function createUserContext(): UserContext {
  return {
    userId: "test-user",
    source: "test",
    sessionId: "test-session-123",
    origin: "localhost",
  };
}

function createOperationContext(): OperationContext {
  return {
    type: "cleanup",
    operationId: "test-operation-123",
    dryRun: true,
    startTime: new Date().toISOString(),
    metadata: { test: true },
  };
}

function createMockOptimizelyFlag(
  key: string,
  overrides: Partial<OptimizelyFlag> = {},
): OptimizelyFlag {
  return {
    key,
    name: `Test Flag ${key}`,
    description: "A test flag",
    url: `https://app.optimizely.com/flags/${key}`,
    archived: false,
    id: Math.floor(Math.random() * 100000),
    urn: `urn:flag:${key}`,
    project_id: 12345,
    account_id: 67890,
    created_by_user_id: "test@optimizely.com",
    created_by_user_email: "test@optimizely.com",
    role: "admin",
    created_time: "2024-01-01T00:00:00Z",
    updated_time: "2024-01-01T00:00:00Z",
    revision: 1,
    outlier_filtering_enabled: false,
    environments: {
      production: {
        key: "production",
        name: "Production",
        enabled: false,
        id: 123456,
        has_restricted_permissions: false,
        priority: 1,
        status: "running",
        created_time: "2024-01-01T00:00:00Z",
      },
    },
    ...overrides,
  };
}

Deno.test("UnusedFlagManager constructor initializes with default config", () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");

  const manager = new UnusedFlagManager(mockClient, auditReporter);

  assertExists(manager);
});

Deno.test("UnusedFlagManager constructor accepts custom config", () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");

  const config: Partial<UnusedFlagManagerConfig> = {
    dryRun: false,
    maxArchivedPerExecution: 5,
    excludePatterns: ["test_*", "dev_*"],
  };

  const manager = new UnusedFlagManager(mockClient, auditReporter, config);

  assertExists(manager);
});

Deno.test("UnusedFlagManager generates unused flag report", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");
  const manager = new UnusedFlagManager(mockClient, auditReporter);

  const flagKeys = ["flag1", "flag2", "flag3"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag1", [{ file: "src/test.ts", line: 1, context: "isEnabled('flag1')" }]],
    ["flag2", []],
    ["flag3", []],
  ]);

  const optimizelyFlags = new Map<string, OptimizelyFlag>([
    ["flag1", createMockOptimizelyFlag("flag1")],
    ["flag2", createMockOptimizelyFlag("flag2")],
    ["flag3", createMockOptimizelyFlag("flag3")],
  ]);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const report = await manager.generateUnusedFlagReport(
    flagKeys,
    flagUsages,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  assertExists(report);
  assertEquals(report.totalFlags, 3);
  assertEquals(report.unusedFlags.length, 2); // flag2 and flag3 are unused
  assertExists(report.archivingPlan);
  assertExists(report.validationResults);
  assert(report.recommendations.length > 0);
});

Deno.test("UnusedFlagManager identifies low-risk flags for archiving", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");
  const manager = new UnusedFlagManager(mockClient, auditReporter);

  const flagKeys = ["safe_flag", "risky_flag"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["safe_flag", []],
    ["risky_flag", []],
  ]);

  // Create flags with different risk profiles
  const optimizelyFlags = new Map<string, OptimizelyFlag>([
    [
      "safe_flag",
      createMockOptimizelyFlag("safe_flag", {
        updated_time: "2024-01-01T00:00:00Z", // Old modification
        environments: {
          production: {
            key: "production",
            name: "Production",
            enabled: false, // Disabled
            id: 123456,
            has_restricted_permissions: false,
            priority: 1,
            status: "running",
            created_time: "2024-01-01T00:00:00Z",
          },
        },
      }),
    ],
    [
      "risky_flag",
      createMockOptimizelyFlag("risky_flag", {
        updated_time: new Date().toISOString(), // Recently modified
        environments: {
          production: {
            key: "production",
            name: "Production",
            enabled: true, // Still enabled
            id: 123457,
            has_restricted_permissions: false,
            priority: 1,
            status: "running",
            created_time: "2024-01-01T00:00:00Z",
          },
        },
      }),
    ],
  ]);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const report = await manager.generateUnusedFlagReport(
    flagKeys,
    flagUsages,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  const safeFlag = report.unusedFlags.find((f) => f.key === "safe_flag");
  const riskyFlag = report.unusedFlags.find((f) => f.key === "risky_flag");

  assertExists(safeFlag);
  assertExists(riskyFlag);

  assertEquals(safeFlag.recommendedAction, "archive");
  assertEquals(safeFlag.riskLevel, "low");

  assertEquals(riskyFlag.recommendedAction, "review");
  assertEquals(riskyFlag.riskLevel, "high");

  // Archiving plan should only include safe flags
  assertEquals(report.archivingPlan.flagsToArchive.length, 1);
  assertEquals(report.archivingPlan.flagsToArchive[0], "safe_flag");
  assertEquals(report.archivingPlan.flagsToReview.length, 1);
  assertEquals(report.archivingPlan.flagsToReview[0], "risky_flag");
});

Deno.test("UnusedFlagManager handles already archived flags", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");
  const manager = new UnusedFlagManager(mockClient, auditReporter);

  const flagKeys = ["archived_flag"];
  const flagUsages = new Map<string, FlagUsage[]>([["archived_flag", []]]);

  const optimizelyFlags = new Map<string, OptimizelyFlag>([
    [
      "archived_flag",
      createMockOptimizelyFlag("archived_flag", {
        archived: true, // Already archived
      }),
    ],
  ]);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const report = await manager.generateUnusedFlagReport(
    flagKeys,
    flagUsages,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  const archivedFlag = report.unusedFlags.find((f) => f.key === "archived_flag");
  assertExists(archivedFlag);
  assertEquals(archivedFlag.recommendedAction, "keep");
  assertEquals(archivedFlag.reason, "Flag is already archived");
  assertEquals(archivedFlag.riskLevel, "low");
});

Deno.test("UnusedFlagManager respects exclusion patterns", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");

  const config: Partial<UnusedFlagManagerConfig> = {
    excludePatterns: ["test_.*", "dev_.*"],
  };

  const manager = new UnusedFlagManager(mockClient, auditReporter, config);

  const flagKeys = ["test_flag", "dev_flag", "prod_flag"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["test_flag", []],
    ["dev_flag", []],
    ["prod_flag", []],
  ]);

  const optimizelyFlags = new Map<string, OptimizelyFlag>([
    ["test_flag", createMockOptimizelyFlag("test_flag")],
    ["dev_flag", createMockOptimizelyFlag("dev_flag")],
    ["prod_flag", createMockOptimizelyFlag("prod_flag")],
  ]);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const report = await manager.generateUnusedFlagReport(
    flagKeys,
    flagUsages,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  const testFlag = report.unusedFlags.find((f) => f.key === "test_flag");
  const devFlag = report.unusedFlags.find((f) => f.key === "dev_flag");
  const prodFlag = report.unusedFlags.find((f) => f.key === "prod_flag");

  assertExists(testFlag);
  assertExists(devFlag);
  assertExists(prodFlag);

  assertEquals(testFlag.recommendedAction, "keep"); // Excluded
  assertEquals(devFlag.recommendedAction, "keep"); // Excluded
  assertEquals(prodFlag.recommendedAction, "archive"); // Not excluded
});

Deno.test("UnusedFlagManager implements archiving recommendations in dry-run mode", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");

  const config: Partial<UnusedFlagManagerConfig> = {
    dryRun: true,
  };

  const manager = new UnusedFlagManager(mockClient, auditReporter, config);

  // Create a mock report with flags ready for archiving
  const mockReport: UnusedFlagReport = {
    timestamp: new Date().toISOString(),
    executionId: "test-123",
    totalFlags: 2,
    unusedFlags: [
      {
        key: "flag1",
        environments: [],
        archived: false,
        recommendedAction: "archive",
        reason: "Not found in codebase",
        riskLevel: "low",
      },
      {
        key: "flag2",
        environments: [],
        archived: false,
        recommendedAction: "archive",
        reason: "Not found in codebase",
        riskLevel: "low",
      },
    ],
    recommendations: [],
    archivingPlan: {
      timestamp: new Date().toISOString(),
      flagsToArchive: ["flag1", "flag2"],
      flagsToReview: [],
      safetyChecks: [],
      estimatedImpact: {
        flagsArchived: 2,
        environmentsAffected: [],
        riskAssessment: "LOW",
      },
    },
    validationResults: [
      {
        flagKey: "flag1",
        isValid: true,
        issues: [],
        recommendations: [],
      },
      {
        flagKey: "flag2",
        isValid: true,
        issues: [],
        recommendations: [],
      },
    ],
  };

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const result = await manager.implementArchivingRecommendations(
    mockReport,
    userContext,
    operationContext,
  );

  // In dry-run mode, flags should be "archived" without actual API calls
  assertEquals(result.archivedFlags.length, 2);
  assertEquals(result.failedArchives.length, 0);
  assertEquals(result.skippedFlags.length, 0);
  assertEquals(result.archivedFlags, ["flag1", "flag2"]);
});

Deno.test("UnusedFlagManager skips flags with validation issues", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");
  const manager = new UnusedFlagManager(mockClient, auditReporter);

  // Create a mock report with validation issues
  const mockReport: UnusedFlagReport = {
    timestamp: new Date().toISOString(),
    executionId: "test-123",
    totalFlags: 2,
    unusedFlags: [
      {
        key: "valid_flag",
        environments: [],
        archived: false,
        recommendedAction: "archive",
        reason: "Not found in codebase",
        riskLevel: "low",
      },
      {
        key: "invalid_flag",
        environments: [],
        archived: false,
        recommendedAction: "archive",
        reason: "Not found in codebase",
        riskLevel: "low",
      },
    ],
    recommendations: [],
    archivingPlan: {
      timestamp: new Date().toISOString(),
      flagsToArchive: ["valid_flag", "invalid_flag"],
      flagsToReview: [],
      safetyChecks: [],
      estimatedImpact: {
        flagsArchived: 2,
        environmentsAffected: [],
        riskAssessment: "LOW",
      },
    },
    validationResults: [
      {
        flagKey: "valid_flag",
        isValid: true,
        issues: [],
        recommendations: [],
      },
      {
        flagKey: "invalid_flag",
        isValid: false, // Validation failed
        issues: ["Flag is enabled in production"],
        recommendations: ["Disable flag before archiving"],
      },
    ],
  };

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const result = await manager.implementArchivingRecommendations(
    mockReport,
    userContext,
    operationContext,
  );

  // Only valid flag should be archived, invalid flag should be skipped
  assertEquals(result.archivedFlags.length, 1);
  assertEquals(result.archivedFlags[0], "valid_flag");
  assertEquals(result.skippedFlags.length, 1);
  assertEquals(result.skippedFlags[0].flag, "invalid_flag");
  assert(result.skippedFlags[0].reason.includes("Validation failed"));
});

Deno.test("UnusedFlagManager performs safe archiving validation", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");

  const config: Partial<UnusedFlagManagerConfig> = {
    environmentValidation: true,
  };

  const manager = new UnusedFlagManager(mockClient, auditReporter, config);

  const flagKeys = ["safe_flag", "enabled_flag", "missing_flag"];

  const optimizelyFlags = new Map<string, OptimizelyFlag>([
    [
      "safe_flag",
      createMockOptimizelyFlag("safe_flag", {
        environments: {
          production: {
            key: "production",
            name: "Production",
            enabled: false, // Safe to archive
            id: 123456,
            has_restricted_permissions: false,
            priority: 1,
            status: "running",
            created_time: "2024-01-01T00:00:00Z",
          },
        },
      }),
    ],
    [
      "enabled_flag",
      createMockOptimizelyFlag("enabled_flag", {
        environments: {
          production: {
            key: "production",
            name: "Production",
            enabled: true, // Not safe to archive
            id: 123457,
            has_restricted_permissions: false,
            priority: 1,
            status: "running",
            created_time: "2024-01-01T00:00:00Z",
          },
        },
      }),
    ],
    // missing_flag intentionally not in the map
  ]);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const validationResults = await manager.implementSafeArchivingValidation(
    flagKeys,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  assertEquals(validationResults.length, 3);

  const safeResult = validationResults.find((r) => r.flagKey === "safe_flag");
  const enabledResult = validationResults.find((r) => r.flagKey === "enabled_flag");
  const missingResult = validationResults.find((r) => r.flagKey === "missing_flag");

  assertExists(safeResult);
  assertExists(enabledResult);
  assertExists(missingResult);

  assertEquals(safeResult.isValid, true);
  assertEquals(safeResult.issues.length, 0);

  assertEquals(enabledResult.isValid, false);
  assert(enabledResult.issues.some((issue) => issue.includes("enabled in production")));

  assertEquals(missingResult.isValid, false);
  assert(missingResult.issues.some((issue) => issue.includes("not found in Optimizely")));
});

Deno.test("UnusedFlagManager creates detailed audit logs", () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");
  const manager = new UnusedFlagManager(mockClient, auditReporter);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  manager.createDetailedAuditLog(
    "test_flag",
    "flag_unused",
    userContext,
    operationContext,
    "flag_marked_for_archival",
    { reason: "not_found_in_codebase", riskLevel: "low" },
  );

  const summary = auditReporter.getSummary();
  assertEquals(summary.total, 1);
  assertEquals((summary.byType as Record<string, number>)["flag_unused"], 1);
});

Deno.test("UnusedFlagManager respects maxArchivedPerExecution limit", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");

  const config: Partial<UnusedFlagManagerConfig> = {
    maxArchivedPerExecution: 2, // Limit to 2 flags
  };

  const manager = new UnusedFlagManager(mockClient, auditReporter, config);

  const flagKeys = ["flag1", "flag2", "flag3", "flag4"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag1", []],
    ["flag2", []],
    ["flag3", []],
    ["flag4", []],
  ]);

  const optimizelyFlags = new Map<string, OptimizelyFlag>();
  for (const key of flagKeys) {
    optimizelyFlags.set(key, createMockOptimizelyFlag(key));
  }

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const report = await manager.generateUnusedFlagReport(
    flagKeys,
    flagUsages,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  // Should only plan to archive 2 flags due to limit
  assertEquals(report.archivingPlan.flagsToArchive.length, 2);
  assertEquals(report.archivingPlan.flagsToReview.length, 2);
});

Deno.test("UnusedFlagManager handles recently modified flags appropriately", async () => {
  const mockClient = createMockOptimizelyApiClient();
  const auditReporter = new AuditReporter("reports/test-audit.log");
  const manager = new UnusedFlagManager(mockClient, auditReporter);

  const flagKeys = ["recent_flag"];
  const flagUsages = new Map<string, FlagUsage[]>([["recent_flag", []]]);

  // Create flag that was modified recently (within 7 days)
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

  const optimizelyFlags = new Map<string, OptimizelyFlag>([
    [
      "recent_flag",
      createMockOptimizelyFlag("recent_flag", {
        updated_time: recentDate.toISOString(),
      }),
    ],
  ]);

  const userContext = createUserContext();
  const operationContext = createOperationContext();

  const report = await manager.generateUnusedFlagReport(
    flagKeys,
    flagUsages,
    optimizelyFlags,
    userContext,
    operationContext,
  );

  const recentFlag = report.unusedFlags.find((f) => f.key === "recent_flag");
  assertExists(recentFlag);
  assertEquals(recentFlag.recommendedAction, "review");
  assertEquals(recentFlag.riskLevel, "medium");
  assert(recentFlag.reason.includes("recently modified"));
});

// Cleanup function to remove test files
async function cleanup() {
  try {
    await Deno.remove("reports/test-audit.log");
  } catch {
    // Ignore if file doesn't exist
  }
}

// Run cleanup after tests
setTimeout(cleanup, 100);
