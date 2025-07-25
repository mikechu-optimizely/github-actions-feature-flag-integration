import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { ComplianceReporter } from "./compliance-reporter.ts";
import { AuditReporter } from "./audit-reporter.ts";
import { FlagUsageReport } from "./flag-usage-reporter.ts";
import { FlagUsage } from "./code-analysis.ts";

Deno.test("ComplianceReporter generates comprehensive compliance report", () => {
  const auditReporter = new AuditReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  // Setup test data
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [
      { file: "src/main.ts", line: 10, context: "isEnabled('flag_a')" },
      { file: "src/utils.ts", line: 5, context: "const f = 'flag_a'" },
    ]],
    ["flag_b", [
      { file: "src/main.ts", line: 15, context: "isEnabled('flag_b')" },
    ]],
    ["flag_c", []],
    ["flag_d", []],
  ]);

  const usageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 4,
    usedFlags: 2,
    unusedFlags: 2,
    flagUsages,
    unusedFlagKeys: ["flag_c", "flag_d"],
    summary: {
      usageRate: 50,
      flagsByFile: new Map([
        ["src/main.ts", ["flag_a", "flag_b"]],
        ["src/utils.ts", ["flag_a"]],
      ]),
      mostUsedFlags: [
        { flag: "flag_a", count: 2 },
        { flag: "flag_b", count: 1 },
      ],
    },
  };

  // Add some audit events
  auditReporter.log({
    timestamp: new Date().toISOString(),
    type: "flag_unused",
    message: "Flag flag_c is unused",
    details: { flag: "flag_c" },
  });

  auditReporter.log({
    timestamp: new Date().toISOString(),
    type: "flag_archived",
    message: "Archived flag flag_d",
    details: { flag: "flag_d" },
  });

  const config = {
    executionId: "test-exec-123",
    environment: "test",
    operation: "cleanup",
    dryRun: false,
  };

  const report = complianceReporter.generateComplianceReport(
    usageReport,
    undefined,
    config,
  );

  // Verify report structure
  assertExists(report.timestamp);
  assertEquals(report.executionId, "test-exec-123");
  assertEquals(report.environment, "test");
  assertEquals(report.operation, "cleanup");
  assertEquals(report.dryRun, false);

  // Verify summary
  assertEquals(report.summary.totalFlags, 4);
  assertEquals(report.summary.usedFlags, 2);
  assertEquals(report.summary.unusedFlags, 2);
  assertEquals(report.summary.usageRate, 50);
  assertEquals(report.summary.flagsArchived, 1);

  // Verify compliance assessment
  assertEquals(report.compliance.flagDebtScore, 50);
  assertEquals(report.compliance.cleanupOpportunities, 2);
  assertEquals(report.compliance.riskLevel, "MEDIUM");
  // No issues should be generated for this test case (only 2 unused flags, 50% usage rate)
  assertEquals(report.compliance.issues.length, 0);

  // Verify recommendations
  assert(report.recommendations.length > 0);
  assert(report.recommendations.some((r) => r.includes("unused flags")));
});

Deno.test("ComplianceReporter assesses risk levels correctly", () => {
  const auditReporter = new AuditReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  // Test LOW risk scenario
  const lowRiskUsageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 10,
    usedFlags: 9,
    unusedFlags: 1,
    flagUsages: new Map(),
    unusedFlagKeys: ["flag_unused"],
    summary: {
      usageRate: 90,
      flagsByFile: new Map(),
      mostUsedFlags: [],
    },
  };

  const lowRiskReport = complianceReporter.generateComplianceReport(
    lowRiskUsageReport,
  );
  assertEquals(lowRiskReport.compliance.riskLevel, "LOW");
  assertEquals(lowRiskReport.compliance.flagDebtScore, 10);

  // Test MEDIUM risk scenario
  const mediumRiskUsageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 10,
    usedFlags: 6,
    unusedFlags: 4,
    flagUsages: new Map(),
    unusedFlagKeys: ["flag_a", "flag_b", "flag_c", "flag_d"],
    summary: {
      usageRate: 60,
      flagsByFile: new Map(),
      mostUsedFlags: [],
    },
  };

  const mediumRiskReport = complianceReporter.generateComplianceReport(
    mediumRiskUsageReport,
  );
  assertEquals(mediumRiskReport.compliance.riskLevel, "MEDIUM");
  assertEquals(mediumRiskReport.compliance.flagDebtScore, 40);

  // Test HIGH risk scenario
  const highRiskUsageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 10,
    usedFlags: 3,
    unusedFlags: 7,
    flagUsages: new Map(),
    unusedFlagKeys: [
      "flag_a",
      "flag_b",
      "flag_c",
      "flag_d",
      "flag_e",
      "flag_f",
      "flag_g",
    ],
    summary: {
      usageRate: 30,
      flagsByFile: new Map(),
      mostUsedFlags: [],
    },
  };

  const highRiskReport = complianceReporter.generateComplianceReport(
    highRiskUsageReport,
  );
  assertEquals(highRiskReport.compliance.riskLevel, "HIGH");
  assertEquals(highRiskReport.compliance.flagDebtScore, 70);
});

Deno.test("ComplianceReporter generates appropriate recommendations", () => {
  const auditReporter = new AuditReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  // Test scenario with many unused flags
  const usageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 20,
    usedFlags: 5,
    unusedFlags: 15,
    flagUsages: new Map(),
    unusedFlagKeys: Array.from({ length: 15 }, (_, i) => `flag_${i}`),
    summary: {
      usageRate: 25,
      flagsByFile: new Map([
        ["src/main.ts", ["flag_a", "flag_b", "flag_c", "flag_d", "flag_e"]],
      ]),
      mostUsedFlags: [
        { flag: "flag_heavy_use", count: 15 },
      ],
    },
  };

  const report = complianceReporter.generateComplianceReport(usageReport);

  // Should recommend archiving unused flags
  assert(report.recommendations.some((r) => r.includes("Consider archiving")));

  // Should recommend reviewing flag lifecycle due to low usage rate
  assert(report.recommendations.some((r) => r.includes("Usage rate is")));

  // Should recommend reviewing heavily used flag
  assert(
    report.recommendations.some((r) => r.includes("permanent implementation")),
  );
});

Deno.test("ComplianceReporter exports CI artifacts", async () => {
  const auditReporter = new AuditReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  const usageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 3,
    usedFlags: 2,
    unusedFlags: 1,
    flagUsages: new Map([
      ["flag_a", [{
        file: "src/main.ts",
        line: 10,
        context: "isEnabled('flag_a')",
      }]],
      ["flag_b", [{
        file: "src/utils.ts",
        line: 5,
        context: "const f = 'flag_b'",
      }]],
      ["flag_c", []],
    ]),
    unusedFlagKeys: ["flag_c"],
    summary: {
      usageRate: 66.7,
      flagsByFile: new Map([
        ["src/main.ts", ["flag_a"]],
        ["src/utils.ts", ["flag_b"]],
      ]),
      mostUsedFlags: [
        { flag: "flag_a", count: 1 },
        { flag: "flag_b", count: 1 },
      ],
    },
  };

  const report = complianceReporter.generateComplianceReport(usageReport);

  // Use temporary directory for testing
  const tempDir = await Deno.makeTempDir();

  try {
    await complianceReporter.exportForCiArtifacts(report, tempDir);

    // Verify files were created
    const files = [
      "compliance-report.json",
      "pr-summary.md",
      "flag-usage.csv",
      "compliance-summary.json",
    ];

    for (const file of files) {
      const filePath = `${tempDir}/${file}`;
      const stat = await Deno.stat(filePath);
      assert(stat.isFile);
      assert(stat.size > 0);
    }

    // Verify content of PR summary
    const prSummary = await Deno.readTextFile(`${tempDir}/pr-summary.md`);
    assert(prSummary.includes("Feature Flag Compliance Report"));
    assert(prSummary.includes("Total Flags | 3"));
    assert(prSummary.includes("Used Flags | 2"));
    assert(prSummary.includes("Unused Flags | 1"));

    // Verify CSV format
    const csvContent = await Deno.readTextFile(`${tempDir}/flag-usage.csv`);
    assert(csvContent.includes("Flag,File,Line,Context,Status"));
    assert(csvContent.includes("flag_a,"));
    assert(csvContent.includes('flag_c,,,,"UNUSED"'));
  } finally {
    // Clean up
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("ComplianceReporter handles empty usage report", () => {
  const auditReporter = new AuditReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  const emptyUsageReport: FlagUsageReport = {
    timestamp: new Date().toISOString(),
    totalFlags: 0,
    usedFlags: 0,
    unusedFlags: 0,
    flagUsages: new Map(),
    unusedFlagKeys: [],
    summary: {
      usageRate: 0,
      flagsByFile: new Map(),
      mostUsedFlags: [],
    },
  };

  const report = complianceReporter.generateComplianceReport(emptyUsageReport);

  assertEquals(report.summary.totalFlags, 0);
  assertEquals(report.compliance.flagDebtScore, 0);
  assertEquals(report.compliance.riskLevel, "LOW");
  assertEquals(report.recommendations.length, 0);
});
