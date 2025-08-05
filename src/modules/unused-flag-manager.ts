import { OptimizelyApiClient } from "./optimizely-client.ts";
import { AuditEventType, AuditReporter, OperationContext, UserContext } from "./audit-reporter.ts";
import { FlagUsageReporter } from "./flag-usage-reporter.ts";
import { ComplianceReporter } from "./compliance-reporter.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";
import { FlagUsage } from "./code-analysis.ts";
import * as logger from "../utils/logger.ts";

/**
 * Represents a detailed unused flag identification report.
 */
export interface UnusedFlagReport {
  timestamp: string;
  executionId: string;
  totalFlags: number;
  unusedFlags: UnusedFlagDetails[];
  recommendations: string[];
  archivingPlan: ArchivingPlan;
  validationResults: ValidationResult[];
}

/**
 * Details about an unused flag including metadata and recommendations.
 */
export interface UnusedFlagDetails {
  key: string;
  name?: string;
  description?: string;
  lastModified?: string;
  environments: string[];
  archived: boolean;
  recommendedAction: "archive" | "keep" | "review";
  reason: string;
  riskLevel: "low" | "medium" | "high";
  metadata?: Record<string, unknown>;
}

/**
 * Represents a plan for archiving unused flags with safety checks.
 */
export interface ArchivingPlan {
  timestamp: string;
  flagsToArchive: string[];
  flagsToReview: string[];
  safetyChecks: SafetyCheck[];
  estimatedImpact: {
    flagsArchived: number;
    environmentsAffected: string[];
    riskAssessment: string;
  };
}

/**
 * Safety check for flag archiving operations.
 */
export interface SafetyCheck {
  flagKey: string;
  checkType: "environment" | "dependency" | "usage" | "metadata";
  status: "pass" | "warning" | "fail";
  message: string;
  blockingIssue: boolean;
}

/**
 * Result of flag validation checks before archiving.
 */
export interface ValidationResult {
  flagKey: string;
  isValid: boolean;
  issues: string[];
  recommendations: string[];
}

/**
 * Configuration for unused flag management operations.
 */
export interface UnusedFlagManagerConfig {
  dryRun: boolean;
  safetyChecksEnabled: boolean;
  maxArchivedPerExecution: number;
  excludePatterns: string[];
  requireManualApproval: boolean;
  environmentValidation: boolean;
}

/**
 * Manages identification, validation, and archiving of unused flags with comprehensive audit logging.
 */
export class UnusedFlagManager {
  private readonly optimizelyClient: OptimizelyApiClient;
  private readonly auditReporter: AuditReporter;
  private readonly flagUsageReporter: FlagUsageReporter;
  private readonly complianceReporter: ComplianceReporter;
  private readonly config: UnusedFlagManagerConfig;

  constructor(
    optimizelyClient: OptimizelyApiClient,
    auditReporter: AuditReporter,
    config: Partial<UnusedFlagManagerConfig> = {},
  ) {
    this.optimizelyClient = optimizelyClient;
    this.auditReporter = auditReporter;
    this.flagUsageReporter = new FlagUsageReporter();
    this.complianceReporter = new ComplianceReporter(auditReporter);
    this.config = {
      dryRun: true,
      safetyChecksEnabled: true,
      maxArchivedPerExecution: 10,
      excludePatterns: [],
      requireManualApproval: false,
      environmentValidation: true,
      ...config,
    };
  }

  /**
   * Generates a comprehensive unused flag identification report.
   * @param flagKeys All flag keys from Optimizely
   * @param flagUsages Map of flag usages found in codebase
   * @param optimizelyFlags Detailed flag information from Optimizely
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns Detailed unused flag report
   */
  generateUnusedFlagReport(
    flagKeys: string[],
    flagUsages: Map<string, FlagUsage[]>,
    optimizelyFlags: Map<string, OptimizelyFlag>,
    userContext: UserContext,
    operationContext: OperationContext,
  ): UnusedFlagReport {
    const timestamp = new Date().toISOString();
    const executionId = operationContext.operationId;

    logger.info("Generating unused flag identification report", {
      totalFlags: flagKeys.length,
      executionId,
    });

    // Log operation start
    this.auditReporter.logFlagOperation(
      "all_flags",
      "info",
      userContext,
      operationContext,
      undefined,
      { action: "unused_flag_analysis_started", flagCount: flagKeys.length },
    );

    // Generate usage report
    const usageReport = this.flagUsageReporter.generateUsageReport(flagKeys, flagUsages);

    // Analyze unused flags in detail
    const unusedFlags: UnusedFlagDetails[] = [];
    for (const flagKey of usageReport.unusedFlagKeys) {
      const flagData = optimizelyFlags.get(flagKey);
      const details = this.analyzeUnusedFlag(
        flagKey,
        flagData,
        userContext,
        operationContext,
      );
      unusedFlags.push(details);

      // Log each unused flag for audit trail
      this.auditReporter.logFlagOperation(
        flagKey,
        "flag_unused",
        userContext,
        operationContext,
        flagData,
        {
          recommendedAction: details.recommendedAction,
          reason: details.reason,
          riskLevel: details.riskLevel,
        },
      );
    }

    // Create archiving plan
    const archivingPlan = this.createArchivingPlan(
      unusedFlags,
      userContext,
      operationContext,
    );

    // Perform validation checks
    const validationResults = this.performValidationChecks(
      archivingPlan.flagsToArchive,
      optimizelyFlags,
      userContext,
      operationContext,
    );

    // Generate recommendations
    const recommendations = this.generateArchivingRecommendations(unusedFlags, validationResults);

    const report: UnusedFlagReport = {
      timestamp,
      executionId,
      totalFlags: flagKeys.length,
      unusedFlags,
      recommendations,
      archivingPlan,
      validationResults,
    };

    // Log completion
    this.auditReporter.logFlagOperation(
      "all_flags",
      "info",
      userContext,
      operationContext,
      undefined,
      {
        action: "unused_flag_analysis_completed",
        unusedFlagsFound: unusedFlags.length,
        flagsReadyForArchival: archivingPlan.flagsToArchive.length,
        flagsNeedingReview: archivingPlan.flagsToReview.length,
      },
    );

    logger.info("Unused flag report generated", {
      unusedFlags: unusedFlags.length,
      flagsToArchive: archivingPlan.flagsToArchive.length,
      flagsToReview: archivingPlan.flagsToReview.length,
    });

    return report;
  }

  /**
   * Implements flag archiving recommendations with comprehensive validation.
   * @param unusedFlagReport Report containing unused flags and archiving plan
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns Results of archiving operations
   */
  async implementArchivingRecommendations(
    unusedFlagReport: UnusedFlagReport,
    userContext: UserContext,
    operationContext: OperationContext,
  ): Promise<{
    archivedFlags: string[];
    failedArchives: Array<{ flag: string; error: string }>;
    skippedFlags: Array<{ flag: string; reason: string }>;
  }> {
    const archivedFlags: string[] = [];
    const failedArchives: Array<{ flag: string; error: string }> = [];
    const skippedFlags: Array<{ flag: string; reason: string }> = [];

    logger.info("Implementing flag archiving recommendations", {
      flagsToArchive: unusedFlagReport.archivingPlan.flagsToArchive.length,
      dryRun: this.config.dryRun,
    });

    // Log archiving operation start
    this.auditReporter.logFlagOperation(
      "archiving_batch",
      "info",
      userContext,
      operationContext,
      undefined,
      {
        action: "batch_archiving_started",
        flagsToArchive: unusedFlagReport.archivingPlan.flagsToArchive.length,
        dryRun: this.config.dryRun,
      },
    );

    // Check validation results for blocking issues
    const blockingIssues = unusedFlagReport.validationResults.filter((v) => !v.isValid);
    if (blockingIssues.length > 0) {
      logger.warn("Blocking validation issues found", { blockingIssues: blockingIssues.length });

      for (const issue of blockingIssues) {
        skippedFlags.push({
          flag: issue.flagKey,
          reason: `Validation failed: ${issue.issues.join(", ")}`,
        });

        this.auditReporter.logFlagOperation(
          issue.flagKey,
          "warning",
          userContext,
          operationContext,
          undefined,
          {
            action: "archiving_skipped",
            reason: "validation_failed",
            issues: issue.issues,
          },
        );
      }
    }

    // Process flags for archiving
    for (const flagKey of unusedFlagReport.archivingPlan.flagsToArchive) {
      // Skip if validation failed
      if (blockingIssues.some((issue) => issue.flagKey === flagKey)) {
        continue;
      }

      try {
        // Perform final safety checks
        const safetyChecksPassed = this.performSafetyChecks(
          flagKey,
          userContext,
          operationContext,
        );

        if (!safetyChecksPassed) {
          skippedFlags.push({
            flag: flagKey,
            reason: "Failed safety checks",
          });

          this.auditReporter.logFlagOperation(
            flagKey,
            "warning",
            userContext,
            operationContext,
            undefined,
            {
              action: "archiving_skipped",
              reason: "safety_checks_failed",
            },
          );
          continue;
        }

        if (this.config.dryRun) {
          // Simulate archiving in dry-run mode
          logger.info(`DRY RUN: Would archive flag ${flagKey}`);

          this.auditReporter.logFlagOperation(
            flagKey,
            "info",
            userContext,
            operationContext,
            undefined,
            {
              action: "dry_run_archive_simulation",
              message: "Flag would be archived in real execution",
            },
          );

          archivedFlags.push(flagKey);
        } else {
          // Perform actual archiving
          const result = await this.optimizelyClient.archiveFeatureFlag(flagKey);

          if (result.error) {
            failedArchives.push({
              flag: flagKey,
              error: result.error.message,
            });

            this.auditReporter.logFlagOperation(
              flagKey,
              "error",
              userContext,
              operationContext,
              undefined,
              {
                action: "archiving_failed",
                error: result.error.message,
              },
            );
          } else {
            archivedFlags.push(flagKey);

            this.auditReporter.logFlagOperation(
              flagKey,
              "flag_archived",
              userContext,
              operationContext,
              undefined,
              {
                action: "archiving_completed",
                timestamp: new Date().toISOString(),
              },
            );
          }
        }

        // Add delay between archiving operations to respect rate limits (skip in dry-run)
        if (!this.config.dryRun) {
          await this.delay(200); // 200ms delay
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failedArchives.push({
          flag: flagKey,
          error: errorMessage,
        });

        this.auditReporter.logFlagOperation(
          flagKey,
          "error",
          userContext,
          operationContext,
          undefined,
          {
            action: "archiving_error",
            error: errorMessage,
          },
        );
      }
    }

    // Log operation completion
    this.auditReporter.logFlagOperation(
      "archiving_batch",
      "info",
      userContext,
      operationContext,
      undefined,
      {
        action: "batch_archiving_completed",
        archivedFlags: archivedFlags.length,
        failedArchives: failedArchives.length,
        skippedFlags: skippedFlags.length,
        dryRun: this.config.dryRun,
      },
    );

    logger.info("Flag archiving implementation completed", {
      archived: archivedFlags.length,
      failed: failedArchives.length,
      skipped: skippedFlags.length,
    });

    return {
      archivedFlags,
      failedArchives,
      skippedFlags,
    };
  }

  /**
   * Creates detailed audit logs for all flag operations with timestamp and context tracking.
   * @param flagKey Flag key
   * @param operation Operation type
   * @param userContext User context
   * @param operationContext Operation context
   * @param decision Decision made about the flag
   * @param additionalContext Additional context information
   */
  createDetailedAuditLog(
    flagKey: string,
    operation: AuditEventType,
    userContext: UserContext,
    operationContext: OperationContext,
    decision: string,
    additionalContext: Record<string, unknown> = {},
  ): void {
    const timestamp = new Date().toISOString();

    this.auditReporter.logFlagOperation(
      flagKey,
      operation,
      userContext,
      operationContext,
      undefined,
      {
        ...additionalContext,
        decision,
        timestamp,
        decisionContext: {
          dryRun: this.config.dryRun,
          safetyChecksEnabled: this.config.safetyChecksEnabled,
          maxArchivedPerExecution: this.config.maxArchivedPerExecution,
        },
      },
    );
  }

  /**
   * Implements safe archiving validation checks before performing archiving operations.
   * @param flagKeys Flag keys to validate
   * @param optimizelyFlags Flag data from Optimizely
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns Array of validation results
   */
  implementSafeArchivingValidation(
    flagKeys: string[],
    optimizelyFlags: Map<string, OptimizelyFlag>,
    userContext: UserContext,
    operationContext: OperationContext,
  ): ValidationResult[] {
    logger.info("Performing safe archiving validation checks", {
      flagCount: flagKeys.length,
    });

    const validationResults: ValidationResult[] = [];

    for (const flagKey of flagKeys) {
      const flagData = optimizelyFlags.get(flagKey);
      const issues: string[] = [];
      const recommendations: string[] = [];

      // Validate flag exists
      if (!flagData) {
        issues.push("Flag not found in Optimizely");
        this.createDetailedAuditLog(
          flagKey,
          "warning",
          userContext,
          operationContext,
          "validation_failed",
          { reason: "flag_not_found_in_optimizely" },
        );
      } else {
        // Check if already archived
        if (flagData.archived) {
          issues.push("Flag is already archived");
          this.createDetailedAuditLog(
            flagKey,
            "info",
            userContext,
            operationContext,
            "validation_skipped",
            { reason: "already_archived" },
          );
        }

        // Check environment configurations
        if (this.config.environmentValidation && flagData.environments) {
          for (const [envKey, envData] of Object.entries(flagData.environments)) {
            if (envData.enabled) {
              issues.push(`Flag is enabled in ${envKey} environment`);
              recommendations.push(`Disable flag in ${envKey} before archiving`);
            }
          }
        }

        // Check for recent modifications
        if (flagData.updated_time) {
          const lastUpdate = new Date(flagData.updated_time);
          const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

          if (daysSinceUpdate < 7) {
            issues.push("Flag was modified recently (less than 7 days ago)");
            recommendations.push(
              "Consider waiting longer before archiving recently modified flags",
            );
          }
        }
      }

      const isValid = issues.length === 0;

      validationResults.push({
        flagKey,
        isValid,
        issues,
        recommendations,
      });

      // Log validation result
      this.createDetailedAuditLog(
        flagKey,
        isValid ? "info" : "warning",
        userContext,
        operationContext,
        isValid ? "validation_passed" : "validation_failed",
        {
          issues,
          recommendations,
          validationChecks: {
            flagExists: !!flagData,
            alreadyArchived: flagData?.archived || false,
            environmentValidation: this.config.environmentValidation,
            recentlyModified: flagData?.updated_time
              ? this.isRecentlyModified(flagData.updated_time)
              : false,
          },
        },
      );
    }

    logger.info("Safe archiving validation completed", {
      totalFlags: flagKeys.length,
      validFlags: validationResults.filter((r) => r.isValid).length,
      invalidFlags: validationResults.filter((r) => !r.isValid).length,
    });

    return validationResults;
  }

  /**
   * Analyzes an unused flag to determine recommended action and risk level.
   * @param flagKey Flag key
   * @param flagData Flag data from Optimizely
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns Detailed analysis of the unused flag
   */
  private analyzeUnusedFlag(
    flagKey: string,
    flagData: OptimizelyFlag | undefined,
    userContext: UserContext,
    operationContext: OperationContext,
  ): UnusedFlagDetails {
    let recommendedAction: "archive" | "keep" | "review" = "archive";
    let reason = "Flag not found in codebase";
    let riskLevel: "low" | "medium" | "high" = "low";
    const reasons: string[] = [];

    if (!flagData) {
      recommendedAction = "review";
      reason = "Flag data not available from Optimizely";
      riskLevel = "medium";
    } else {
      // Check if already archived
      if (flagData.archived) {
        recommendedAction = "keep";
        reason = "Flag is already archived";
        riskLevel = "low";
      } // Check exclusion patterns first
      else if (this.matchesExclusionPattern(flagKey)) {
        recommendedAction = "keep";
        reason = "Flag matches exclusion pattern";
        riskLevel = "low";
      } else {
        // Check multiple risk factors and use the highest risk level
        let maxRiskLevel: "low" | "medium" | "high" = "low";

        // Check if enabled in any environment (highest risk)
        if (this.isEnabledInAnyEnvironment(flagData)) {
          reasons.push("enabled in one or more environments");
          maxRiskLevel = "high";
          recommendedAction = "review";
        }

        // Check for recent activity (medium risk)
        if (flagData.updated_time && this.isRecentlyModified(flagData.updated_time)) {
          reasons.push("recently modified");
          if (maxRiskLevel === "low") {
            maxRiskLevel = "medium";
            recommendedAction = "review";
          }
        }

        // Set final values
        riskLevel = maxRiskLevel;
        if (reasons.length > 0) {
          reason = `Flag is ${reasons.join(" and ")}`;
        }
      }
    }

    const details: UnusedFlagDetails = {
      key: flagKey,
      name: flagData?.name,
      description: flagData?.description,
      lastModified: flagData?.updated_time,
      environments: flagData?.environments ? Object.keys(flagData.environments) : [],
      archived: flagData?.archived || false,
      recommendedAction,
      reason,
      riskLevel,
      metadata: {
        optimizelyId: flagData?.id,
        revision: flagData?.revision,
        createdTime: flagData?.created_time,
      },
    };

    // Log analysis result
    this.createDetailedAuditLog(
      flagKey,
      "info",
      userContext,
      operationContext,
      "unused_flag_analyzed",
      {
        recommendedAction,
        reason,
        riskLevel,
        analysis: details,
      },
    );

    return details;
  }

  /**
   * Creates an archiving plan based on unused flag analysis.
   * @param unusedFlags Array of unused flag details
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns Archiving plan with safety checks
   */
  private createArchivingPlan(
    unusedFlags: UnusedFlagDetails[],
    userContext: UserContext,
    operationContext: OperationContext,
  ): ArchivingPlan {
    const flagsToArchive: string[] = [];
    const flagsToReview: string[] = [];
    const safetyChecks: SafetyCheck[] = [];

    for (const flag of unusedFlags) {
      if (flag.recommendedAction === "archive" && flag.riskLevel === "low") {
        if (flagsToArchive.length < this.config.maxArchivedPerExecution) {
          flagsToArchive.push(flag.key);
        } else {
          flagsToReview.push(flag.key);
        }
      } else {
        flagsToReview.push(flag.key);
      }

      // Create safety checks
      const check: SafetyCheck = {
        flagKey: flag.key,
        checkType: "usage",
        status: flag.recommendedAction === "archive" ? "pass" : "warning",
        message: flag.reason,
        blockingIssue: flag.riskLevel === "high",
      };
      safetyChecks.push(check);
    }

    const environmentsAffected = Array.from(
      new Set(unusedFlags.flatMap((f) => f.environments)),
    );

    const plan: ArchivingPlan = {
      timestamp: new Date().toISOString(),
      flagsToArchive,
      flagsToReview,
      safetyChecks,
      estimatedImpact: {
        flagsArchived: flagsToArchive.length,
        environmentsAffected,
        riskAssessment: this.assessOverallRisk(unusedFlags),
      },
    };

    // Log plan creation
    this.auditReporter.logFlagOperation(
      "archiving_plan",
      "info",
      userContext,
      operationContext,
      undefined,
      {
        action: "archiving_plan_created",
        plan,
        analysisResults: {
          totalUnusedFlags: unusedFlags.length,
          flagsToArchive: flagsToArchive.length,
          flagsToReview: flagsToReview.length,
          highRiskFlags: unusedFlags.filter((f) => f.riskLevel === "high").length,
        },
      },
    );

    return plan;
  }

  /**
   * Performs validation checks for flags before archiving.
   * @param flagKeys Flag keys to validate
   * @param optimizelyFlags Flag data from Optimizely
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns Array of validation results
   */
  private performValidationChecks(
    flagKeys: string[],
    optimizelyFlags: Map<string, OptimizelyFlag>,
    userContext: UserContext,
    operationContext: OperationContext,
  ): ValidationResult[] {
    return this.implementSafeArchivingValidation(
      flagKeys,
      optimizelyFlags,
      userContext,
      operationContext,
    );
  }

  /**
   * Generates actionable recommendations for flag archiving.
   * @param unusedFlags Array of unused flag details
   * @param validationResults Validation results
   * @returns Array of recommendations
   */
  private generateArchivingRecommendations(
    unusedFlags: UnusedFlagDetails[],
    validationResults: ValidationResult[],
  ): string[] {
    const recommendations: string[] = [];

    const archiveableFlags = unusedFlags.filter((f) => f.recommendedAction === "archive").length;
    const reviewFlags = unusedFlags.filter((f) => f.recommendedAction === "review").length;
    const highRiskFlags = unusedFlags.filter((f) => f.riskLevel === "high").length;

    if (archiveableFlags > 0) {
      recommendations.push(
        `Consider archiving ${archiveableFlags} low-risk unused flags to reduce technical debt.`,
      );
    }

    if (reviewFlags > 0) {
      recommendations.push(
        `${reviewFlags} flags require manual review before archiving due to potential risks or recent activity.`,
      );
    }

    if (highRiskFlags > 0) {
      recommendations.push(
        `${highRiskFlags} flags are high-risk and should be carefully reviewed before any archiving action.`,
      );
    }

    const failedValidations = validationResults.filter((v) => !v.isValid).length;
    if (failedValidations > 0) {
      recommendations.push(
        `${failedValidations} flags failed validation checks and cannot be archived automatically.`,
      );
    }

    if (unusedFlags.length > this.config.maxArchivedPerExecution) {
      recommendations.push(
        `Consider increasing maxArchivedPerExecution limit or running multiple cleanup sessions to handle all ${unusedFlags.length} unused flags.`,
      );
    }

    return recommendations;
  }

  /**
   * Performs additional safety checks before archiving a flag.
   * @param flagKey Flag key to check
   * @param userContext User context for audit logging
   * @param operationContext Operation context for audit logging
   * @returns True if safety checks pass
   */
  private performSafetyChecks(
    flagKey: string,
    userContext: UserContext,
    operationContext: OperationContext,
  ): boolean {
    if (!this.config.safetyChecksEnabled) {
      return true;
    }

    // Add any additional safety checks here
    // For now, return true as basic validation is handled elsewhere

    this.createDetailedAuditLog(
      flagKey,
      "info",
      userContext,
      operationContext,
      "safety_checks_completed",
      { result: "passed" },
    );

    return true;
  }

  /**
   * Utility method to check if a flag was recently modified.
   * @param updatedTime Last updated timestamp
   * @returns True if modified within last 7 days
   */
  private isRecentlyModified(updatedTime: string): boolean {
    const lastUpdate = new Date(updatedTime);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate < 7;
  }

  /**
   * Utility method to check if a flag is enabled in any environment.
   * @param flagData Flag data from Optimizely
   * @returns True if enabled in any environment
   */
  private isEnabledInAnyEnvironment(flagData: OptimizelyFlag): boolean {
    if (!flagData.environments) return false;

    return Object.values(flagData.environments).some((env) => env.enabled);
  }

  /**
   * Utility method to check if a flag key matches exclusion patterns.
   * @param flagKey Flag key to check
   * @returns True if matches exclusion pattern
   */
  private matchesExclusionPattern(flagKey: string): boolean {
    return this.config.excludePatterns.some((pattern) => {
      const regex = new RegExp(pattern);
      return regex.test(flagKey);
    });
  }

  /**
   * Assesses overall risk level for a set of unused flags.
   * @param unusedFlags Array of unused flag details
   * @returns Risk assessment string
   */
  private assessOverallRisk(unusedFlags: UnusedFlagDetails[]): string {
    const highRiskCount = unusedFlags.filter((f) => f.riskLevel === "high").length;
    const mediumRiskCount = unusedFlags.filter((f) => f.riskLevel === "medium").length;
    const lowRiskCount = unusedFlags.filter((f) => f.riskLevel === "low").length;

    if (highRiskCount > 0) {
      return `HIGH - ${highRiskCount} high-risk flags require careful review`;
    } else if (mediumRiskCount > lowRiskCount) {
      return `MEDIUM - Majority of flags require manual review`;
    } else {
      return `LOW - Most flags can be safely archived`;
    }
  }

  /**
   * Utility method to add delay between operations.
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
