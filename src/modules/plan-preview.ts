/**
 * Plan preview and confirmation workflow module.
 * Provides user interfaces for reviewing and confirming execution plans before running them.
 */

import { CleanupPlan, RiskLevel } from "../types/sync.ts";
import * as logger from "../utils/logger.ts";
import { Result } from "../utils/try-catch.ts";

/**
 * Plan preview configuration options
 */
export interface PlanPreviewOptions {
  /** Whether to show detailed operation information */
  showDetails: boolean;
  /** Whether to include risk analysis in preview */
  includeRiskAnalysis: boolean;
  /** Whether to show rollback information */
  showRollbackInfo: boolean;
  /** Format for the preview output */
  format: "console" | "markdown" | "json";
}

/**
 * Confirmation workflow configuration
 */
export interface ConfirmationWorkflowOptions {
  /** Whether confirmation is required */
  requireConfirmation: boolean;
  /** Timeout for confirmation in milliseconds */
  confirmationTimeoutMs: number;
  /** Whether to allow interactive confirmation */
  allowInteractive: boolean;
  /** Risk levels that require explicit confirmation */
  explicitConfirmationRisks: RiskLevel[];
}

/**
 * Plan preview result
 */
export interface PlanPreviewResult {
  /** Preview content */
  content: string;
  /** Preview metadata */
  metadata: {
    /** Number of operations */
    totalOperations: number;
    /** Estimated duration */
    estimatedDurationMs: number;
    /** Overall risk level */
    overallRisk: RiskLevel;
    /** High-risk operations count */
    highRiskOperations: number;
  };
  /** Whether the plan is safe to execute */
  isSafeToExecute: boolean;
  /** Warnings to display */
  warnings: string[];
}

/**
 * Confirmation result
 */
export interface ConfirmationResult {
  /** Whether the plan was confirmed */
  confirmed: boolean;
  /** Confirmation method used */
  method: "automatic" | "interactive" | "timeout";
  /** Confirmation timestamp */
  timestamp: string;
  /** User comments or notes */
  userNotes?: string;
}

/**
 * Default configuration for plan preview
 */
const DEFAULT_PREVIEW_OPTIONS: PlanPreviewOptions = {
  showDetails: true,
  includeRiskAnalysis: true,
  showRollbackInfo: true,
  format: "console",
};

/**
 * Default configuration for confirmation workflow
 */
const DEFAULT_CONFIRMATION_OPTIONS: ConfirmationWorkflowOptions = {
  requireConfirmation: true,
  confirmationTimeoutMs: 30000, // 30 seconds
  allowInteractive: true,
  explicitConfirmationRisks: ["high", "critical"],
};

/**
 * Plan preview and confirmation manager.
 * Handles user interface for plan review and approval workflows.
 */
export class PlanPreviewManager {
  private readonly previewOptions: PlanPreviewOptions;
  private readonly confirmationOptions: ConfirmationWorkflowOptions;

  /**
   * Creates a new plan preview manager instance.
   * @param previewOptions Preview configuration options
   * @param confirmationOptions Confirmation workflow options
   */
  constructor(
    previewOptions: Partial<PlanPreviewOptions> = {},
    confirmationOptions: Partial<ConfirmationWorkflowOptions> = {},
  ) {
    this.previewOptions = { ...DEFAULT_PREVIEW_OPTIONS, ...previewOptions };
    this.confirmationOptions = { ...DEFAULT_CONFIRMATION_OPTIONS, ...confirmationOptions };

    logger.info("PlanPreviewManager initialized", {
      format: this.previewOptions.format,
      requireConfirmation: this.confirmationOptions.requireConfirmation,
      allowInteractive: this.confirmationOptions.allowInteractive,
    });
  }

  /**
   * Generates a preview of the cleanup plan for user review.
   * @param plan Cleanup plan to preview
   * @returns Preview result with formatted content
   */
  generatePreview(plan: CleanupPlan): Result<PlanPreviewResult, Error> {
    try {
      logger.info("Generating plan preview", {
        planId: plan.id,
        operationsCount: plan.operations.length,
        format: this.previewOptions.format,
      });

      const content = this.#formatPlanPreview(plan);
      const metadata = this.#extractPreviewMetadata(plan);
      const warnings = this.#generatePreviewWarnings(plan);
      const isSafeToExecute = this.#assessPlanSafety(plan);

      const previewResult: PlanPreviewResult = {
        content,
        metadata,
        isSafeToExecute,
        warnings,
      };

      logger.info("Plan preview generated", {
        planId: plan.id,
        contentLength: content.length,
        warningsCount: warnings.length,
        isSafeToExecute,
      });

      return { data: previewResult, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to generate plan preview", { error: errorMessage });
      return {
        data: null,
        error: new Error(`Failed to generate plan preview: ${errorMessage}`),
      };
    }
  }

  /**
   * Executes the confirmation workflow for a plan.
   * @param plan Cleanup plan to confirm
   * @param preview Plan preview result
   * @returns Confirmation result
   */
  async requestConfirmation(
    plan: CleanupPlan,
    preview: PlanPreviewResult,
  ): Promise<Result<ConfirmationResult, Error>> {
    try {
      // Validate input data
      if (!preview || !preview.metadata || !plan.operations) {
        throw new Error("Invalid plan or preview data");
      }

      logger.info("Requesting plan confirmation", {
        planId: plan.id,
        requireConfirmation: this.confirmationOptions.requireConfirmation,
        allowInteractive: this.confirmationOptions.allowInteractive,
      });

      // Skip confirmation if not required and plan is safe
      if (!this.confirmationOptions.requireConfirmation && preview.isSafeToExecute) {
        return {
          data: {
            confirmed: true,
            method: "automatic",
            timestamp: new Date().toISOString(),
          },
          error: null,
        };
      }

      // Check if explicit confirmation is required
      const requiresExplicitConfirmation = this.#requiresExplicitConfirmation(plan);

      if (requiresExplicitConfirmation && !this.confirmationOptions.allowInteractive) {
        return {
          data: {
            confirmed: false,
            method: "automatic",
            timestamp: new Date().toISOString(),
          },
          error: null,
        };
      }

      // Execute confirmation workflow
      const confirmationResult = await this.#executeConfirmationWorkflow(plan, preview);

      logger.info("Plan confirmation completed", {
        planId: plan.id,
        confirmed: confirmationResult.confirmed,
        method: confirmationResult.method,
      });

      return { data: confirmationResult, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to request confirmation", { error: errorMessage });
      return {
        data: null,
        error: new Error(`Failed to request confirmation: ${errorMessage}`),
      };
    }
  }

  /**
   * Generates a comprehensive plan review including preview and confirmation.
   * @param plan Cleanup plan to review
   * @returns Combined preview and confirmation result
   */
  async reviewPlan(plan: CleanupPlan): Promise<
    Result<{
      preview: PlanPreviewResult;
      confirmation: ConfirmationResult;
    }, Error>
  > {
    try {
      // Validate input data
      if (!plan || !plan.operations || !Array.isArray(plan.operations)) {
        throw new Error("Invalid plan data");
      }

      // Generate preview
      const previewResult = await this.generatePreview(plan);
      if (previewResult.error) {
        return { data: null, error: previewResult.error };
      }

      // Request confirmation
      const confirmationResult = await this.requestConfirmation(plan, previewResult.data!);
      if (confirmationResult.error) {
        return { data: null, error: confirmationResult.error };
      }

      return {
        data: {
          preview: previewResult.data!,
          confirmation: confirmationResult.data!,
        },
        error: null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        data: null,
        error: new Error(`Failed to review plan: ${errorMessage}`),
      };
    }
  }

  /**
   * Formats the plan preview based on the configured format.
   * @private
   */
  #formatPlanPreview(plan: CleanupPlan): string {
    switch (this.previewOptions.format) {
      case "markdown":
        return this.#formatMarkdownPreview(plan);
      case "json":
        return this.#formatJsonPreview(plan);
      case "console":
      default:
        return this.#formatConsolePreview(plan);
    }
  }

  /**
   * Formats plan preview for console output.
   * @private
   */
  #formatConsolePreview(plan: CleanupPlan): string {
    const lines: string[] = [];

    lines.push("=".repeat(60));
    lines.push(`CLEANUP PLAN PREVIEW`);
    lines.push("=".repeat(60));
    lines.push(`Plan ID: ${plan.id}`);
    lines.push(`Created: ${plan.timestamp}`);
    lines.push(`Status: ${plan.status}`);
    lines.push("");

    // Summary
    lines.push("SUMMARY:");
    lines.push(`  Total Operations: ${plan.operations.length}`);
    lines.push(`  Estimated Duration: ${Math.round(plan.metadata.estimatedDuration / 1000)}s`);
    lines.push(`  Overall Risk: ${plan.metadata.riskAssessment.overallRisk.toUpperCase()}`);
    lines.push("");

    // Analysis summary
    const analysis = plan.analysis;
    lines.push("FLAG ANALYSIS:");
    lines.push(`  Optimizely Flags: ${analysis.totalOptimizelyFlags}`);
    lines.push(`  Codebase Flags: ${analysis.totalCodebaseFlags}`);
    lines.push(`  Orphaned Flags: ${analysis.summary.orphanedFlags}`);
    lines.push(`  Missing Flags: ${analysis.summary.missingFlags}`);
    lines.push(`  Archived but Used: ${analysis.summary.archivedButUsed}`);
    lines.push(`  Active but Unused: ${analysis.summary.activeButUnused}`);
    lines.push("");

    if (this.previewOptions.showDetails) {
      lines.push("OPERATIONS:");
      for (let i = 0; i < plan.operations.length; i++) {
        const op = plan.operations[i];
        lines.push(`  ${i + 1}. ${op.type.toUpperCase()} - ${op.flagKey}`);
        lines.push(`     Risk: ${op.riskLevel.toUpperCase()}`);
        lines.push(`     Reason: ${op.reason}`);

        if (this.previewOptions.showRollbackInfo && op.rollbackInfo?.supported) {
          lines.push(`     Rollback: Supported`);
        }
        lines.push("");
      }
    }

    if (this.previewOptions.includeRiskAnalysis) {
      lines.push("RISK ANALYSIS:");
      const riskAssessment = plan.metadata.riskAssessment;
      lines.push(`  Overall Risk: ${riskAssessment.overallRisk.toUpperCase()}`);
      lines.push(`  High Risk Operations: ${riskAssessment.highRiskOperations}`);
      lines.push("");

      if (riskAssessment.potentialImpact.length > 0) {
        lines.push("  Potential Impact:");
        for (const impact of riskAssessment.potentialImpact) {
          lines.push(`    - ${impact}`);
        }
        lines.push("");
      }

      if (riskAssessment.recommendations.length > 0) {
        lines.push("  Recommendations:");
        for (const recommendation of riskAssessment.recommendations) {
          lines.push(`    - ${recommendation}`);
        }
        lines.push("");
      }
    }

    // Validation results
    if (!plan.validation.isValid) {
      lines.push("VALIDATION ERRORS:");
      for (const error of plan.validation.errors) {
        lines.push(`  ❌ ${error}`);
      }
      lines.push("");
    }

    if (plan.validation.warnings.length > 0) {
      lines.push("WARNINGS:");
      for (const warning of plan.validation.warnings) {
        lines.push(`  ⚠️  ${warning}`);
      }
      lines.push("");
    }

    lines.push("=".repeat(60));

    return lines.join("\n");
  }

  /**
   * Formats plan preview for markdown output.
   * @private
   */
  #formatMarkdownPreview(plan: CleanupPlan): string {
    const lines: string[] = [];

    lines.push("# Cleanup Plan Preview");
    lines.push("");
    lines.push(`**Plan ID:** ${plan.id}`);
    lines.push(`**Created:** ${plan.timestamp}`);
    lines.push(`**Status:** ${plan.status}`);
    lines.push("");

    lines.push("## Summary");
    lines.push(`- **Total Operations:** ${plan.operations.length}`);
    lines.push(`- **Estimated Duration:** ${Math.round(plan.metadata.estimatedDuration / 1000)}s`);
    lines.push(`- **Overall Risk:** ${plan.metadata.riskAssessment.overallRisk.toUpperCase()}`);
    lines.push("");

    lines.push("## Flag Analysis");
    const analysis = plan.analysis;
    lines.push(`- **Optimizely Flags:** ${analysis.totalOptimizelyFlags}`);
    lines.push(`- **Codebase Flags:** ${analysis.totalCodebaseFlags}`);
    lines.push(`- **Orphaned Flags:** ${analysis.summary.orphanedFlags}`);
    lines.push(`- **Missing Flags:** ${analysis.summary.missingFlags}`);
    lines.push(`- **Archived but Used:** ${analysis.summary.archivedButUsed}`);
    lines.push(`- **Active but Unused:** ${analysis.summary.activeButUnused}`);
    lines.push("");

    if (this.previewOptions.showDetails) {
      lines.push("## Operations");
      for (let i = 0; i < plan.operations.length; i++) {
        const op = plan.operations[i];
        lines.push(`### ${i + 1}. ${op.type.toUpperCase()} - \`${op.flagKey}\``);
        lines.push(`- **Risk:** ${op.riskLevel.toUpperCase()}`);
        lines.push(`- **Reason:** ${op.reason}`);

        if (this.previewOptions.showRollbackInfo && op.rollbackInfo?.supported) {
          lines.push(`- **Rollback:** Supported`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Formats plan preview as JSON.
   * @private
   */
  #formatJsonPreview(plan: CleanupPlan): string {
    const preview = {
      planId: plan.id,
      timestamp: plan.timestamp,
      status: plan.status,
      summary: {
        totalOperations: plan.operations.length,
        estimatedDurationMs: plan.metadata.estimatedDuration,
        overallRisk: plan.metadata.riskAssessment.overallRisk,
      },
      analysis: plan.analysis.summary,
      operations: this.previewOptions.showDetails
        ? plan.operations.map((op) => ({
          type: op.type,
          flagKey: op.flagKey,
          riskLevel: op.riskLevel,
          reason: op.reason,
          rollbackSupported: op.rollbackInfo?.supported,
        }))
        : undefined,
      riskAssessment: this.previewOptions.includeRiskAnalysis
        ? plan.metadata.riskAssessment
        : undefined,
      validation: {
        isValid: plan.validation.isValid,
        errors: plan.validation.errors,
        warnings: plan.validation.warnings,
      },
    };

    return JSON.stringify(preview, null, 2);
  }

  /**
   * Extracts metadata for the preview.
   * @private
   */
  #extractPreviewMetadata(plan: CleanupPlan) {
    const highRiskOperations = plan.operations.filter(
      (op) => op.riskLevel === "high" || op.riskLevel === "critical",
    ).length;

    return {
      totalOperations: plan.operations.length,
      estimatedDurationMs: plan.metadata.estimatedDuration,
      overallRisk: plan.metadata.riskAssessment.overallRisk,
      highRiskOperations,
    };
  }

  /**
   * Generates warnings for the preview.
   * @private
   */
  #generatePreviewWarnings(plan: CleanupPlan): string[] {
    const warnings: string[] = [];

    // Copy validation warnings
    warnings.push(...plan.validation.warnings);

    // Add additional warnings based on plan content
    const criticalOps = plan.operations.filter((op) => op.riskLevel === "critical").length;
    if (criticalOps > 0) {
      warnings.push(`Plan contains ${criticalOps} critical risk operations`);
    }

    const nonRollbackOps = plan.operations.filter((op) => !op.rollbackInfo?.supported).length;
    if (nonRollbackOps > 0) {
      warnings.push(`${nonRollbackOps} operations do not support automatic rollback`);
    }

    if (plan.metadata.estimatedDuration > 300000) { // 5 minutes
      warnings.push("Plan execution may take longer than 5 minutes");
    }

    return warnings;
  }

  /**
   * Assesses whether the plan is safe to execute.
   * @private
   */
  #assessPlanSafety(plan: CleanupPlan): boolean {
    // Plan is not safe if validation failed
    if (!plan.validation.isValid) {
      return false;
    }

    // Plan is not safe if it has critical risk operations and confirmation is required
    const hasCriticalOps = plan.operations.some((op) => op.riskLevel === "critical");
    if (hasCriticalOps && this.confirmationOptions.requireConfirmation) {
      return false;
    }

    // Plan is not safe if overall risk exceeds tolerance
    const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
    const riskIndex = riskLevels.indexOf(plan.metadata.riskAssessment.overallRisk);

    // For now, consider high and critical as unsafe for automatic execution
    return riskIndex < 2; // low or medium risk
  }

  /**
   * Checks if a plan requires explicit confirmation.
   * @private
   */
  #requiresExplicitConfirmation(plan: CleanupPlan): boolean {
    return plan.operations.some((op) =>
      this.confirmationOptions.explicitConfirmationRisks.includes(op.riskLevel)
    );
  }

  /**
   * Executes the confirmation workflow.
   * @private
   */
  async #executeConfirmationWorkflow(
    plan: CleanupPlan,
    preview: PlanPreviewResult,
  ): Promise<ConfirmationResult> {
    // In a real implementation, this would handle interactive confirmation
    // For now, we'll simulate based on risk level and configuration

    const requiresExplicitConfirmation = this.#requiresExplicitConfirmation(plan);

    // If confirmation is required but interactive mode is disabled, use timeout method
    if (
      this.confirmationOptions.requireConfirmation && !this.confirmationOptions.allowInteractive
    ) {
      return {
        confirmed: false,
        method: "timeout",
        timestamp: new Date().toISOString(),
        userNotes: "Interactive confirmation disabled - automatic timeout",
      };
    }

    if (!requiresExplicitConfirmation && preview.isSafeToExecute) {
      return {
        confirmed: true,
        method: "automatic",
        timestamp: new Date().toISOString(),
      };
    }

    // Simulate confirmation timeout for high-risk operations
    if (requiresExplicitConfirmation) {
      // In a real system, this would wait for user input
      await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate delay

      return {
        confirmed: false, // Default to not confirmed for safety
        method: "timeout",
        timestamp: new Date().toISOString(),
        userNotes: "Automatic timeout - high risk operations require manual confirmation",
      };
    }

    return {
      confirmed: true,
      method: "automatic",
      timestamp: new Date().toISOString(),
    };
  }
}
