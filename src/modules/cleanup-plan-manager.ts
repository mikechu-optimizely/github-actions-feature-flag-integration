/**
 * Cleanup plan manager for analyzing flag differences and creating execution plans.
 * Provides comprehensive analysis, risk assessment, and execution planning for flag lifecycle operations.
 */

import { OptimizelyFlag } from "../types/optimizely.ts";
import { FlagUsageReport } from "./flag-usage-reporter.ts";
import {
  CleanupPlan,
  CleanupPlanOptions,
  FlagAnalysisResult,
  FlagDifference,
  PlanExecutionOrder,
  RiskLevel,
  SyncOperation,
  SyncOperationType,
} from "../types/sync.ts";
import * as logger from "../utils/logger.ts";
import { Result } from "../utils/try-catch.ts";

/**
 * Configuration options for cleanup plan creation
 */
export interface CleanupPlanManagerOptions {
  /** Maximum number of flags to process in a single plan */
  maxFlagsPerPlan: number;
  /** Risk tolerance for automatic plan creation */
  riskTolerance: RiskLevel;
  /** Whether to include preview mode operations */
  enablePreview: boolean;
  /** Safety checks to enforce */
  safetyChecks: {
    requireConfirmation: boolean;
    validateDependencies: boolean;
    checkRecentUsage: boolean;
    enforceRollbackCapability: boolean;
  };
}

/**
 * Default configuration for cleanup plan manager
 */
const DEFAULT_OPTIONS: CleanupPlanManagerOptions = {
  maxFlagsPerPlan: 100,
  riskTolerance: "medium",
  enablePreview: true,
  safetyChecks: {
    requireConfirmation: true,
    validateDependencies: true,
    checkRecentUsage: true,
    enforceRollbackCapability: true,
  },
};

/**
 * Manager for creating and validating cleanup execution plans.
 * Analyzes flag differences and creates comprehensive execution strategies.
 */
export class CleanupPlanManager {
  private readonly options: CleanupPlanManagerOptions;

  /**
   * Creates a new cleanup plan manager instance.
   * @param options Configuration options
   */
  constructor(options: Partial<CleanupPlanManagerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    logger.info("CleanupPlanManager initialized", {
      maxFlagsPerPlan: this.options.maxFlagsPerPlan,
      riskTolerance: this.options.riskTolerance,
      enablePreview: this.options.enablePreview,
    });
  }

  /**
   * Analyzes flag differences between Optimizely and codebase usage.
   * @param optimizelyFlags Array of flags from Optimizely
   * @param usageReport Flag usage report from codebase analysis
   * @returns Analysis results with identified differences
   */
  analyzeFlagDifferences(
    optimizelyFlags: OptimizelyFlag[],
    usageReport: FlagUsageReport,
  ): Result<FlagAnalysisResult, Error> {
    try {
      logger.info("Analyzing flag differences", {
        optimizelyFlagCount: optimizelyFlags.length,
        usageReportFlags: usageReport.flagUsages.size,
        unusedFlags: usageReport.unusedFlagKeys.length,
      });

      const analysis: FlagAnalysisResult = {
        timestamp: new Date().toISOString(),
        totalOptimizelyFlags: optimizelyFlags.length,
        totalCodebaseFlags: usageReport.flagUsages.size,
        differences: [],
        summary: {
          orphanedFlags: 0,
          missingFlags: 0,
          archivedButUsed: 0,
          activeButUnused: 0,
          consistentFlags: 0,
        },
      };

      const optimizelyFlagMap = new Map(optimizelyFlags.map((flag) => [flag.key, flag]));
      const codebaseFlags = new Set([...usageReport.flagUsages.keys()]);

      // Identify differences
      for (const flag of optimizelyFlags) {
        const isUsedInCode = usageReport.flagUsages.has(flag.key);
        const isUnused = usageReport.unusedFlagKeys.includes(flag.key);
        const difference = this.#analyzeFlagDifference(flag, isUsedInCode, isUnused, usageReport);

        if (difference) {
          analysis.differences.push(difference);
          this.#updateAnalysisSummary(analysis.summary, difference.type);
        } else {
          analysis.summary.consistentFlags++;
        }
      }

      // Check for flags used in code but not in Optimizely
      for (const flagKey of codebaseFlags) {
        if (!optimizelyFlagMap.has(flagKey)) {
          const difference: FlagDifference = {
            flagKey,
            type: "missing_in_optimizely",
            severity: "high",
            description: `Flag '${flagKey}' is used in code but does not exist in Optimizely`,
            recommendedAction: "create_flag",
            riskLevel: "high",
            context: {
              usageLocations: usageReport.flagUsages.get(flagKey) || [],
              lastModified: undefined,
              optimizelyFlag: undefined,
            },
          };

          analysis.differences.push(difference);
          analysis.summary.missingFlags++;
        }
      }

      logger.info("Flag analysis completed", {
        totalDifferences: analysis.differences.length,
        orphanedFlags: analysis.summary.orphanedFlags,
        missingFlags: analysis.summary.missingFlags,
        consistentFlags: analysis.summary.consistentFlags,
      });

      return { data: analysis, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to analyze flag differences", { error: errorMessage });
      return {
        data: null,
        error: new Error(`Failed to analyze flag differences: ${errorMessage}`),
      };
    }
  }

  /**
   * Creates a comprehensive cleanup execution plan from analysis results.
   * @param analysis Flag analysis results
   * @param options Plan creation options
   * @returns Detailed cleanup plan with execution strategy
   */
  createCleanupPlan(
    analysis: FlagAnalysisResult,
    options: Partial<CleanupPlanOptions> = {},
  ): Result<CleanupPlan, Error> {
    try {
      const planOptions: CleanupPlanOptions = {
        dryRun: true,
        batchSize: 10,
        maxConcurrentOperations: 3,
        requireConfirmation: true,
        enableRollback: true,
        ...options,
      };

      logger.info("Creating cleanup execution plan", {
        totalDifferences: analysis.differences.length,
        dryRun: planOptions.dryRun,
        batchSize: planOptions.batchSize,
      });

      const planId = crypto.randomUUID();
      const operations: SyncOperation[] = [];
      const executionOrder = this.#createExecutionOrder(analysis.differences);

      // Create operations based on analysis
      for (const difference of analysis.differences) {
        const operation = this.#createOperationFromDifference(difference);
        if (operation) {
          operations.push(operation);
        }
      }

      // Validate plan against safety checks
      const validationResult = this.#validateCleanupPlan(operations, planOptions);

      const plan: CleanupPlan = {
        id: planId,
        timestamp: new Date().toISOString(),
        status: "draft",
        analysis,
        operations,
        executionOrder,
        options: planOptions,
        validation: validationResult,
        metadata: {
          createdBy: "cleanup-plan-manager",
          estimatedDuration: this.#estimateExecutionDuration(operations),
          riskAssessment: this.#assessPlanRisk(operations),
          dependencies: this.#identifyDependencies(operations),
        },
      };

      // Apply execution ordering
      plan.operations = this.#orderOperations(plan.operations, executionOrder);

      logger.info("Cleanup plan created", {
        planId,
        totalOperations: operations.length,
        overallRisk: plan.metadata.riskAssessment.overallRisk,
        estimatedDurationMs: plan.metadata.estimatedDuration,
      });

      return { data: plan, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to create cleanup plan", { error: errorMessage });
      return {
        data: null,
        error: new Error(`Failed to create cleanup plan: ${errorMessage}`),
      };
    }
  }

  /**
   * Validates a cleanup plan for safety and correctness.
   * @param operations Array of operations to validate
   * @param options Plan options affecting validation
   * @returns Validation result with errors, warnings, and recommendations
   */
  validatePlan(
    operations: SyncOperation[],
    options: CleanupPlanOptions,
  ): Result<{ isValid: boolean; errors: string[]; warnings: string[] }, Error> {
    try {
      const validation = this.#validateCleanupPlan(operations, options);

      return {
        data: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        error: null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        data: null,
        error: new Error(`Plan validation failed: ${errorMessage}`),
      };
    }
  }

  /**
   * Analyzes a single flag for differences.
   * @private
   */
  #analyzeFlagDifference(
    flag: OptimizelyFlag,
    isUsedInCode: boolean,
    isUnused: boolean,
    usageReport: FlagUsageReport,
  ): FlagDifference | null {
    // Flag is orphaned (exists in Optimizely but not used in code)
    if (!isUsedInCode && !flag.archived) {
      return {
        flagKey: flag.key,
        type: "orphaned_in_optimizely",
        severity: "medium",
        description: `Flag '${flag.key}' exists in Optimizely but is not used in code`,
        recommendedAction: "archive_flag",
        riskLevel: this.#calculateRiskLevel(flag, isUsedInCode),
        context: {
          usageLocations: [],
          lastModified: flag.updated_time,
          optimizelyFlag: flag,
        },
      };
    }

    // Flag is archived but still used in code
    if (isUsedInCode && flag.archived) {
      return {
        flagKey: flag.key,
        type: "archived_but_used",
        severity: "high",
        description: `Flag '${flag.key}' is archived in Optimizely but still used in code`,
        recommendedAction: "unarchive_flag",
        riskLevel: "high",
        context: {
          usageLocations: usageReport.flagUsages.get(flag.key) || [],
          lastModified: flag.updated_time,
          optimizelyFlag: flag,
        },
      };
    }

    // Flag is active but unused
    if (isUnused && !flag.archived) {
      return {
        flagKey: flag.key,
        type: "active_but_unused",
        severity: "low",
        description: `Flag '${flag.key}' is active in Optimizely but appears unused in code`,
        recommendedAction: "review_flag",
        riskLevel: "medium",
        context: {
          usageLocations: usageReport.flagUsages.get(flag.key) || [],
          lastModified: flag.updated_time,
          optimizelyFlag: flag,
        },
      };
    }

    // No difference found
    return null;
  }

  /**
   * Updates analysis summary counters.
   * @private
   */
  #updateAnalysisSummary(
    summary: FlagAnalysisResult["summary"],
    differenceType: FlagDifference["type"],
  ): void {
    switch (differenceType) {
      case "orphaned_in_optimizely":
        summary.orphanedFlags++;
        break;
      case "missing_in_optimizely":
        summary.missingFlags++;
        break;
      case "archived_but_used":
        summary.archivedButUsed++;
        break;
      case "active_but_unused":
        summary.activeButUnused++;
        break;
    }
  }

  /**
   * Calculates risk level for a flag operation.
   * @private
   */
  #calculateRiskLevel(flag: OptimizelyFlag, isUsedInCode: boolean): RiskLevel {
    // High risk if recently modified
    const lastModified = new Date(flag.updated_time);
    const daysSinceModified = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceModified < 7) {
      return "high";
    }

    if (isUsedInCode) {
      return "critical";
    }

    if (daysSinceModified < 30) {
      return "medium";
    }

    return "low";
  }

  /**
   * Creates an operation from a flag difference.
   * @private
   */
  #createOperationFromDifference(
    difference: FlagDifference,
  ): SyncOperation | null {
    const operationType = this.#getOperationTypeFromAction(difference.recommendedAction);

    if (operationType === "no_action") {
      return null;
    }

    const operation: SyncOperation = {
      id: crypto.randomUUID(),
      type: operationType,
      flagKey: difference.flagKey,
      riskLevel: difference.riskLevel,
      reason: difference.description,
      context: {
        currentFlag: difference.context.optimizelyFlag,
        codeUsages: difference.context.usageLocations,
        dependencies: [],
      },
      validationChecks: [
        {
          id: "safety-check",
          description: "Verify operation safety",
          required: true,
          status: "pending",
        },
      ],
      rollbackInfo: {
        supported: operationType === "archive",
        previousState: difference.context.optimizelyFlag
          ? {
            archived: difference.context.optimizelyFlag.archived,
            enabled: !difference.context.optimizelyFlag.archived,
          }
          : undefined,
        instructions: `Restore flag ${difference.flagKey} to previous state`,
      },
    };

    return operation;
  }

  /**
   * Maps recommended actions to operation types.
   * @private
   */
  #getOperationTypeFromAction(action: string): SyncOperationType {
    switch (action) {
      case "archive_flag":
        return "archive";
      case "unarchive_flag":
      case "enable_flag":
        return "enable";
      case "disable_flag":
        return "disable";
      case "create_flag":
        return "update";
      case "review_flag":
      default:
        return "no_action";
    }
  }

  /**
   * Creates execution order based on risk and dependencies.
   * @private
   */
  #createExecutionOrder(differences: FlagDifference[]): PlanExecutionOrder {
    const phases = [
      {
        name: "safety_validations",
        description: "Run all safety validations first",
        operations: differences
          .filter((d) => d.severity === "high" || d.riskLevel === "critical")
          .map((d) => ({ flagKey: d.flagKey, reason: "High risk operation requires validation" })),
      },
      {
        name: "low_risk_operations",
        description: "Execute low-risk operations first",
        operations: differences
          .filter((d) => d.riskLevel === "low")
          .map((d) => ({ flagKey: d.flagKey, reason: "Low risk operation" })),
      },
      {
        name: "medium_risk_operations",
        description: "Execute medium-risk operations with monitoring",
        operations: differences
          .filter((d) => d.riskLevel === "medium")
          .map((d) => ({ flagKey: d.flagKey, reason: "Medium risk operation" })),
      },
      {
        name: "high_risk_operations",
        description: "Execute high-risk operations with extra caution",
        operations: differences
          .filter((d) => d.riskLevel === "high" || d.riskLevel === "critical")
          .map((d) => ({ flagKey: d.flagKey, reason: "High risk operation" })),
      },
    ];

    return {
      strategy: "risk_based",
      phases,
      dependencies: new Map(),
    };
  }

  /**
   * Validates the cleanup plan for safety and correctness.
   * @private
   */
  #validateCleanupPlan(operations: SyncOperation[], options: CleanupPlanOptions) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    // Check batch size limits
    if (operations.length > this.options.maxFlagsPerPlan) {
      errors.push(
        `Plan contains ${operations.length} operations, exceeding maximum of ${this.options.maxFlagsPerPlan}`,
      );
    }

    // Check for critical operations
    const criticalOperations = operations.filter((op) => op.riskLevel === "critical");
    if (criticalOperations.length > 0) {
      if (options.requireConfirmation) {
        warnings.push(
          `Plan contains ${criticalOperations.length} critical risk operations requiring manual confirmation`,
        );
      } else {
        errors.push("Critical risk operations require confirmation to be enabled");
      }
    }

    // Check rollback capabilities
    if (this.options.safetyChecks.enforceRollbackCapability) {
      const nonRollbackOperations = operations.filter((op) => !op.rollbackInfo?.supported);
      if (nonRollbackOperations.length > 0) {
        warnings.push(
          `${nonRollbackOperations.length} operations do not support rollback`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      riskAssessment: this.#assessPlanRisk(operations),
    };
  }

  /**
   * Estimates execution duration for operations.
   * @private
   */
  #estimateExecutionDuration(operations: SyncOperation[]): number {
    return operations.reduce((total, op) => {
      const baseDuration = op.type === "archive" ? 3000 : 2000;
      const riskMultiplier = { low: 1, medium: 1.2, high: 1.5, critical: 2 }[op.riskLevel];
      return total + (baseDuration * riskMultiplier);
    }, 0);
  }

  /**
   * Assesses overall risk for the plan.
   * @private
   */
  #assessPlanRisk(operations: SyncOperation[]) {
    const riskCounts = operations.reduce(
      (counts, op) => {
        counts[op.riskLevel]++;
        return counts;
      },
      { low: 0, medium: 0, high: 0, critical: 0 } as Record<RiskLevel, number>,
    );

    const overallRisk: RiskLevel = riskCounts.critical > 0
      ? "critical"
      : riskCounts.high > 0
      ? "high"
      : riskCounts.medium > 0
      ? "medium"
      : "low";

    return {
      overallRisk,
      highRiskOperations: riskCounts.high + riskCounts.critical,
      potentialImpact: [
        `${operations.length} total operations planned`,
        `${riskCounts.critical} critical risk operations`,
        `${riskCounts.high} high risk operations`,
      ],
      recommendations: [
        "Review all operations before execution",
        "Execute in dry-run mode first",
        "Monitor applications after flag changes",
      ],
    };
  }

  /**
   * Identifies operation dependencies.
   * @private
   */
  #identifyDependencies(operations: SyncOperation[]): string[] {
    // Simple dependency identification - could be more sophisticated
    const dependencies: string[] = [];

    const archiveOperations = operations.filter((op) => op.type === "archive").length;
    if (archiveOperations > 0) {
      dependencies.push("Optimizely API access for flag archiving");
    }

    const enableOperations = operations.filter((op) => op.type === "enable").length;
    if (enableOperations > 0) {
      dependencies.push("Optimizely API access for flag management");
    }

    return dependencies;
  }

  /**
   * Orders operations based on execution strategy.
   * @private
   */
  #orderOperations(
    operations: SyncOperation[],
    executionOrder: PlanExecutionOrder,
  ): SyncOperation[] {
    // Create operation lookup
    const operationMap = new Map(operations.map((op) => [op.flagKey, op]));
    const orderedOperations: SyncOperation[] = [];

    // Process phases in order
    for (const phase of executionOrder.phases) {
      for (const phaseOp of phase.operations) {
        const operation = operationMap.get(phaseOp.flagKey);
        if (operation && !orderedOperations.includes(operation)) {
          orderedOperations.push(operation);
        }
      }
    }

    // Add any remaining operations
    for (const operation of operations) {
      if (!orderedOperations.includes(operation)) {
        orderedOperations.push(operation);
      }
    }

    return orderedOperations;
  }
}
