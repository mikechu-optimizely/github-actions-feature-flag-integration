import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { loadEnvironment } from "./config/environment.ts";
import { OptimizelyClient } from "./modules/optimizely-client.ts";
import { FlagUsageReporter } from "./modules/flag-usage-reporter.ts";
import { ComplianceReporter } from "./modules/compliance-reporter.ts";
import { auditReporter } from "./modules/audit-reporter.ts";
import { info, error, debug } from "./utils/logger.ts";
import { validateInputs } from "./utils/validation.ts";
import { OptimizelyClient } from "./modules/optimizely-client.ts";
import { CodeAnalyzer } from "./modules/code-analysis.ts";
import { FlagUsageReporter } from "./modules/flag-usage-reporter.ts";
import { ComplianceReporter } from "./modules/compliance-reporter.ts";
import { auditReporter } from "./modules/audit-reporter.ts";
import { debug, error, info } from "./utils/logger.ts";
import { validateInputs } from "./utils/validation.ts";

/**
 * Main configuration interface for the application.
 */
interface MainConfig {
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

    // Log execution start
    auditReporter.log({
      timestamp: new Date().toISOString(),
      type: "info",
      message: `Starting feature flag synchronization`,
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
      codeAnalyzer,
      flagUsageReporter,
      complianceReporter,
    } = await initializeComponents(config);

    // Execute the synchronization workflow
    await executeSynchronizationWorkflow(
      config,
      optimizelyClient,
      codeAnalyzer,
      flagUsageReporter,
      complianceReporter,
    );

    // Generate final reports
    await generateFinalReports(config, complianceReporter);

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
    environment: args.environment || env.ENVIRONMENT || "auto",
    operation: (args.operation || env.OPERATION || "cleanup") as
      | "cleanup"
      | "audit",
    dryRun: args["dry-run"] ?? (env.DRY_RUN === "true"),
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
async function initializeComponents() {
  const env = await loadEnvironment();

  const optimizelyClient = new OptimizelyClient(
    env.OPTIMIZELY_API_TOKEN!,
    env.OPTIMIZELY_PROJECT_ID!,
  );

  const codeAnalyzer = new CodeAnalyzer({
    workspaceRoot: Deno.cwd(),
    excludePatterns: [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/*.md",
    ],
  });

  const flagUsageReporter = new FlagUsageReporter();
  const complianceReporter = new ComplianceReporter(auditReporter);

  return {
    optimizelyClient,
    codeAnalyzer,
    flagUsageReporter,
    complianceReporter,
  };
}

/**
 * Executes the main synchronization workflow.
 */
async function executeSynchronizationWorkflow(
  config: MainConfig,
  optimizelyClient: OptimizelyClient,
  codeAnalyzer: CodeAnalyzer,
  flagUsageReporter: FlagUsageReporter,
  complianceReporter: ComplianceReporter,
): Promise<void> {
  // Step 1: Fetch all feature flags from Optimizely
  info("📡 Fetching feature flags from Optimizely...");
  const flags = await optimizelyClient.getFeatureFlags();
  const flagKeys = flags.map((f) => f.key);

  auditReporter.log({
    timestamp: new Date().toISOString(),
    type: "info",
    message: `Fetched ${flagKeys.length} feature flags from Optimizely`,
    details: { flagCount: flagKeys.length, flags: flagKeys },
  });

  // Step 2: Analyze codebase for flag usage
  info("🔍 Analyzing codebase for flag usage...");
  const flagUsages = await codeAnalyzer.analyzeFeatureFlags(flagKeys);

  // Step 3: Generate usage report
  info("📊 Generating usage report...");
  const usageReport = flagUsageReporter.generateUsageReport(
    flagKeys,
    flagUsages,
  );

  // Step 4: Report unused flags
  for (const unusedFlag of usageReport.unusedFlagKeys) {
    auditReporter.log({
      timestamp: new Date().toISOString(),
      type: "flag_unused",
      message: `Flag '${unusedFlag}' is not used in codebase`,
      details: { flag: unusedFlag },
    });
  }

  // Step 5: Report used flags
  for (const [flag, usages] of usageReport.flagUsages) {
    if (usages.length > 0) {
      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "flag_in_use",
        message: `Flag '${flag}' is used in ${usages.length} location(s)`,
        details: { flag, usageCount: usages.length, usages },
      });
    }
  }

  // Step 6: Execute cleanup operations (if not dry run)
  if (
    !config.dryRun &&
    config.operation === "cleanup"
  ) {
    info("🗑️ Executing cleanup operations...");
    await executeCleanupOperations(
      config,
      optimizelyClient,
      usageReport.unusedFlagKeys,
    );
  } else {
    info("🔍 Dry run mode - no cleanup operations will be executed");
  }

  // Step 7: Generate compliance report
  info("📋 Generating compliance report...");
  const complianceReport = complianceReporter.generateComplianceReport(
    usageReport,
    undefined,
    {
      executionId: config.executionId,
      environment: config.environment,
      operation: config.operation,
      dryRun: config.dryRun,
    },
  );

  // Step 8: Export reports for CI artifacts
  await complianceReporter.exportForCiArtifacts(
    complianceReport,
    config.reportsPath,
  );
}

/**
 * Executes cleanup operations for unused flags.
 */
async function executeCleanupOperations(
  optimizelyClient: OptimizelyClient,
  unusedFlags: string[],
): Promise<void> {
  if (unusedFlags.length === 0) {
    info("✅ No unused flags to clean up");
    return;
  }

  info(`🗑️ Archiving ${unusedFlags.length} unused flags...`);

  const archivePromises = unusedFlags.map(async (flagKey) => {
    try {
      await optimizelyClient.archiveFeatureFlag(flagKey);

      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "flag_archived",
        message: `Successfully archived unused flag '${flagKey}'`,
        details: { flag: flagKey },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      auditReporter.log({
        timestamp: new Date().toISOString(),
        type: "error",
        message: `Failed to archive flag '${flagKey}': ${errorMessage}`,
        details: { flag: flagKey, error: errorMessage },
      });
    }
  });

  await Promise.allSettled(archivePromises);
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
  --dry-run              Enable dry run mode (default: true)
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

  # Sync flags for production environment
  deno run --allow-all src/main.ts --environment production --operation sync --no-dry-run

  # Cleanup unused flags
  deno run --allow-all src/main.ts --operation cleanup --no-dry-run
`);
}

// Execute main function if this is the main module
if (import.meta.main) {
  await main();
}
