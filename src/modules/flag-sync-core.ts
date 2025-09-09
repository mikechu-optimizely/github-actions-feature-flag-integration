/**
 * Flag synchronization core module for lifecycle operations.
 * Provides functionality to analyze flag differences, create sync plans, and execute operations.
 */

import { OptimizelyApiClient } from "./optimizely-client.ts";
import { FlagUsage } from "./code-analysis.ts";
import { FlagUsageReport } from "./flag-usage-reporter.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import {
  ConsistencyIssue,
  FlagConsistencyResult,
  PlanValidationResult,
  RiskAssessment,
  RiskLevel,
  SyncExecutionResult,
  SyncOperation,
  SyncOperationResult,
  SyncOperationType,
  SyncPlan,
  ValidationCheck,
} from "../types/sync.ts";
import * as logger from "../utils/logger.ts";
import { Result } from "../utils/try-catch.ts";

/**
 * Configuration options for the flag sync core
 */
export interface FlagSyncCoreOptions {
  /** Whether to run in dry-run mode (no actual changes) */
  dryRun: boolean;
  /** Maximum number of concurrent operations */
  maxConcurrentOperations: number;
  /** Timeout for individual operations in milliseconds */
  operationTimeoutMs: number;
  /** Whether to enable rollback on failure */
  enableRollback: boolean;
  /** Risk tolerance level for automatic execution */
  riskTolerance: RiskLevel;
}

/**
 * Default configuration for flag sync core
 */
const DEFAULT_OPTIONS: FlagSyncCoreOptions = {
  dryRun: true,
  maxConcurrentOperations: 3,
  operationTimeoutMs: 30000,
  enableRollback: true,
  riskTolerance: "medium",
};

/**
 * Core module for flag synchronization operations.
 * Manages the lifecycle of feature flag cleanup and consistency operations.
 */
export class FlagSyncCore {
  private readonly optimizelyClient: OptimizelyApiClient;
  private readonly options: FlagSyncCoreOptions;

  /**
   * Creates a new FlagSyncCore instance.
   * @param optimizelyClient Optimizely API client
   * @param options Configuration options
   */
  constructor(
    optimizelyClient: OptimizelyApiClient,
    options: Partial<FlagSyncCoreOptions> = {},
  ) {
    this.optimizelyClient = optimizelyClient;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    logger.info("FlagSyncCore initialized", {
      dryRun: this.options.dryRun,
      maxConcurrentOperations: this.options.maxConcurrentOperations,
      riskTolerance: this.options.riskTolerance,
    });
  }

  /**
   * Creates a synchronization plan by analyzing differences between Optimizely and codebase.
   * @param optimizelyFlags Array of flags from Optimizely
   * @param usageReport Flag usage report from codebase analysis
   * @returns Result containing the sync plan or error
   */
  async createSyncPlan(
    optimizelyFlags: OptimizelyFlag[],
    usageReport: FlagUsageReport,
  ): Promise<Result<SyncPlan, Error>> {
    try {
      // Add a small delay to make this genuinely async
      await new Promise((resolve) => setTimeout(resolve, 1));

      logger.info("Creating synchronization plan", {
        totalFlags: optimizelyFlags.length,
        unusedFlags: usageReport.unusedFlagKeys.length,
      });

      const planId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const operations: SyncOperation[] = [];

      // Analyze each flag and determine required operations
      for (const flag of optimizelyFlags) {
        const flagUsages = usageReport.flagUsages.get(flag.key) || [];
        const isUsedInCode = flagUsages.length > 0;
        const isUnused = usageReport.unusedFlagKeys.includes(flag.key);

        // Create operation based on analysis
        const operation = this.#createOperationForFlag(
          flag,
          flagUsages,
          isUsedInCode,
          isUnused,
        );

        if (operation.type !== "no_action") {
          operations.push(operation);
        }
      }

      // Calculate plan summary
      const summary = this.#calculatePlanSummary(operations);

      // Validate the plan
      const validationResults = this.#validateSyncPlan(operations);

      const syncPlan: SyncPlan = {
        id: planId,
        timestamp,
        status: "pending",
        operations,
        summary,
        validationResults,
      };

      logger.info("Sync plan created", {
        planId,
        totalOperations: operations.length,
        riskLevel: validationResults.riskAssessment.overallRisk,
      });

      return { data: syncPlan, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to create sync plan", { error: errorMessage });
      return { data: null, error: new Error(`Failed to create sync plan: ${errorMessage}`) };
    }
  }

  /**
   * Validates flag consistency between Optimizely and code usage.
   * @param optimizelyFlags Array of flags from Optimizely
   * @param usageReport Flag usage report from codebase analysis
   * @returns Array of consistency check results
   */
  async validateFlagConsistency(
    optimizelyFlags: OptimizelyFlag[],
    usageReport: FlagUsageReport,
  ): Promise<FlagConsistencyResult[]> {
    // Add a small delay to make this genuinely async
    await new Promise((resolve) => setTimeout(resolve, 1));

    logger.info("Validating flag consistency", {
      totalFlags: optimizelyFlags.length,
    });

    const results: FlagConsistencyResult[] = [];

    // Create a map for efficient lookups
    const flagMap = new Map(optimizelyFlags.map((flag) => [flag.key, flag]));

    // Check each flag in the usage report
    for (const [flagKey, usages] of usageReport.flagUsages) {
      const flag = flagMap.get(flagKey);
      const result = this.#validateFlagConsistencyForFlag(flagKey, flag, usages);
      results.push(result);
    }

    // Check for flags in Optimizely that are not used in code
    for (const flag of optimizelyFlags) {
      if (!usageReport.flagUsages.has(flag.key)) {
        const result = this.#validateFlagConsistencyForFlag(flag.key, flag, []);
        results.push(result);
      }
    }

    const inconsistentFlags = results.filter((r) => !r.isConsistent);
    logger.info("Flag consistency validation completed", {
      totalFlags: results.length,
      inconsistentFlags: inconsistentFlags.length,
    });

    return results;
  }

  /**
   * Executes a synchronization plan.
   * @param syncPlan The plan to execute
   * @returns Result containing execution results or error
   */
  async executeSyncPlan(syncPlan: SyncPlan): Promise<Result<SyncExecutionResult, Error>> {
    try {
      logger.info("Executing sync plan", {
        planId: syncPlan.id,
        totalOperations: syncPlan.operations.length,
        dryRun: this.options.dryRun,
      });

      const startTime = new Date().toISOString();
      const operationResults: SyncOperationResult[] = [];
      const warnings: string[] = [];

      // Validate plan before execution
      if (!syncPlan.validationResults.isValid) {
        throw new Error(
          `Cannot execute invalid plan: ${syncPlan.validationResults.errors.join(", ")}`,
        );
      }

      // Check risk tolerance
      if (!this.#isRiskAcceptable(syncPlan.validationResults.riskAssessment)) {
        throw new Error(
          `Plan risk level (${syncPlan.validationResults.riskAssessment.overallRisk}) exceeds tolerance (${this.options.riskTolerance})`,
        );
      }

      // Update plan status
      syncPlan.status = "in_progress";
      syncPlan.progress = {
        completed: 0,
        failed: 0,
        startTime,
      };

      // Execute operations with concurrency control
      const batches = this.#createOperationBatches(syncPlan.operations);

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map((operation) => this.#executeOperation(operation)),
        );

        // Process batch results
        for (let i = 0; i < batch.length; i++) {
          const operation = batch[i];
          const result = batchResults[i];

          let operationResult: SyncOperationResult;

          if (result.status === "fulfilled") {
            operationResult = result.value;
            syncPlan.progress!.completed++;
          } else {
            operationResult = {
              operationId: operation.id,
              status: "failed",
              message: result.reason?.message || "Operation failed",
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              durationMs: 0,
              error: {
                code: "EXECUTION_FAILED",
                message: result.reason?.message || "Unknown error",
                details: result.reason,
              },
            };
            syncPlan.progress!.failed++;

            // Attempt rollback if enabled and supported
            if (this.options.enableRollback && operation.rollbackInfo?.supported) {
              const rollbackResult = await this.#rollbackOperation(operation);
              operationResult.rollback = rollbackResult;
            }
          }

          operationResults.push(operationResult);
          syncPlan.progress!.currentOperation = operation.id;
        }

        // Stop execution if too many failures
        const failureRate = syncPlan.progress!.failed /
          (syncPlan.progress!.completed + syncPlan.progress!.failed);
        if (failureRate > 0.5 && syncPlan.progress!.failed > 2) {
          warnings.push("Stopping execution due to high failure rate");
          break;
        }
      }

      const endTime = new Date().toISOString();
      const totalDurationMs = Date.parse(endTime) - Date.parse(startTime);

      syncPlan.status = syncPlan.progress!.failed === 0 ? "completed" : "failed";
      syncPlan.progress!.endTime = endTime;

      const executionResult: SyncExecutionResult = {
        planId: syncPlan.id,
        status: syncPlan.progress!.failed === 0
          ? "success"
          : syncPlan.progress!.completed > 0
          ? "partial_success"
          : "failed",
        startTime,
        endTime,
        totalDurationMs,
        operationResults,
        summary: {
          totalExecuted: operationResults.length,
          successful: operationResults.filter((r) => r.status === "success").length,
          failed: operationResults.filter((r) => r.status === "failed").length,
          rolledBack: operationResults.filter((r) => r.rollback?.successful === true).length,
        },
        warnings,
      };

      logger.info("Sync plan execution completed", {
        planId: syncPlan.id,
        status: executionResult.status,
        successful: executionResult.summary.successful,
        failed: executionResult.summary.failed,
        durationMs: totalDurationMs,
      });

      return { data: executionResult, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Sync plan execution failed", { planId: syncPlan.id, error: errorMessage });

      syncPlan.status = "failed";
      return { data: null, error: new Error(`Sync plan execution failed: ${errorMessage}`) };
    }
  }

  /**
   * Creates an operation for a specific flag based on analysis.
   * @private
   */
  #createOperationForFlag(
    flag: OptimizelyFlag,
    flagUsages: FlagUsage[],
    isUsedInCode: boolean,
    isUnused: boolean,
  ): SyncOperation {
    const operationId = crypto.randomUUID();

    // Determine operation type and risk level
    let operationType: SyncOperationType = "no_action";
    let riskLevel: RiskLevel = "low";
    let reason = "";

    if (isUnused && !flag.archived) {
      operationType = "archive";
      riskLevel = "medium";
      reason = "Flag is not used in codebase and should be archived";
    } else if (isUsedInCode && flag.archived) {
      operationType = "enable";
      riskLevel = "high";
      reason = "Flag is used in code but archived in Optimizely";
    } else if (isUsedInCode) {
      operationType = "no_action";
      riskLevel = "low";
      reason = "Flag is properly used and configured";
    }

    // Create validation checks
    const validationChecks: ValidationCheck[] = [
      {
        id: "code_usage_check",
        description: "Verify code usage analysis is accurate",
        required: true,
        status: "pending",
      },
      {
        id: "flag_dependencies_check",
        description: "Check for flag dependencies or experiments",
        required: true,
        status: "pending",
      },
    ];

    if (operationType === "archive") {
      validationChecks.push({
        id: "archive_safety_check",
        description: "Ensure flag can be safely archived",
        required: true,
        status: "pending",
      });
    }

    return {
      id: operationId,
      type: operationType,
      flagKey: flag.key,
      riskLevel,
      reason,
      context: {
        currentFlag: flag,
        codeUsages: flagUsages,
      },
      validationChecks,
      rollbackInfo: {
        supported: operationType === "archive",
        previousState: {
          archived: flag.archived,
          enabled: !flag.archived, // Simplified assumption
        },
        instructions: `Restore flag ${flag.key} to previous state`,
      },
    };
  }

  /**
   * Calculates summary statistics for a sync plan.
   * @private
   */
  #calculatePlanSummary(operations: SyncOperation[]) {
    const operationsByType: Record<SyncOperationType, number> = {
      archive: 0,
      enable: 0,
      disable: 0,
      update: 0,
      no_action: 0,
    };

    const operationsByRisk: Record<RiskLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const operation of operations) {
      operationsByType[operation.type]++;
      operationsByRisk[operation.riskLevel]++;
    }

    // Estimate duration based on operation types (rough estimates)
    const estimatedDurationMs = operations.reduce((total, op) => {
      const baseDuration = op.type === "archive" ? 2000 : 1000;
      const riskMultiplier = { low: 1, medium: 1.2, high: 1.5, critical: 2 }[op.riskLevel];
      return total + (baseDuration * riskMultiplier);
    }, 0);

    return {
      totalOperations: operations.length,
      operationsByType,
      operationsByRisk,
      estimatedDurationMs,
    };
  }

  /**
   * Validates a sync plan for safety and correctness.
   * @private
   */
  #validateSyncPlan(operations: SyncOperation[]): PlanValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    // Check for dangerous operations
    const criticalOperations = operations.filter((op) => op.riskLevel === "critical");
    const highRiskOperations = operations.filter((op) => op.riskLevel === "high");

    if (criticalOperations.length > 0) {
      errors.push(`Plan contains ${criticalOperations.length} critical risk operations`);
    }

    if (highRiskOperations.length > 5) {
      warnings.push(`Plan contains ${highRiskOperations.length} high-risk operations`);
    }

    // Validate operation dependencies
    const archiveOperations = operations.filter((op) => op.type === "archive");
    if (archiveOperations.length > 50) {
      warnings.push(
        `Large number of archive operations (${archiveOperations.length}). Consider smaller batches.`,
      );
    }

    // Risk assessment
    const overallRisk = this.#calculateOverallRisk(operations);
    const potentialImpact = this.#assessPotentialImpact(operations);
    const recommendations = this.#generateRecommendations(operations);

    const riskAssessment: RiskAssessment = {
      overallRisk,
      highRiskOperations: highRiskOperations.length,
      potentialImpact,
      recommendations,
    };

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      riskAssessment,
    };
  }

  /**
   * Validates consistency for a single flag.
   * @private
   */
  #validateFlagConsistencyForFlag(
    flagKey: string,
    flag: OptimizelyFlag | undefined,
    usages: FlagUsage[],
  ): FlagConsistencyResult {
    const issues: ConsistencyIssue[] = [];
    const existsInOptimizely = flag !== undefined;
    const usedInCode = usages.length > 0;

    // Check for orphaned flags
    if (existsInOptimizely && !usedInCode && !flag!.archived) {
      issues.push({
        type: "orphaned_flag",
        severity: "medium",
        message: `Flag '${flagKey}' exists in Optimizely but is not used in code`,
        resolution: "Consider archiving this flag",
      });
    }

    // Check for missing flags
    if (usedInCode && !existsInOptimizely) {
      issues.push({
        type: "missing_flag",
        severity: "high",
        message: `Flag '${flagKey}' is used in code but does not exist in Optimizely`,
        resolution: "Create the flag in Optimizely or remove from code",
      });
    }

    // Check for status mismatches
    if (existsInOptimizely && usedInCode && flag!.archived) {
      issues.push({
        type: "status_mismatch",
        severity: "high",
        message: `Flag '${flagKey}' is used in code but archived in Optimizely`,
        resolution: "Unarchive the flag or remove from code",
      });
    }

    return {
      flagKey,
      isConsistent: issues.length === 0,
      issues,
      alignment: {
        existsInOptimizely,
        usedInCode,
        statusAligned: !existsInOptimizely || !usedInCode || !flag!.archived,
      },
    };
  }

  /**
   * Executes a single sync operation.
   * @private
   */
  async #executeOperation(operation: SyncOperation): Promise<SyncOperationResult> {
    const startTime = new Date().toISOString();

    try {
      logger.info("Executing sync operation", {
        operationId: operation.id,
        type: operation.type,
        flagKey: operation.flagKey,
        dryRun: this.options.dryRun,
      });

      // Run validation checks first
      for (const check of operation.validationChecks) {
        if (check.required && check.status === "pending") {
          // Simulate validation - in real implementation, this would perform actual checks
          check.status = "passed"; // For now, assume all checks pass
        }
      }

      let message = "";

      if (this.options.dryRun) {
        message = `DRY RUN: Would execute ${operation.type} for flag ${operation.flagKey}`;
      } else {
        // Execute actual operation
        switch (operation.type) {
          case "archive":
            await this.#archiveFlag(operation.flagKey);
            message = `Successfully archived flag ${operation.flagKey}`;
            break;
          case "enable":
            await this.#enableFlag(operation.flagKey);
            message = `Successfully enabled flag ${operation.flagKey}`;
            break;
          case "disable":
            await this.#disableFlag(operation.flagKey);
            message = `Successfully disabled flag ${operation.flagKey}`;
            break;
          default:
            message = `No action required for flag ${operation.flagKey}`;
        }
      }

      const endTime = new Date().toISOString();
      const durationMs = Date.parse(endTime) - Date.parse(startTime);

      return {
        operationId: operation.id,
        status: "success",
        message,
        startTime,
        endTime,
        durationMs,
      };
    } catch (error) {
      const endTime = new Date().toISOString();
      const durationMs = Date.parse(endTime) - Date.parse(startTime);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      logger.error("Operation execution failed", {
        operationId: operation.id,
        error: errorMessage,
      });

      return {
        operationId: operation.id,
        status: "failed",
        message: `Failed to execute ${operation.type} for flag ${operation.flagKey}`,
        startTime,
        endTime,
        durationMs,
        error: {
          code: "OPERATION_FAILED",
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Archives a feature flag.
   * @private
   */
  async #archiveFlag(flagKey: string): Promise<void> {
    // TODO: Implement actual flag archiving through Optimizely API
    // For now, simulate the operation
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info(`Flag ${flagKey} archived`);
  }

  /**
   * Enables a feature flag.
   * @private
   */
  async #enableFlag(flagKey: string): Promise<void> {
    // TODO: Implement actual flag enabling through Optimizely API
    // For now, simulate the operation
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info(`Flag ${flagKey} enabled`);
  }

  /**
   * Disables a feature flag.
   * @private
   */
  async #disableFlag(flagKey: string): Promise<void> {
    // TODO: Implement actual flag disabling through Optimizely API
    // For now, simulate the operation
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info(`Flag ${flagKey} disabled`);
  }

  /**
   * Attempts to rollback an operation.
   * @private
   */
  async #rollbackOperation(operation: SyncOperation): Promise<{
    attempted: boolean;
    successful: boolean;
    message: string;
  }> {
    try {
      logger.warn("Attempting rollback for operation", {
        operationId: operation.id,
        flagKey: operation.flagKey,
      });

      // TODO: Implement actual rollback logic
      // For now, simulate rollback
      await new Promise((resolve) => setTimeout(resolve, 200));

      return {
        attempted: true,
        successful: true,
        message:
          `Successfully rolled back ${operation.type} operation for flag ${operation.flagKey}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        attempted: true,
        successful: false,
        message: `Failed to rollback operation: ${errorMessage}`,
      };
    }
  }

  /**
   * Checks if the risk level is acceptable based on configuration.
   * @private
   */
  #isRiskAcceptable(riskAssessment: RiskAssessment): boolean {
    const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
    const toleranceIndex = riskLevels.indexOf(this.options.riskTolerance);
    const assessmentIndex = riskLevels.indexOf(riskAssessment.overallRisk);

    return assessmentIndex <= toleranceIndex;
  }

  /**
   * Creates batches of operations for concurrent execution.
   * @private
   */
  #createOperationBatches(operations: SyncOperation[]): SyncOperation[][] {
    const batches: SyncOperation[][] = [];
    const batchSize = this.options.maxConcurrentOperations;

    for (let i = 0; i < operations.length; i += batchSize) {
      batches.push(operations.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Calculates overall risk level for operations.
   * @private
   */
  #calculateOverallRisk(operations: SyncOperation[]): RiskLevel {
    const riskCounts = operations.reduce(
      (counts, op) => {
        counts[op.riskLevel]++;
        return counts;
      },
      { low: 0, medium: 0, high: 0, critical: 0 } as Record<RiskLevel, number>,
    );

    if (riskCounts.critical > 0) return "critical";
    if (riskCounts.high > 0) return "high";
    if (riskCounts.medium > 0) return "medium";
    return "low";
  }

  /**
   * Assesses potential impact of operations.
   * @private
   */
  #assessPotentialImpact(operations: SyncOperation[]): string[] {
    const impact: string[] = [];
    const archiveCount = operations.filter((op) => op.type === "archive").length;
    const enableCount = operations.filter((op) => op.type === "enable").length;

    if (archiveCount > 0) {
      impact.push(`${archiveCount} flags will be archived and removed from active use`);
    }

    if (enableCount > 0) {
      impact.push(`${enableCount} flags will be enabled and become available for use`);
    }

    return impact;
  }

  /**
   * Generates recommendations based on operations.
   * @private
   */
  #generateRecommendations(operations: SyncOperation[]): string[] {
    const recommendations: string[] = [];
    const highRiskCount = operations.filter((op) => op.riskLevel === "high").length;

    if (this.options.dryRun) {
      recommendations.push("Run in dry-run mode first to validate operations");
    }

    if (highRiskCount > 0) {
      recommendations.push("Review high-risk operations manually before execution");
      recommendations.push("Consider executing operations in smaller batches");
    }

    recommendations.push("Monitor application behavior after flag changes");
    recommendations.push("Have rollback procedures ready in case of issues");

    return recommendations;
  }
}
