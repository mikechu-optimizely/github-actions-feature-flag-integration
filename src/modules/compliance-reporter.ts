import { FlagDeltaReport, FlagUsageReport } from "./flag-usage-reporter.ts";
import { AuditReporter } from "./audit-reporter.ts";
import { error, info } from "../utils/logger.ts";

/**
 * Represents a comprehensive compliance report combining audit and usage data.
 */
export interface ComplianceReport {
  timestamp: string;
  executionId: string;
  environment: string;
  operation: string;
  dryRun: boolean;
  summary: {
    totalFlags: number;
    usedFlags: number;
    unusedFlags: number;
    usageRate: number;
    flagsArchived: number;
    flagsUpdated: number;
    errors: number;
  };
  usageReport: FlagUsageReport;
  deltaReport?: FlagDeltaReport;
  auditSummary: Record<string, unknown>;
  recommendations: string[];
  compliance: {
    flagDebtScore: number;
    cleanupOpportunities: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    issues: string[];
  };
}

/**
 * Generates comprehensive compliance reports for CI/CD artifacts.
 */
export class ComplianceReporter {
  private readonly auditReporter: AuditReporter;

  /**
   * @param auditReporter Audit reporter instance
   */
  constructor(auditReporter: AuditReporter) {
    this.auditReporter = auditReporter;
  }

  /**
   * Generates a comprehensive compliance report.
   * @param usageReport Flag usage report
   * @param deltaReport Optional delta report
   * @param config Execution configuration
   * @returns Comprehensive compliance report
   */
  generateComplianceReport(
    usageReport: FlagUsageReport,
    deltaReport?: FlagDeltaReport,
    config: {
      executionId: string;
      environment: string;
      operation: string;
      dryRun: boolean;
    } = {
      executionId: crypto.randomUUID(),
      environment: "unknown",
      operation: "cleanup",
      dryRun: true,
    },
  ): ComplianceReport {
    const timestamp = new Date().toISOString();
    const auditSummary = this.auditReporter.getSummary();
    const auditCounts = auditSummary.byType as Record<string, number> || {};

    const summary = {
      totalFlags: usageReport.totalFlags,
      usedFlags: usageReport.usedFlags,
      unusedFlags: usageReport.unusedFlags,
      usageRate: usageReport.summary.usageRate,
      flagsArchived: auditCounts.flag_archived || 0,
      flagsUpdated: auditCounts.flag_updated || 0,
      errors: auditCounts.error || 0,
    };

    const recommendations = this.generateRecommendations(usageReport, summary);
    const compliance = this.assessCompliance(usageReport, summary);

    const report: ComplianceReport = {
      timestamp,
      executionId: config.executionId,
      environment: config.environment,
      operation: config.operation,
      dryRun: config.dryRun,
      summary,
      usageReport,
      deltaReport,
      auditSummary,
      recommendations,
      compliance,
    };

    info(
      `Generated compliance report with ${summary.totalFlags} flags analyzed`,
    );

    return report;
  }

  /**
   * Exports compliance report to multiple formats for CI artifacts.
   * @param report Compliance report
   * @param basePath Base path for report files
   */
  async exportForCiArtifacts(
    report: ComplianceReport,
    basePath = "reports",
  ): Promise<void> {
    await this.ensureReportsDirectory(basePath);

    const tasks = [
      this.exportJsonReport(report, `${basePath}/compliance-report.json`),
      this.exportMarkdownSummary(report, `${basePath}/pr-summary.md`),
      this.exportCsvReport(report, `${basePath}/flag-usage.csv`),
      this.exportComplianceReport(
        report,
        `${basePath}/compliance-summary.json`,
      ),
    ];

    if (report.deltaReport) {
      tasks.push(
        this.exportDeltaReport(
          report.deltaReport,
          `${basePath}/delta-report.json`,
        ),
      );
    }

    await Promise.all(tasks);
    info(`Exported compliance reports to ${basePath}/`);
  }

  /**
   * Generates actionable recommendations based on report data.
   * @param usageReport Flag usage report
   * @param summary Report summary
   * @returns Array of recommendations
   */
  private generateRecommendations(
    usageReport: FlagUsageReport,
    summary: Record<string, number>,
  ): string[] {
    const recommendations: string[] = [];

    // Flag cleanup recommendations
    if (usageReport.unusedFlags > 0) {
      recommendations.push(
        `Consider archiving ${usageReport.unusedFlags} unused flags to reduce technical debt.`,
      );
    }

    // Usage rate recommendations
    if (summary.totalFlags > 0 && summary.usageRate < 50) {
      recommendations.push(
        `Usage rate is ${
          summary.usageRate.toFixed(1)
        }%. Review flag lifecycle management practices.`,
      );
    } else if (summary.usageRate > 95) {
      recommendations.push(
        `Excellent flag usage rate of ${
          summary.usageRate.toFixed(1)
        }%. Consider this as a best practice example.`,
      );
    }

    // File concentration recommendations
    const fileCount = usageReport.summary.flagsByFile.size;
    if (fileCount > 0 && summary.totalFlags / fileCount > 5) {
      recommendations.push(
        `High flag concentration detected. Consider distributing flags across more files for better maintainability.`,
      );
    }

    // Most used flags recommendations
    if (usageReport.summary.mostUsedFlags.length > 0) {
      const topFlag = usageReport.summary.mostUsedFlags[0];
      if (topFlag.count > 10) {
        recommendations.push(
          `Flag '${topFlag.flag}' has ${topFlag.count} usages. Consider if this flag is ready for permanent implementation.`,
        );
      }
    }

    return recommendations;
  }

  /**
   * Assesses compliance and risk level based on report data.
   * @param usageReport Flag usage report
   * @param summary Report summary
   * @returns Compliance assessment
   */
  private assessCompliance(
    usageReport: FlagUsageReport,
    summary: Record<string, number>,
  ): ComplianceReport["compliance"] {
    const issues: string[] = [];
    let flagDebtScore = 0;

    // Calculate flag debt score (0-100, lower is better)
    if (summary.totalFlags > 0) {
      flagDebtScore = Math.round(
        (usageReport.unusedFlags / summary.totalFlags) * 100,
      );
    }

    // Identify compliance issues
    if (usageReport.unusedFlags > 5) {
      issues.push(`${usageReport.unusedFlags} unused flags detected`);
    }

    if (summary.usageRate < 30) {
      issues.push(`Low usage rate: ${summary.usageRate.toFixed(1)}%`);
    }

    if (summary.errors > 0) {
      issues.push(`${summary.errors} errors occurred during synchronization`);
    }

    // Determine risk level
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (flagDebtScore > 50 || summary.errors > 0) {
      riskLevel = "HIGH";
    } else if (flagDebtScore > 25 || usageReport.unusedFlags > 3) {
      riskLevel = "MEDIUM";
    }

    return {
      flagDebtScore,
      cleanupOpportunities: usageReport.unusedFlags,
      riskLevel,
      issues,
    };
  }

  /**
   * Ensures the reports directory exists.
   * @param basePath Base path for reports
   */
  private async ensureReportsDirectory(basePath: string): Promise<void> {
    try {
      await Deno.mkdir(basePath, { recursive: true });
    } catch (err) {
      if (!(err instanceof Deno.errors.AlreadyExists)) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        error(`Failed to create reports directory: ${errorMessage}`);
        throw err;
      }
    }
  }

  /**
   * Exports compliance report as JSON.
   * @param report Compliance report
   * @param filePath Output file path
   */
  private async exportJsonReport(
    report: ComplianceReport,
    filePath: string,
  ): Promise<void> {
    const jsonData = JSON.stringify(report, (_key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }, 2);

    await Deno.writeTextFile(filePath, jsonData);
  }

  /**
   * Exports a markdown summary suitable for PR comments.
   * @param report Compliance report
   * @param filePath Output file path
   */
  private async exportMarkdownSummary(
    report: ComplianceReport,
    filePath: string,
  ): Promise<void> {
    const lines: string[] = [];
    lines.push(`# 🚩 Feature Flag Compliance Report`);
    lines.push(`**Generated:** ${report.timestamp}`);
    lines.push(`**Environment:** ${report.environment}`);
    lines.push(
      `**Operation:** ${report.operation} ${report.dryRun ? "(dry run)" : ""}`,
    );
    lines.push(``);

    lines.push(`## 📊 Summary`);
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Flags | ${report.summary.totalFlags} |`);
    lines.push(`| Used Flags | ${report.summary.usedFlags} |`);
    lines.push(`| Unused Flags | ${report.summary.unusedFlags} |`);
    lines.push(`| Usage Rate | ${report.summary.usageRate.toFixed(1)}% |`);
    lines.push(`| Risk Level | ${report.compliance.riskLevel} |`);
    lines.push(`| Flag Debt Score | ${report.compliance.flagDebtScore}/100 |`);
    lines.push(``);

    if (report.summary.errors > 0) {
      lines.push(`## ⚠️ Errors`);
      lines.push(`${report.summary.errors} errors occurred during execution.`);
      lines.push(``);
    }

    if (report.compliance.issues.length > 0) {
      lines.push(`## 🔍 Issues`);
      for (const issue of report.compliance.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push(``);
    }

    if (report.recommendations.length > 0) {
      lines.push(`## 💡 Recommendations`);
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push(``);
    }

    if (report.usageReport.unusedFlagKeys.length > 0) {
      lines.push(`## 🗑️ Unused Flags`);
      for (const flag of report.usageReport.unusedFlagKeys.slice(0, 10)) {
        lines.push(`- \`${flag}\``);
      }
      if (report.usageReport.unusedFlagKeys.length > 10) {
        lines.push(
          `- ... and ${report.usageReport.unusedFlagKeys.length - 10} more`,
        );
      }
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(`*Generated by Feature Flag Sync Action*`);

    await Deno.writeTextFile(filePath, lines.join("\n"));
  }

  /**
   * Exports flag usage data as CSV.
   * @param report Compliance report
   * @param filePath Output file path
   */
  private async exportCsvReport(
    report: ComplianceReport,
    filePath: string,
  ): Promise<void> {
    const lines: string[] = [];
    lines.push("Flag,File,Line,Context,Status");

    for (const [flag, usages] of report.usageReport.flagUsages) {
      if (usages.length === 0) {
        lines.push(`${flag},,,,"UNUSED"`);
      } else {
        for (const usage of usages) {
          const escapedContext = usage.context.replace(/"/g, '""');
          lines.push(
            `${flag},"${usage.file}",${usage.line},"${escapedContext}","USED"`,
          );
        }
      }
    }

    for (const flag of report.usageReport.unusedFlagKeys) {
      lines.push(`${flag},,,,"UNUSED"`);
    }

    await Deno.writeTextFile(filePath, lines.join("\n"));
  }

  /**
   * Exports a simplified compliance summary.
   * @param report Compliance report
   * @param filePath Output file path
   */
  private async exportComplianceReport(
    report: ComplianceReport,
    filePath: string,
  ): Promise<void> {
    const complianceData = {
      timestamp: report.timestamp,
      executionId: report.executionId,
      environment: report.environment,
      summary: report.summary,
      compliance: report.compliance,
      recommendations: report.recommendations,
    };

    await Deno.writeTextFile(filePath, JSON.stringify(complianceData, null, 2));
  }

  /**
   * Exports delta report as JSON.
   * @param deltaReport Delta report
   * @param filePath Output file path
   */
  private async exportDeltaReport(
    deltaReport: FlagDeltaReport,
    filePath: string,
  ): Promise<void> {
    const jsonData = JSON.stringify(deltaReport, (_key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }, 2);

    await Deno.writeTextFile(filePath, jsonData);
  }
}
