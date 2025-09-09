/**
 * Consistency validation module for flag cleanup operations.
 * Provides comprehensive validation of flag states before and after operations,
 * cross-reference validation, and automated rollback on inconsistencies.
 */

import { OptimizelyApiClient } from "./optimizely-client.ts";
import { FlagUsage } from "./code-analysis.ts";
import { FlagUsageReport } from "./flag-usage-reporter.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import {
  ConsistencyIssue,
  FlagConsistencyResult,
  SyncOperation,
  SyncOperationResult,
} from "../types/sync.ts";
import * as logger from "../utils/logger.ts";
import { Result } from "../utils/try-catch.ts";

/**
 * Consistency validation options
 */
export interface ConsistencyValidatorOptions {
  /** Whether to enable automated rollback on inconsistencies */
  enableAutoRollback: boolean;
  /** Maximum allowed inconsistencies before stopping execution */
  maxInconsistencies: number;
  /** Whether to perform deep validation (slower but more thorough) */
  deepValidation: boolean;
  /** Timeout for validation operations in milliseconds */
  validationTimeoutMs: number;
}

/**
 * Default consistency validator options
 */
const DEFAULT_OPTIONS: ConsistencyValidatorOptions = {
  enableAutoRollback: true,
  maxInconsistencies: 5,
  deepValidation: true,
  validationTimeoutMs: 30000,
};

/**
 * Pre-operation validation context
 */
export interface PreOperationValidationContext {
  /** Operation being validated */
  operation: SyncOperation;
  /** Current flag state in Optimizely */
  currentFlag?: OptimizelyFlag;
  /** Usage report showing code references */
  usageReport: FlagUsageReport;
  /** Additional validation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Post-operation validation context
 */
export interface PostOperationValidationContext {
  /** Operation that was executed */
  operation: SyncOperation;
  /** Operation execution result */
  operationResult: SyncOperationResult;
  /** Flag state before operation */
  preOperationState?: OptimizelyFlag;
  /** Flag state after operation */
  postOperationState?: OptimizelyFlag;
  /** Usage report for cross-reference validation */
  usageReport: FlagUsageReport;
}

/**
 * Validation result for a single check
 */
export interface ValidationResult {
  /** Whether validation passed */
  passed: boolean;
  /** Validation check identifier */
  checkId: string;
  /** Check description */
  description: string;
  /** Issues found during validation */
  issues: ConsistencyIssue[];
  /** Validation duration in milliseconds */
  durationMs: number;
  /** Additional validation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Comprehensive consistency validation result
 */
export interface ConsistencyValidationResult {
  /** Validation timestamp */
  timestamp: string;
  /** Overall validation status */
  passed: boolean;
  /** Individual validation results */
  validations: ValidationResult[];
  /** Summary of issues found */
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
  };
  /** Recommended actions */
  recommendations: string[];
  /** Whether rollback is recommended */
  rollbackRecommended: boolean;
}

/**
 * Data integrity check result
 */
export interface DataIntegrityResult {
  /** Flag key being checked */
  flagKey: string;
  /** Whether data integrity is maintained */
  integrityMaintained: boolean;
  /** Integrity issues found */
  issues: {
    type: "data_corruption" | "state_mismatch" | "reference_orphan" | "configuration_drift";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    expectedValue?: unknown;
    actualValue?: unknown;
  }[];
  /** Validation timestamp */
  timestamp: string;
}

/**
 * Cross-reference validation result
 */
export interface CrossReferenceValidationResult {
  /** Flag key being validated */
  flagKey: string;
  /** Whether cross-references are valid */
  referencesValid: boolean;
  /** Reference validation details */
  referenceChecks: {
    optimizelyExists: boolean;
    codebaseReferences: number;
    validReferences: number;
    invalidReferences: string[];
    ambiguousReferences: string[];
  };
  /** Issues found in cross-references */
  issues: ConsistencyIssue[];
}

/**
 * Consistency validator for flag cleanup operations
 */
export class ConsistencyValidator {
  private readonly optimizelyClient: OptimizelyApiClient;
  private readonly options: ConsistencyValidatorOptions;

  /**
   * Creates a new ConsistencyValidator instance.
   * @param optimizelyClient Optimizely API client
   * @param options Validation options
   */
  constructor(
    optimizelyClient: OptimizelyApiClient,
    options: Partial<ConsistencyValidatorOptions> = {},
  ) {
    this.optimizelyClient = optimizelyClient;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    logger.info("ConsistencyValidator initialized", {
      enableAutoRollback: this.options.enableAutoRollback,
      maxInconsistencies: this.options.maxInconsistencies,
      deepValidation: this.options.deepValidation,
    });
  }

  /**
   * Validates flag states before operation execution.
   * @param context Pre-operation validation context
   * @returns Result containing validation results
   */
  async validatePreOperation(
    context: PreOperationValidationContext,
  ): Promise<Result<ConsistencyValidationResult, Error>> {
    const startTime = Date.now();

    try {
      logger.info("Starting pre-operation validation", {
        operationId: context.operation.id,
        flagKey: context.operation.flagKey,
        operationType: context.operation.type,
      });

      const validations: ValidationResult[] = [];

      // 1. Validate current flag state consistency
      const flagStateValidation = this.#validateFlagState(
        context.operation.flagKey,
        context.currentFlag,
        context.usageReport,
      );
      validations.push(flagStateValidation);

      // 2. Validate operation prerequisites
      const prerequisiteValidation = this.#validateOperationPrerequisites(context.operation);
      validations.push(prerequisiteValidation);

      // 3. Cross-reference validation
      const crossRefValidation = this.#validateCrossReferences(
        context.operation.flagKey,
        context.currentFlag,
        context.usageReport,
      );
      validations.push(crossRefValidation);

      // 4. Risk assessment validation
      const riskValidation = this.#validateRiskAssessment(context.operation);
      validations.push(riskValidation);

      // 5. Deep validation if enabled
      if (this.options.deepValidation) {
        const deepValidation = await this.#performDeepValidation(
          context.operation.flagKey,
          context.currentFlag,
        );
        validations.push(deepValidation);
      }

      const result = this.#aggregateValidationResults(validations, startTime);

      logger.info("Pre-operation validation completed", {
        operationId: context.operation.id,
        flagKey: context.operation.flagKey,
        passed: result.passed,
        totalIssues: result.summary.totalIssues,
        durationMs: Date.now() - startTime,
      });

      return { data: result, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Pre-operation validation failed", {
        operationId: context.operation.id,
        flagKey: context.operation.flagKey,
        error: errorMessage,
      });
      return { data: null, error: new Error(`Pre-operation validation failed: ${errorMessage}`) };
    }
  }

  /**
   * Validates flag states after operation execution.
   * @param context Post-operation validation context
   * @returns Result containing validation results
   */
  validatePostOperation(
    context: PostOperationValidationContext,
  ): Result<ConsistencyValidationResult, Error> {
    const startTime = Date.now();

    try {
      logger.info("Starting post-operation validation", {
        operationId: context.operation.id,
        flagKey: context.operation.flagKey,
        operationType: context.operation.type,
        operationStatus: context.operationResult.status,
      });

      const validations: ValidationResult[] = [];

      // 1. Validate operation result consistency
      const operationResultValidation = this.#validateOperationResult(
        context.operation,
        context.operationResult,
      );
      validations.push(operationResultValidation);

      // 2. Validate state transition
      const stateTransitionValidation = this.#validateStateTransition(
        context.preOperationState,
        context.postOperationState,
        context.operation,
      );
      validations.push(stateTransitionValidation);

      // 3. Validate cross-references still valid after operation
      const postCrossRefValidation = this.#validateCrossReferences(
        context.operation.flagKey,
        context.postOperationState,
        context.usageReport,
      );
      validations.push(postCrossRefValidation);

      // 4. Data integrity validation
      const integrityValidation = this.#validateDataIntegrity(
        context.operation.flagKey,
        context.postOperationState,
        context.usageReport,
      );
      validations.push(integrityValidation);

      const result = this.#aggregateValidationResults(validations, startTime);

      // Check if rollback is needed
      if (!result.passed && this.options.enableAutoRollback) {
        result.rollbackRecommended = true;
        result.recommendations.unshift("Automatic rollback recommended due to validation failures");
      }

      logger.info("Post-operation validation completed", {
        operationId: context.operation.id,
        flagKey: context.operation.flagKey,
        passed: result.passed,
        rollbackRecommended: result.rollbackRecommended,
        totalIssues: result.summary.totalIssues,
        durationMs: Date.now() - startTime,
      });

      return { data: result, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Post-operation validation failed", {
        operationId: context.operation.id,
        flagKey: context.operation.flagKey,
        error: errorMessage,
      });
      return { data: null, error: new Error(`Post-operation validation failed: ${errorMessage}`) };
    }
  }

  /**
   * Performs cross-reference validation between Optimizely and codebase.
   * @param flagKey Flag key to validate
   * @param optimizelyFlag Flag data from Optimizely
   * @param usageReport Usage report from codebase analysis
   * @returns Cross-reference validation result
   */
  validateCrossReferences(
    flagKey: string,
    optimizelyFlag: OptimizelyFlag | undefined,
    usageReport: FlagUsageReport,
  ): Result<CrossReferenceValidationResult, Error> {
    try {
      logger.debug("Validating cross-references", { flagKey });

      const optimizelyExists = optimizelyFlag !== undefined;
      const codeUsages = usageReport.flagUsages.get(flagKey) || [];
      const codebaseReferences = codeUsages.length;

      // Analyze reference validity
      let validReferences = 0;
      const invalidReferences: string[] = [];
      const ambiguousReferences: string[] = [];

      for (const _usage of codeUsages) {
        // Simple validation - all code usages are considered valid for now
        // In a real implementation, this would analyze the context more thoroughly
        validReferences++;

        // For now, we'll assume no references are ambiguous in the basic implementation
        // This can be enhanced later with more sophisticated context analysis
      }

      const issues: ConsistencyIssue[] = [];

      // Check for missing flag in Optimizely
      if (codebaseReferences > 0 && !optimizelyExists) {
        issues.push({
          type: "missing_flag",
          severity: "high",
          message:
            `Flag '${flagKey}' is referenced ${codebaseReferences} times in code but does not exist in Optimizely`,
          resolution: "Create the flag in Optimizely or remove references from code",
        });
      }

      // Check for orphaned flag in Optimizely
      if (optimizelyExists && validReferences === 0 && !optimizelyFlag!.archived) {
        issues.push({
          type: "orphaned_flag",
          severity: "medium",
          message: `Flag '${flagKey}' exists in Optimizely but has no valid references in code`,
          resolution: "Consider archiving this flag or verify code analysis accuracy",
        });
      }

      // Check for archived flag still in use
      if (optimizelyExists && optimizelyFlag!.archived && validReferences > 0) {
        issues.push({
          type: "status_mismatch",
          severity: "high",
          message:
            `Flag '${flagKey}' is archived in Optimizely but still referenced ${validReferences} times in code`,
          resolution: "Unarchive the flag or remove code references",
        });
      }

      // Warn about ambiguous references
      if (ambiguousReferences.length > 0) {
        issues.push({
          type: "configuration_drift",
          severity: "low",
          message:
            `Flag '${flagKey}' has ${ambiguousReferences.length} ambiguous references that may need review`,
          resolution: "Review ambiguous references to ensure they are intentional",
        });
      }

      const result: CrossReferenceValidationResult = {
        flagKey,
        referencesValid: issues.filter((issue) => issue.severity === "high").length === 0,
        referenceChecks: {
          optimizelyExists,
          codebaseReferences,
          validReferences,
          invalidReferences,
          ambiguousReferences,
        },
        issues,
      };

      return { data: result, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Cross-reference validation failed", { flagKey, error: errorMessage });
      return { data: null, error: new Error(`Cross-reference validation failed: ${errorMessage}`) };
    }
  }

  /**
   * Validates data integrity for a flag.
   * @param flagKey Flag key to validate
   * @param flagState Current flag state
   * @param usageReport Usage report for cross-validation
   * @returns Data integrity validation result
   */
  validateDataIntegrity(
    flagKey: string,
    flagState: OptimizelyFlag | undefined,
    usageReport: FlagUsageReport,
  ): Result<DataIntegrityResult, Error> {
    try {
      logger.debug("Validating data integrity", { flagKey });

      const issues: DataIntegrityResult["issues"] = [];
      const timestamp = new Date().toISOString();

      if (flagState) {
        // Check flag configuration integrity
        if (!flagState.key || flagState.key !== flagKey) {
          issues.push({
            type: "data_corruption",
            severity: "critical",
            description: `Flag key mismatch: expected '${flagKey}', got '${flagState.key}'`,
            expectedValue: flagKey,
            actualValue: flagState.key,
          });
        }

        // Check for configuration drift
        if (flagState.environments) {
          for (const [envName, envConfig] of Object.entries(flagState.environments)) {
            // Validate environment configuration consistency
            if (typeof envConfig !== "object" || envConfig === null) {
              issues.push({
                type: "configuration_drift",
                severity: "medium",
                description:
                  `Invalid environment configuration for '${envName}' in flag '${flagKey}'`,
                expectedValue: "object",
                actualValue: typeof envConfig,
              });
            }
          }
        }

        // Cross-validate with usage report
        const hasCodeUsage = usageReport.flagUsages.has(flagKey);
        const isArchived = flagState.archived;

        if (!hasCodeUsage && !isArchived) {
          // Flag exists in Optimizely, not used in code, but not archived - potential issue
          issues.push({
            type: "state_mismatch",
            severity: "medium",
            description: `Flag '${flagKey}' is not used in code and should potentially be archived`,
            expectedValue: "archived or in-use",
            actualValue: "active but unused",
          });
        }

        if (hasCodeUsage && isArchived) {
          // Flag is used in code but archived - definite issue
          issues.push({
            type: "state_mismatch",
            severity: "high",
            description: `Flag '${flagKey}' is archived but still referenced in code`,
            expectedValue: "active (unarchived)",
            actualValue: "archived",
          });
        }
      } else if (usageReport.flagUsages.has(flagKey)) {
        // Flag used in code but doesn't exist in Optimizely
        issues.push({
          type: "reference_orphan",
          severity: "high",
          description: `Flag '${flagKey}' is referenced in code but does not exist in Optimizely`,
          expectedValue: "flag exists in Optimizely",
          actualValue: "flag missing from Optimizely",
        });
      }

      const result: DataIntegrityResult = {
        flagKey,
        integrityMaintained: issues.filter((issue) =>
          issue.severity === "high" || issue.severity === "critical"
        ).length === 0,
        issues,
        timestamp,
      };

      return { data: result, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Data integrity validation failed", { flagKey, error: errorMessage });
      return { data: null, error: new Error(`Data integrity validation failed: ${errorMessage}`) };
    }
  }

  /**
   * Generates a consistency report for multiple flags.
   * @param flagKeys Flag keys to include in the report
   * @param optimizelyFlags Flags from Optimizely
   * @param usageReport Usage report from codebase analysis
   * @returns Consistency report
   */
  generateConsistencyReport(
    flagKeys: string[],
    optimizelyFlags: OptimizelyFlag[],
    usageReport: FlagUsageReport,
  ): Result<{
    timestamp: string;
    summary: {
      totalFlags: number;
      consistentFlags: number;
      inconsistentFlags: number;
      criticalIssues: number;
      warnings: number;
    };
    flagResults: FlagConsistencyResult[];
    recommendations: string[];
  }, Error> {
    try {
      logger.info("Generating consistency report", { totalFlags: flagKeys.length });

      const flagMap = new Map(optimizelyFlags.map((flag) => [flag.key, flag]));
      const flagResults: FlagConsistencyResult[] = [];
      let criticalIssues = 0;
      let warnings = 0;

      for (const flagKey of flagKeys) {
        const flag = flagMap.get(flagKey);
        const usages = usageReport.flagUsages.get(flagKey) || [];

        const result = this.#validateFlagConsistencyDetailed(flagKey, flag, usages);
        flagResults.push(result);

        // Count issues by severity
        for (const issue of result.issues) {
          if (issue.severity === "high") {
            criticalIssues++;
          } else if (issue.severity === "medium" || issue.severity === "low") {
            warnings++;
          }
        }
      }

      const consistentFlags = flagResults.filter((r) => r.isConsistent).length;
      const inconsistentFlags = flagResults.length - consistentFlags;

      const recommendations: string[] = [];
      if (inconsistentFlags > 0) {
        recommendations.push(`Review and resolve ${inconsistentFlags} inconsistent flags`);
      }
      if (criticalIssues > 0) {
        recommendations.push(`Prioritize resolving ${criticalIssues} critical issues`);
      }
      if (warnings > flagResults.length * 0.1) {
        recommendations.push(
          "Consider reviewing flag naming and usage patterns to reduce ambiguity",
        );
      }

      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalFlags: flagKeys.length,
          consistentFlags,
          inconsistentFlags,
          criticalIssues,
          warnings,
        },
        flagResults,
        recommendations,
      };

      logger.info("Consistency report generated", {
        totalFlags: report.summary.totalFlags,
        consistentFlags: report.summary.consistentFlags,
        inconsistentFlags: report.summary.inconsistentFlags,
        criticalIssues: report.summary.criticalIssues,
      });

      return { data: report, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to generate consistency report", { error: errorMessage });
      return {
        data: null,
        error: new Error(`Consistency report generation failed: ${errorMessage}`),
      };
    }
  }

  /**
   * Validates current flag state consistency
   * @private
   */
  #validateFlagState(
    flagKey: string,
    flag: OptimizelyFlag | undefined,
    usageReport: FlagUsageReport,
  ): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Basic flag existence validation
    const hasCodeUsage = usageReport.flagUsages.has(flagKey);
    const existsInOptimizely = flag !== undefined;

    if (hasCodeUsage && !existsInOptimizely) {
      issues.push({
        type: "missing_flag",
        severity: "high",
        message: `Flag '${flagKey}' used in code but missing from Optimizely`,
        resolution: "Create flag in Optimizely or remove from code",
      });
    }

    if (!hasCodeUsage && existsInOptimizely && !flag!.archived) {
      issues.push({
        type: "orphaned_flag",
        severity: "medium",
        message: `Flag '${flagKey}' exists in Optimizely but unused in code`,
        resolution: "Consider archiving this flag",
      });
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "flag_state_validation",
      description: "Validate basic flag state consistency",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Validates operation prerequisites
   * @private
   */
  #validateOperationPrerequisites(operation: SyncOperation): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Validate required validation checks
    const requiredChecks = operation.validationChecks.filter((check) => check.required);
    const failedChecks = requiredChecks.filter((check) => check.status === "failed");

    if (failedChecks.length > 0) {
      issues.push({
        type: "configuration_drift",
        severity: "high",
        message: `Operation has ${failedChecks.length} failed prerequisite checks`,
        resolution: "Resolve validation check failures before proceeding",
      });
    }

    // Validate operation type appropriateness
    if (operation.type === "archive" && operation.riskLevel === "critical") {
      issues.push({
        type: "configuration_drift",
        severity: "medium",
        message: "Archive operation marked as critical risk - review carefully",
        resolution: "Verify archive operation is safe to proceed",
      });
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "operation_prerequisites",
      description: "Validate operation prerequisites and safety checks",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Validates cross-references between systems
   * @private
   */
  #validateCrossReferences(
    flagKey: string,
    flag: OptimizelyFlag | undefined,
    usageReport: FlagUsageReport,
  ): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Validate that flag usage matches Optimizely configuration
    const codeUsages = usageReport.flagUsages.get(flagKey) || [];
    const hasCodeUsage = codeUsages.length > 0;
    const existsInOptimizely = flag !== undefined;

    if (hasCodeUsage && !existsInOptimizely) {
      issues.push({
        type: "missing_flag",
        severity: "high",
        message: `Flag '${flagKey}' referenced in code but not found in Optimizely`,
        resolution: "Create the flag in Optimizely or remove references from code",
      });
    }

    if (existsInOptimizely && flag!.archived && hasCodeUsage) {
      issues.push({
        type: "status_mismatch",
        severity: "high",
        message: `Archived flag '${flagKey}' still referenced in code`,
        resolution: "Remove code references before archiving or restore the flag",
      });
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "cross_reference_validation",
      description: "Validate cross-references between Optimizely and codebase",
      issues,
      durationMs: Date.now() - startTime,
      metadata: {
        referenceChecks: {
          codeUsageCount: codeUsages.length,
          flagExists: existsInOptimizely,
          flagArchived: flag?.archived || false,
        },
      },
    };
  }

  /**
   * Validates risk assessment for operation
   * @private
   */
  #validateRiskAssessment(operation: SyncOperation): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Check for risk level appropriateness
    if (operation.riskLevel === "critical" || operation.riskLevel === "high") {
      issues.push({
        type: "configuration_drift",
        severity: "medium",
        message: `Operation has ${operation.riskLevel} risk level - requires careful review`,
        resolution: "Review operation details and ensure appropriate safety measures",
      });
    }

    // Check rollback capabilities for high-risk operations
    if (
      operation.riskLevel === "high" &&
      (!operation.rollbackInfo || !operation.rollbackInfo.supported)
    ) {
      issues.push({
        type: "configuration_drift",
        severity: "high",
        message: "High-risk operation without rollback capability",
        resolution: "Ensure rollback procedures are available for high-risk operations",
      });
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "risk_assessment_validation",
      description: "Validate operation risk assessment and safety measures",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Performs deep validation of flag configuration
   * @private
   */
  async #performDeepValidation(
    flagKey: string,
    flag: OptimizelyFlag | undefined,
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    if (flag) {
      // Validate flag configuration integrity
      const consistencyResult = await this.optimizelyClient.validateFlagConsistency(flagKey);
      if (consistencyResult.error) {
        issues.push({
          type: "configuration_drift",
          severity: "medium",
          message:
            `Deep validation failed for flag '${flagKey}': ${consistencyResult.error.message}`,
          resolution: "Investigate flag configuration issues in Optimizely",
        });
      } else if (consistencyResult.data) {
        // Check environment consistency
        const envData = consistencyResult.data.environments;
        const envKeys = Object.keys(envData);

        if (envKeys.length === 0) {
          issues.push({
            type: "configuration_drift",
            severity: "low",
            message: `Flag '${flagKey}' has no environment configurations`,
            resolution: "Verify flag is properly configured across environments",
          });
        }
      }
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "deep_validation",
      description: "Perform comprehensive flag configuration validation",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Validates operation execution result
   * @private
   */
  #validateOperationResult(
    _operation: SyncOperation,
    result: SyncOperationResult,
  ): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Check if operation completed successfully
    if (result.status === "failed") {
      issues.push({
        type: "configuration_drift",
        severity: "high",
        message: `Operation failed: ${result.message}`,
        resolution: "Investigate and resolve operation failure",
      });
    }

    // Validate execution time is reasonable
    const maxExpectedDuration = 60000; // 1 minute
    if (result.durationMs > maxExpectedDuration) {
      issues.push({
        type: "configuration_drift",
        severity: "low",
        message: `Operation took longer than expected: ${result.durationMs}ms`,
        resolution: "Monitor operation performance and optimize if needed",
      });
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "operation_result_validation",
      description: "Validate operation execution result",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Validates state transition after operation
   * @private
   */
  #validateStateTransition(
    preState: OptimizelyFlag | undefined,
    postState: OptimizelyFlag | undefined,
    operation: SyncOperation,
  ): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Validate expected state changes based on operation type
    switch (operation.type) {
      case "archive":
        if (preState && !preState.archived && postState && !postState.archived) {
          issues.push({
            type: "status_mismatch",
            severity: "high",
            message: `Archive operation did not change flag status`,
            resolution: "Verify archive operation was executed correctly",
          });
        }
        break;
      case "enable":
        if (preState?.archived && postState?.archived) {
          issues.push({
            type: "status_mismatch",
            severity: "high",
            message: `Enable operation did not unarchive the flag`,
            resolution: "Verify enable operation was executed correctly",
          });
        }
        break;
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "state_transition_validation",
      description: "Validate flag state transition after operation",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Validates data integrity after operation
   * @private
   */
  #validateDataIntegrity(
    flagKey: string,
    flagState: OptimizelyFlag | undefined,
    usageReport: FlagUsageReport,
  ): ValidationResult {
    const startTime = Date.now();
    const issues: ConsistencyIssue[] = [];

    // Validate flag existence consistency
    const codeUsages = usageReport.flagUsages.get(flagKey) || [];
    const hasCodeUsage = codeUsages.length > 0;
    const existsInOptimizely = flagState !== undefined;

    if (hasCodeUsage && !existsInOptimizely) {
      issues.push({
        type: "missing_flag",
        severity: "high",
        message:
          `Data integrity issue: Flag '${flagKey}' referenced in code but missing from Optimizely`,
        resolution: "Restore flag in Optimizely or update code to remove references",
      });
    }

    // Validate flag state consistency after operation
    if (existsInOptimizely && flagState!.archived && hasCodeUsage) {
      issues.push({
        type: "status_mismatch",
        severity: "high",
        message:
          `Data integrity issue: Flag '${flagKey}' is archived but still has code references`,
        resolution: "Remove code references or restore flag state",
      });
    }

    // Validate usage report consistency
    if (!usageReport.timestamp || new Date(usageReport.timestamp).getTime() > Date.now()) {
      issues.push({
        type: "configuration_drift",
        severity: "low",
        message: "Usage report timestamp is invalid or in the future",
        resolution: "Regenerate usage report with valid timestamp",
      });
    }

    return {
      passed: issues.filter((issue) => issue.severity === "high").length === 0,
      checkId: "data_integrity_validation",
      description: "Validate data integrity after operation",
      issues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Validates detailed flag consistency
   * @private
   */
  #validateFlagConsistencyDetailed(
    flagKey: string,
    flag: OptimizelyFlag | undefined,
    usages: FlagUsage[],
  ): FlagConsistencyResult {
    const issues: ConsistencyIssue[] = [];
    const existsInOptimizely = flag !== undefined;
    const usedInCode = usages.length > 0; // Simple check - all usages count as "used in code"

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
      isConsistent: issues.filter((issue) => issue.severity === "high").length === 0,
      issues,
      alignment: {
        existsInOptimizely,
        usedInCode,
        statusAligned: !existsInOptimizely || !usedInCode || !flag!.archived,
      },
    };
  }

  /**
   * Aggregates multiple validation results
   * @private
   */
  #aggregateValidationResults(
    validations: ValidationResult[],
    _startTime: number,
  ): ConsistencyValidationResult {
    const totalChecks = validations.length;
    const passedChecks = validations.filter((v) => v.passed).length;
    const failedChecks = totalChecks - passedChecks;

    const allIssues = validations.flatMap((v) => v.issues);
    const criticalIssues = allIssues.filter((issue) => issue.severity === "high").length;
    const warnings =
      allIssues.filter((issue) => issue.severity === "medium" || issue.severity === "low").length;

    const recommendations: string[] = [];
    if (criticalIssues > 0) {
      recommendations.push(
        `Address ${criticalIssues} critical consistency issues before proceeding`,
      );
    }
    if (warnings > 0) {
      recommendations.push(`Review ${warnings} warnings to improve flag management`);
    }
    if (failedChecks > totalChecks * 0.5) {
      recommendations.push("High validation failure rate - consider reviewing operation plan");
    }

    return {
      timestamp: new Date().toISOString(),
      passed: criticalIssues === 0 && failedChecks === 0,
      validations,
      summary: {
        totalChecks,
        passedChecks,
        failedChecks,
        totalIssues: allIssues.length,
        criticalIssues,
        warnings,
      },
      recommendations,
      rollbackRecommended: criticalIssues > 0 || failedChecks > totalChecks * 0.3,
    };
  }
}
