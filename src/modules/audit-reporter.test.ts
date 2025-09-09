import {
  AuditEvent,
  AuditEventType,
  AuditReporter,
  OperationContext,
  OperationType,
  UserContext,
} from "./audit-reporter.ts";
import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import {
  cleanupTempDir as _cleanupTempDir,
  createTempDir as _createTempDir,
} from "../utils/test-helpers.ts";

function createEvent(
  type: AuditEventType,
  message = "msg",
  details?: Record<string, unknown>,
): AuditEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
  };
}

// Helper to create unique test file paths to prevent race conditions
function createUniqueTestPath(baseName: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${baseName}_${timestamp}_${randomSuffix}`;
}

Deno.test("AuditReporter logs events in memory and to console", () => {
  const logPath = createUniqueTestPath("reports/test-audit.log");
  const reporter = new AuditReporter(logPath);
  const event = createEvent("flag_archived", "Flag archived", { key: "flag1" });
  reporter.log(event);
  assertEquals(reporter.getSummary().total, 1);
  assertEquals(
    (reporter.getSummary().byType as Record<string, number>)["flag_archived"],
    1,
  );
});

Deno.test("AuditReporter flush writes events to file and clears memory", async () => {
  const logPath = createUniqueTestPath("reports/test-audit.log");
  const reporter = new AuditReporter(logPath);
  const event = createEvent("flag_archived", "Flag archived", { key: "flag2" });
  reporter.log(event);

  try {
    await reporter.flush();
    // File should exist and contain the event
    const content = await Deno.readTextFile(logPath);
    assert(content.includes("flag_archived"));
    // Memory should be cleared
    assertEquals(reporter.getSummary().total, 0);
  } finally {
    // Clean up - remove file and any parent directories created
    try {
      await Deno.remove(logPath);
      // Try to remove parent directory if empty
      const dirPath = logPath.substring(0, logPath.lastIndexOf("/"));
      if (dirPath !== logPath) {
        await Deno.remove(dirPath).catch(() => {});
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("AuditReporter generateSummaryReport writes summary JSON", async () => {
  const logPath = createUniqueTestPath("reports/test-audit.log");
  const summaryPath = createUniqueTestPath("reports/test-summary.json");
  const reporter = new AuditReporter(logPath);
  reporter.log(createEvent("flag_in_use", "Flag in use", { key: "flag3" }));
  reporter.log(createEvent("flag_unused", "Flag unused", { key: "flag4" }));

  try {
    await reporter.generateSummaryReport(summaryPath);
    const summary = JSON.parse(
      await Deno.readTextFile(summaryPath),
    );
    assertEquals(summary.total, 2);
    assertEquals(summary.byType.flag_in_use, 1);
    assertEquals(summary.byType.flag_unused, 1);
  } finally {
    // Clean up
    try {
      await Deno.remove(summaryPath);
      // Try to remove parent directory if empty
      const dirPath = summaryPath.substring(0, summaryPath.lastIndexOf("/"));
      if (dirPath !== summaryPath) {
        await Deno.remove(dirPath).catch(() => {});
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

Deno.test("AuditReporter #ensureLogDir creates directory if missing", async () => {
  const logPath = createUniqueTestPath("reports/subdir/test.log");
  const reporter = new AuditReporter(logPath);
  reporter.log(createEvent("info", "Info event"));

  try {
    await reporter.flush();
    const content = await Deno.readTextFile(logPath);
    assertMatch(content, /Info event/);
  } finally {
    // Clean up - remove file and directories
    try {
      await Deno.remove(logPath);
      // Remove subdirectory if empty
      const dirPath = logPath.substring(0, logPath.lastIndexOf("/"));
      if (dirPath !== logPath) {
        await Deno.remove(dirPath).catch(() => {});
        // Remove parent reports directory if empty
        const parentDir = dirPath.substring(0, dirPath.lastIndexOf("/"));
        if (parentDir !== dirPath && parentDir.endsWith("reports")) {
          await Deno.remove(parentDir).catch(() => {});
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
});

function createUserContext(): UserContext {
  return {
    userId: "test-user",
    source: "github-actions",
    sessionId: "session-123",
    origin: "github.com",
  };
}

function createOperationContext(type: OperationType = "audit"): OperationContext {
  return {
    type,
    operationId: "op-123",
    dryRun: false,
    startTime: new Date().toISOString(),
    metadata: { version: "1.0" },
  };
}

function createOptimizelyFlag(): OptimizelyFlag {
  return {
    key: "test-flag",
    name: "Test Flag",
    description: "A test flag",
    url: "https://app.optimizely.com/flag/test-flag",
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
    environments: {
      production: {
        key: "production",
        name: "Production",
        enabled: true,
        id: 123456,
        has_restricted_permissions: false,
        priority: 1,
        status: "running",
        created_time: "2024-01-01T00:00:00Z",
      },
      staging: {
        key: "staging",
        name: "Staging",
        enabled: false,
        id: 123457,
        has_restricted_permissions: false,
        priority: 2,
        status: "draft",
        created_time: "2024-01-01T00:00:00Z",
      },
    },
  };
}

Deno.test("AuditReporter logFlagOperation creates comprehensive audit event", () => {
  const logPath = createUniqueTestPath("reports/test-flag-audit.log");
  const reporter = new AuditReporter(logPath);
  const userContext = createUserContext();
  const operationContext = createOperationContext("archive");
  const flagData = createOptimizelyFlag();

  reporter.logFlagOperation(
    "test-flag",
    "flag_archived",
    userContext,
    operationContext,
    flagData,
    { reason: "unused" },
  );

  const summary = reporter.getSummary();
  assertEquals(summary.total, 1);
  assertEquals((summary.byType as Record<string, number>)["flag_archived"], 1);
});

Deno.test("AuditReporter logApiOperation tracks API calls with context", () => {
  const logPath = createUniqueTestPath("reports/test-api-audit.log");
  const reporter = new AuditReporter(logPath);
  const userContext = createUserContext();
  const operationContext = createOperationContext("sync");

  reporter.logApiOperation(
    "/v2/flags",
    "GET",
    200,
    userContext,
    operationContext,
    { responseTime: 250 },
  );

  const summary = reporter.getSummary();
  assertEquals(summary.total, 1);
  assertEquals((summary.byType as Record<string, number>)["api_call"], 1);
});

Deno.test("AuditReporter logApiOperation handles error status codes", () => {
  const logPath = createUniqueTestPath("reports/test-api-error-audit.log");
  const reporter = new AuditReporter(logPath);
  const userContext = createUserContext();
  const operationContext = createOperationContext("sync");

  reporter.logApiOperation(
    "/v2/flags",
    "GET",
    404,
    userContext,
    operationContext,
    { errorMessage: "Not found" },
  );

  const summary = reporter.getSummary();
  assertEquals(summary.total, 1);
  assertEquals((summary.byType as Record<string, number>)["error"], 1);
});

Deno.test("AuditReporter generateComplianceReport creates structured compliance data", async () => {
  const reporter = new AuditReporter("reports/test-compliance-audit.log");
  const userContext = createUserContext();
  const operationContext = createOperationContext("cleanup");

  // Add some test events
  reporter.logFlagOperation("flag1", "flag_archived", userContext, operationContext);
  reporter.logApiOperation("/v2/flags", "GET", 200, userContext, operationContext);
  reporter.log(createEvent("error", "Test error", { errorType: "api_timeout" }));

  await reporter.generateComplianceReport("reports/test-compliance.json");

  const complianceData = JSON.parse(
    await Deno.readTextFile("reports/test-compliance.json"),
  );

  assert(complianceData.reportGenerated);
  assert(complianceData.auditPeriod);
  assertEquals(complianceData.totalEvents, 3);
  assert(complianceData.flagOperations);
  assert(complianceData.apiOperations);
  assert(complianceData.errorSummary);
  assert(complianceData.userActivity);
  assert(complianceData.dataRetention);

  // Clean up
  await Deno.remove("reports/test-compliance.json");
});

Deno.test("AuditReporter exportAuditTrail exports events in JSONL format", async () => {
  const reporter = new AuditReporter("reports/test-export-audit.log");
  const userContext = createUserContext();
  const operationContext = createOperationContext();

  reporter.logFlagOperation("flag1", "flag_in_use", userContext, operationContext);
  reporter.logFlagOperation("flag2", "flag_unused", userContext, operationContext);

  await reporter.exportAuditTrail("reports/test-export.jsonl", true);

  const exportContent = await Deno.readTextFile("reports/test-export.jsonl");
  const lines = exportContent.trim().split("\n");
  assertEquals(lines.length, 2);

  // Verify each line is valid JSON
  for (const line of lines) {
    const event = JSON.parse(line);
    assert(event.timestamp);
    assert(event.type);
    assert(event.message);
    assert(event.userContext);
  }

  // Clean up
  await Deno.remove("reports/test-export.jsonl");
});

Deno.test("AuditReporter exportAuditTrail anonymizes personal data when requested", async () => {
  const reporter = new AuditReporter("reports/test-anon-audit.log");
  const userContext = createUserContext();
  const operationContext = createOperationContext();

  reporter.logFlagOperation("flag1", "flag_in_use", userContext, operationContext);

  await reporter.exportAuditTrail("reports/test-anon.jsonl", false); // Don't include personal data

  const exportContent = await Deno.readTextFile("reports/test-anon.jsonl");
  const event = JSON.parse(exportContent.trim());

  assert(event.userContext.userId.startsWith("user_"));
  assertEquals(event.userContext.origin, "[REDACTED]");

  // Clean up
  await Deno.remove("reports/test-anon.jsonl");
});

Deno.test("AuditReporter generateComprehensiveReport creates multiple format reports", async () => {
  const reporter = new AuditReporter("reports/test-comprehensive-audit.log");
  const userContext = createUserContext();
  const operationContext = createOperationContext();

  // Add diverse events
  reporter.logFlagOperation("flag1", "flag_archived", userContext, operationContext);
  reporter.logApiOperation("/v2/flags", "GET", 200, userContext, operationContext);
  reporter.log(createEvent("sync_started", "Sync operation started"));
  reporter.log(createEvent("sync_completed", "Sync operation completed"));

  await reporter.generateComprehensiveReport("reports/comprehensive/", ["json", "markdown", "csv"]);

  // Verify JSON report
  const jsonReport = JSON.parse(
    await Deno.readTextFile("reports/comprehensive/audit-report.json"),
  );
  assert(jsonReport.metadata);
  assert(jsonReport.summary);
  assert(jsonReport.flagOperations);

  // Verify Markdown report
  const markdownReport = await Deno.readTextFile("reports/comprehensive/audit-report.md");
  assert(markdownReport.includes("# Feature Flag Audit Report"));
  assert(markdownReport.includes("## Executive Summary"));
  assert(markdownReport.includes("## Recommendations"));

  // Verify CSV report
  const csvReport = await Deno.readTextFile("reports/comprehensive/audit-events.csv");
  const csvLines = csvReport.split("\n");
  assert(csvLines[0].includes("timestamp,type,message")); // Headers
  assert(csvLines.length > 1); // Has data rows

  // Clean up
  await Deno.remove("reports/comprehensive/audit-report.json");
  await Deno.remove("reports/comprehensive/audit-report.md");
  await Deno.remove("reports/comprehensive/audit-events.csv");
  await Deno.remove("reports/comprehensive");
});
