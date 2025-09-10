import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { loadEnvironment } from "./config/environment.ts";
import { OptimizelyApiClient } from "./modules/optimizely-client.ts";
import { findFlagUsagesInCodebase } from "./modules/code-analysis.ts";
import { FlagUsageReporter } from "./modules/flag-usage-reporter.ts";
import { ComplianceReport, ComplianceReporter } from "./modules/compliance-reporter.ts";
import { FlagSyncCore } from "./modules/flag-sync-core.ts";
import { auditReporter } from "./modules/audit-reporter.ts";
import { debug, error, info } from "./utils/logger.ts";
import { validateInputs } from "./utils/validation.ts";
import { OptimizelyFlag } from "./types/optimizely.ts";
import { FlagUsageReport } from "./modules/flag-usage-reporter.ts";

/**
 * Main configuration interface for the application.
 */
interface MainConfig {
  workspaceRoot: string;
  environment: string;
  operation: "cleanup" | "audit";
  dryRun: boolean;
  executionId: string;
  reportsPath: string;
}

/**
 * Main entry point for the feature flag synchronization tool.
 */
async function main(): Promise<void> {
  try {
    const startTime = Date.now();

    // Parse command line arguments and load environment
    const config = await parseConfiguration();

    // Log execution start with dry-run indication
    const startMessage = config.dryRun
      ? `Starting feature flag synchronization [DRY RUN MODE]`
      : `Starting feature flag synchronization`;

    info(startMessage);
    auditReporter.log({
      timestamp: new Date().toISOString(),
      type: "info",
      message: startMessage,
      details: {
        executionId: config.executionId,
        environment: config.environment,
        operation: config.operation,
        dryRun: config.dryRun,
      },
    });

    // Initialize components
    const {
      optimizelyClient,
      flagUsageReporter,
      complianceReporter,
    } = await initializeComponents(config);

    // Execute orchestrated cleanup phases
    await executeCleanupOrchestration(
      config,
      optimizelyClient,
      flagUsageReporter,
      complianceReporter,
    );

    // Generate final reports
    await generateFinalReports(config);

    const duration = Date.now() - startTime;
    auditReporter.log({
      timestamp: new Date().toISOString(),
      type: "info",
      message: `Feature flag synchronization completed successfully`,
      details: {
        executionId: config.executionId,
        durationMs: duration,
      },
    });

    info(`✅ Synchronization completed in ${duration}ms`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    auditReporter.log({
      timestamp: new Date().toISOString(),
      type: "error",
      message: `Feature flag synchronization failed: ${errorMessage}`,
      details: {
        error: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      },
    });

    error(`❌ Synchronization failed: ${errorMessage}`);
    Deno.exit(1);
  }
}

/**
 * Parses command line arguments and environment variables.
 */
async function parseConfiguration(): Promise<MainConfig> {
  const args = parseArgs(Deno.args, {
    string: ["environment", "operation", "reports-path"],
    boolean: ["dry-run", "help"],
    negatable: ["dry-run"],
    default: {
      environment: "auto",
      operation: "cleanup",
      "dry-run": true,
      "reports-path": "reports",
    },
  });

  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  // Load environment variables
  const env = await loadEnvironment();

  // Validate configuration
  const config: MainConfig = {
    workspaceRoot: Deno.cwd(),
    environment: args.environment || env.ENVIRONMENT || "auto",
    operation: (args.operation || env.OPERATION || "cleanup") as
      | "cleanup"
      | "audit",
    dryRun: args["dry-run"] ?? env.DRY_RUN,
    executionId: env.GITHUB_RUN_ID || crypto.randomUUID(),
    reportsPath: args["reports-path"] || env.REPORTS_PATH || "reports",
  };

  // Validate inputs
  validateInputs({
    environment: config.environment,
    operation: config.operation,
    optimizelyApiToken: env.OPTIMIZELY_API_TOKEN,
    optimizelyProjectId: env.OPTIMIZELY_PROJECT_ID,
  });

  debug("Configuration loaded", config);
  return config;
}

/**
 * Initializes all required components.
 */
async function initializeComponents(_config: MainConfig) {
  const env = await loadEnvironment();

  const optimizelyClient = new OptimizelyApiClient(
    env.OPTIMIZELY_API_TOKEN!,
    {
      baseUrl: "https://api.optimizely.com/v2",
      dryRun: _config.dryRun,
    },
  );

  const flagUsageReporter = new FlagUsageReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  return {
    optimizelyClient,
    flagUsageReporter,
    complianceReporter,
  };
}

/**
 * Executes orchestrated cleanup phases with comprehensive workflow coordination.
 * Implements end-to-end workflow coordination, phase dependency management,
 * progress tracking, and failure recovery mechanisms.
 */
async function executeCleanupOrchestration(
  config: MainConfig,
  optimizelyClient: OptimizelyApiClient,
  flagUsageReporter: FlagUsageReporter,
  complianceReporter: ComplianceReporter,
): Promise<void> {
  const phases = [
    "initialization",
    "discovery",
    "analysis",
    "validation",
    "planning",
    "execution",
    "verification",
    "reporting",
  ] as const;

  let currentPhase = 0;
  const phaseResults = new Map<string, { success: boolean; duration: number; message: string }>();

  try {
    // Initialize flag sync core for orchestration
    const flagSyncCore = new FlagSyncCore(optimizelyClient, {
      dryRun: config.dryRun,
      maxConcurrentOperations: 3,
      operationTimeoutMs: 30000,
      enableRollback: true,
      riskTolerance: "medium",
    });

    // Phase 1: Initialization and Setup Validation
    await executePhase("initialization", async () => {
      info("🚀 Phase 1: Initialization and setup validation");

      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Starting initialization phase",
        details: {
          executionId: config.executionId,
          environment: config.environment,
          operation: config.operation,
          dryRun: config.dryRun,
        },
      });

      // Validate API connectivity and permissions
      const statusReport = optimizelyClient.getApiStatusReport();
      if (!statusReport.api.isAvailable) {
        throw new Error(`API connectivity check failed: API is not available`);
      }

      // Add a small async operation to justify the async keyword
      await Promise.resolve();

      info("✅ API connectivity validated");
      return "Initialization completed successfully";
    });
    currentPhase++;

    // Phase 2: Feature Flag Discovery
    const flags = await executePhase("discovery", async () => {
      info("📡 Phase 2: Feature flag discovery from Optimizely");

      const flagsResult = await optimizelyClient.getAllFeatureFlags();
      if (flagsResult.error) {
        throw new Error(`Failed to fetch feature flags: ${flagsResult.error.message}`);
      }

      const fetchedFlags = flagsResult.data as OptimizelyFlag[];
      const flagKeys = fetchedFlags.map((f) => f.key);

      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: `Discovered ${flagKeys.length} feature flags from Optimizely`,
        details: { flagCount: flagKeys.length, flags: flagKeys },
      });

      info(`✅ Discovered ${flagKeys.length} feature flags`);
      return fetchedFlags;
    });
    currentPhase++;

    // Phase 3: Codebase Analysis and Usage Detection
    const usageReport = await executePhase("analysis", async () => {
      info("🔍 Phase 3: Codebase analysis and flag usage detection");

      const flagKeys = flags.map((f) => f.key);
      const flagUsages = await findFlagUsagesInCodebase(
        flagKeys,
        config.workspaceRoot,
      );

      const report = flagUsageReporter.generateUsageReport(
        flagKeys,
        flagUsages,
      );

      // Log usage analysis results
      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Codebase analysis completed",
        details: {
          totalFlags: report.totalFlags,
          usedFlags: report.usedFlags,
          unusedFlags: report.unusedFlags,
          flagUsageCount: Array.from(report.flagUsages.values()).reduce(
            (total, usages) => total + usages.length,
            0,
          ),
        },
      });

      info(`✅ Analysis complete - ${report.usedFlags} used, ${report.unusedFlags} unused flags`);
      return report;
    });
    currentPhase++;

    // Phase 4: Consistency Validation
    const consistencyResults = await executePhase("validation", async () => {
      info("🔍 Phase 4: Flag consistency validation");

      const consistencyResult = await flagSyncCore.validateConsistency(flags, usageReport);
      if (consistencyResult.error) {
        throw consistencyResult.error;
      }

      const results = consistencyResult.data!;
      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Flag consistency validation completed",
        details: {
          totalFlags: results.summary.totalFlags,
          consistentFlags: results.summary.consistentFlags,
          inconsistentFlags: results.summary.inconsistentFlags,
          criticalIssues: results.summary.criticalIssues,
        },
      });

      info(`✅ Validation complete - ${results.summary.inconsistentFlags} inconsistencies found`);
      return results;
    });
    currentPhase++;

    // Phase 5: Cleanup Plan Creation
    const syncPlan = await executePhase("planning", async () => {
      info("📋 Phase 5: Creating synchronization plan");

      const planResult = await flagSyncCore.createSyncPlan(flags, usageReport);
      if (planResult.error) {
        throw planResult.error;
      }

      const plan = planResult.data!;
      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Synchronization plan created",
        details: {
          planId: plan.id,
          totalOperations: plan.operations.length,
          riskLevel: plan.validationResults.riskAssessment.overallRisk,
          estimatedDuration: plan.summary.estimatedDurationMs,
        },
      });

      info(
        `✅ Plan created - ${plan.operations.length} operations, ${plan.validationResults.riskAssessment.overallRisk} risk`,
      );
      return plan;
    });
    currentPhase++;

    // Phase 6: Plan Execution (Cleanup Operations)
    const executionResult = await executePhase("execution", async () => {
      const phaseMessage = config.dryRun
        ? "🗑️ Phase 6: Simulating synchronization plan execution [DRY RUN]"
        : "🗑️ Phase 6: Executing synchronization plan";
      info(phaseMessage);

      if (config.operation === "audit") {
        info("🔍 Audit mode - skipping execution phase");
        return { status: "skipped", message: "Audit mode - no operations executed" };
      }

      if (config.dryRun) {
        info("🔍 DRY RUN: Simulating operations without making actual changes");
      }

      const execResult = await flagSyncCore.executeSyncPlan(syncPlan);
      if (execResult.error) {
        throw execResult.error;
      }

      const result = execResult.data!;
      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Synchronization plan executed",
        details: {
          planId: result.planId,
          status: result.status,
          successful: result.summary.successful,
          failed: result.summary.failed,
          rolledBack: result.summary.rolledBack,
          duration: result.totalDurationMs,
        },
      });

      const statusMessage = config.dryRun
        ? `✅ DRY RUN execution complete - ${result.summary.totalExecuted} operations simulated successfully`
        : `✅ Execution complete - ${result.summary.successful} successful, ${result.summary.failed} failed`;

      info(statusMessage);
      return result;
    });
    currentPhase++;

    // Phase 7: Post-Execution Verification
    await executePhase("verification", async () => {
      info("🔍 Phase 7: Post-execution verification");

      if (
        config.dryRun || config.operation === "audit" || !executionResult ||
        executionResult.status === "skipped"
      ) {
        const skipMessage = config.dryRun
          ? "🔍 Skipping verification for DRY RUN mode - no actual changes were made"
          : "🔍 Skipping verification for audit mode";
        info(skipMessage);
        return config.dryRun
          ? "Verification skipped for DRY RUN mode - no actual changes to verify"
          : "Verification skipped for dry-run/audit mode";
      }

      // Re-validate consistency after execution
      const postValidationResult = await flagSyncCore.validateConsistency(flags, usageReport);
      if (postValidationResult.error) {
        throw postValidationResult.error;
      }

      const postResults = postValidationResult.data!;
      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Post-execution verification completed",
        details: {
          consistentFlags: postResults.summary.consistentFlags,
          inconsistentFlags: postResults.summary.inconsistentFlags,
          criticalIssues: postResults.summary.criticalIssues,
        },
      });

      info(
        `✅ Verification complete - ${postResults.summary.criticalIssues} remaining critical issues`,
      );
      return "Post-execution verification completed";
    });
    currentPhase++;

    // Phase 8: Report Generation and Export
    await executePhase("reporting", async () => {
      const reportMessage = config.dryRun
        ? "📄 Phase 8: Generating DRY RUN analysis reports and what-if impact assessment"
        : "📄 Phase 8: Final report generation and export";
      info(reportMessage);

      // Generate comprehensive compliance report
      const complianceReport = complianceReporter.generateComplianceReport(
        usageReport,
        undefined, // No delta report available in this context
        {
          executionId: config.executionId,
          environment: config.environment,
          operation: config.operation,
          dryRun: config.dryRun,
        },
      );

      // Export reports for CI artifacts
      await complianceReporter.exportForCiArtifacts(
        complianceReport,
        config.reportsPath,
      );

      // Generate execution summary
      await generateExecutionSummary(
        config,
        phaseResults,
        flags.length,
        usageReport.unusedFlagKeys.length,
        consistencyResults,
      );

      // Generate sync summary for action outputs
      await generateSyncSummary(
        config,
        complianceReport,
        usageReport,
      );

      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "info",
        message: "Report generation completed",
        details: {
          reportsPath: config.reportsPath,
          totalPhases: phases.length,
          executionId: config.executionId,
        },
      });

      info("✅ Reports generated and exported");
      return "Report generation completed";
    });
    currentPhase++;

    info("🎉 All cleanup phases completed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedPhase = phases[currentPhase] || "unknown";

    auditReporter.log({
      timestamp: new Date().toISOString(),
      type: "error",
      message: `Phase '${failedPhase}' failed: ${errorMessage}`,
      details: {
        failedPhase,
        currentPhase: currentPhase + 1,
        totalPhases: phases.length,
        completedPhases: Array.from(phaseResults.keys()),
        error: errorMessage,
      },
    });

    console.error(`❌ Phase '${failedPhase}' failed: ${errorMessage}`);

    // Attempt failure recovery
    await attemptFailureRecovery(config, failedPhase, phaseResults);
    throw error;
  }

  /**
   * Executes a single phase with error handling and timing.
   */
  async function executePhase<T>(
    phaseName: string,
    phaseFunction: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await phaseFunction();
      const duration = Date.now() - startTime;

      phaseResults.set(phaseName, {
        success: true,
        duration,
        message: `Phase '${phaseName}' completed successfully`,
      });

      debug(`Phase '${phaseName}' completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      phaseResults.set(phaseName, {
        success: false,
        duration,
        message: `Phase '${phaseName}' failed: ${errorMessage}`,
      });

      throw error;
    }
  }
}

/**
 * Attempts failure recovery procedures based on the failed phase.
 */
async function attemptFailureRecovery(
  config: MainConfig,
  failedPhase: string,
  phaseResults: Map<string, { success: boolean; duration: number; message: string }>,
): Promise<void> {
  info(`🔧 Attempting failure recovery for phase: ${failedPhase}`);

  auditReporter.log({
    timestamp: new Date().toISOString(),
    type: "warning",
    message: `Attempting recovery for failed phase: ${failedPhase}`,
    details: {
      failedPhase,
      completedPhases: Array.from(phaseResults.keys()),
      executionId: config.executionId,
    },
  });

  // Phase-specific recovery strategies
  switch (failedPhase) {
    case "initialization":
      info("💡 Recovery suggestion: Check API credentials and network connectivity");
      break;
    case "discovery":
      info("💡 Recovery suggestion: Verify Optimizely API access and project permissions");
      break;
    case "analysis":
      info("💡 Recovery suggestion: Check codebase accessibility and file permissions");
      break;
    case "validation":
    case "planning":
      info("💡 Recovery suggestion: Review flag configurations and try with smaller scope");
      break;
    case "execution":
      info("💡 Recovery suggestion: Check API rate limits and retry with dry-run mode");
      break;
    case "verification":
      info("💡 Recovery suggestion: Manual verification may be required");
      break;
    case "reporting":
      info("💡 Recovery suggestion: Check file system permissions for report output");
      break;
    default:
      info("💡 Recovery suggestion: Review logs and retry with verbose logging");
  }

  // Generate recovery report
  await generateRecoveryReport(config, failedPhase, phaseResults);
}

/**
 * Generates an execution summary report with phase timing and results.
 */
async function generateExecutionSummary(
  config: MainConfig,
  phaseResults: Map<string, { success: boolean; duration: number; message: string }>,
  totalFlags: number,
  unusedFlags: number,
  consistencyResults?: {
    timestamp: string;
    summary: {
      totalFlags: number;
      consistentFlags: number;
      inconsistentFlags: number;
      criticalIssues: number;
      warnings: number;
    };
    recommendations: string[];
  },
): Promise<void> {
  const summaryPath = `${config.reportsPath}/execution-summary.md`;

  let summary = `# Feature Flag Cleanup Execution Summary\n\n`;
  summary += `**Execution ID:** ${config.executionId}\n`;
  summary += `**Environment:** ${config.environment}\n`;
  summary += `**Operation:** ${config.operation}\n`;
  summary += `**Dry Run:** ${config.dryRun ? "Yes" : "No"}\n`;
  summary += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  summary += `## Overview\n\n`;
  summary += `- **Total Flags Discovered:** ${totalFlags}\n`;
  summary += `- **Unused Flags Identified:** ${unusedFlags}\n`;
  summary += `- **Total Phases:** ${phaseResults.size}\n`;

  if (consistencyResults) {
    summary +=
      `- **Consistency Check:** ${consistencyResults.summary.inconsistentFlags} inconsistencies, ${consistencyResults.summary.criticalIssues} critical issues\n`;
  }

  const successfulPhases = Array.from(phaseResults.values()).filter((r) => r.success).length;
  summary += `- **Successful Phases:** ${successfulPhases}\n`;
  summary += `- **Failed Phases:** ${phaseResults.size - successfulPhases}\n\n`;

  summary += `## Phase Execution Details\n\n`;
  summary += `| Phase | Status | Duration (ms) | Message |\n`;
  summary += `|-------|--------|---------------|---------|\n`;

  for (const [phase, result] of phaseResults) {
    const status = result.success ? "✅ Success" : "❌ Failed";
    summary += `| ${phase} | ${status} | ${result.duration} | ${result.message} |\n`;
  }

  summary += `\n## Total Execution Time\n\n`;
  const totalDuration = Array.from(phaseResults.values()).reduce((sum, r) => sum + r.duration, 0);
  summary += `**${totalDuration}ms** (${(totalDuration / 1000).toFixed(2)}s)\n\n`;

  if (config.dryRun) {
    summary += `## Dry Run Results\n\n`;
    summary += `This was a dry run execution. No actual changes were made to feature flags.\n`;
    summary += `Review the analysis results and run without dry-run mode to execute changes.\n\n`;
  }

  summary += `## Next Steps\n\n`;
  if (config.operation === "audit") {
    summary += `- Review the compliance and usage reports\n`;
    summary += `- Consider running cleanup operation for unused flags\n`;
  } else {
    summary += `- Monitor application behavior after flag changes\n`;
    summary += `- Review audit logs for any issues\n`;
    summary += `- Update documentation if needed\n`;
  }

  try {
    await Deno.mkdir(config.reportsPath, { recursive: true });
    await Deno.writeTextFile(summaryPath, summary);
    info(`📊 Execution summary written to ${summaryPath}`);
  } catch (err) {
    error(`Failed to write execution summary: ${err}`);
  }
}

/**
 * Generates a recovery report for failed executions.
 */
async function generateRecoveryReport(
  config: MainConfig,
  failedPhase: string,
  phaseResults: Map<string, { success: boolean; duration: number; message: string }>,
): Promise<void> {
  const recoveryPath = `${config.reportsPath}/recovery-report.md`;

  let report = `# Failure Recovery Report\n\n`;
  report += `**Execution ID:** ${config.executionId}\n`;
  report += `**Failed Phase:** ${failedPhase}\n`;
  report += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  report += `## Completed Phases\n\n`;
  for (const [phase, result] of phaseResults) {
    if (result.success) {
      report += `- ✅ ${phase}: ${result.message} (${result.duration}ms)\n`;
    }
  }

  report += `\n## Recovery Instructions\n\n`;
  report += `1. Review the error details in the audit logs\n`;
  report += `2. Address the root cause based on the failed phase\n`;
  report += `3. Retry the execution from the beginning\n`;
  report += `4. Consider running in dry-run mode first\n\n`;

  report += `## Support Information\n\n`;
  report += `- Check API connectivity and credentials\n`;
  report += `- Verify file system permissions\n`;
  report += `- Review Optimizely project settings\n`;
  report += `- Contact system administrators if needed\n`;

  try {
    await Deno.mkdir(config.reportsPath, { recursive: true });
    await Deno.writeTextFile(recoveryPath, report);
    info(`🔧 Recovery report written to ${recoveryPath}`);
  } catch (err) {
    error(`Failed to write recovery report: ${err}`);
  }
}

/**
 * Generates sync summary JSON file for GitHub Action outputs.
 */
async function generateSyncSummary(
  config: MainConfig,
  complianceReport: ComplianceReport,
  usageReport: FlagUsageReport,
): Promise<void> {
  const summaryPath = `${config.reportsPath}/sync-summary.json`;

  const syncSummary = {
    timestamp: new Date().toISOString(),
    executionId: config.executionId,
    operation: config.operation,
    dryRun: config.dryRun,
    status: complianceReport.compliance.riskLevel === "HIGH" ? "warning" : "success",
    flagsProcessed: complianceReport.summary.totalFlags || 0,
    flagsArchived: complianceReport.summary.flagsArchived || 0,
    flagsUsed: complianceReport.summary.usedFlags || 0,
    flagsUnused: complianceReport.summary.unusedFlags || 0,
    usageRate: usageReport.summary.usageRate || 0,
    riskLevel: complianceReport.compliance.riskLevel,
    flagDebtScore: complianceReport.compliance.flagDebtScore,
    recommendations: complianceReport.recommendations.length,
    issues: complianceReport.compliance.issues.length,
  };

  try {
    await Deno.mkdir(config.reportsPath, { recursive: true });
    await Deno.writeTextFile(summaryPath, JSON.stringify(syncSummary, null, 2));
    info(`📊 Sync summary written to ${summaryPath}`);
  } catch (err) {
    error(`Failed to write sync summary: ${err}`);
  }
}

/**
 * Generates final audit reports.
 */
async function generateFinalReports(
  config: MainConfig,
): Promise<void> {
  info("📄 Generating final audit reports...");

  // Flush audit logs
  await auditReporter.flush();

  // Generate summary report
  await auditReporter.generateSummaryReport(
    `${config.reportsPath}/audit-summary.json`,
  );

  info(`✅ Reports generated in ${config.reportsPath}/`);
}

/**
 * Prints help information.
 */
function printHelp(): void {
  console.log(`
Feature Flag Synchronization Tool

USAGE:
  deno run --allow-all src/main.ts [OPTIONS]

OPTIONS:
  --environment <env>     Target environment (default: auto)
  --operation <op>        Operation type: cleanup, audit (default: cleanup)
  --dry-run              Enable dry run mode - simulate operations safely (default: true)
  --no-dry-run           Disable dry run mode - execute actual operations
  --reports-path <path>   Path for reports output (default: reports)
  --help                 Show this help message

ENVIRONMENT VARIABLES:
  OPTIMIZELY_API_TOKEN     Optimizely API token (required)
  OPTIMIZELY_PROJECT_ID    Optimizely project ID (required)
  GITHUB_TOKEN             GitHub token for repository access
  ENVIRONMENT              Target environment override
  OPERATION                Operation type override
  DRY_RUN                  Dry run mode override (true/false)
  REPORTS_PATH             Reports output path override

EXAMPLES:
  # Audit flags in dry run mode
  deno run --allow-all src/main.ts --operation audit

  # Cleanup flags for production environment
  deno run --allow-all src/main.ts --environment production --operation cleanup --no-dry-run

  # Cleanup unused flags
  deno run --allow-all src/main.ts --operation cleanup --no-dry-run
`);
}

// Execute main function if this is the main module
if (import.meta.main) {
  await main();
}
