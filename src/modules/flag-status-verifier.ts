import * as logger from "../utils/logger.ts";
import { Result } from "../utils/try-catch.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import { EnvironmentFlagStatus, FlagConsistencyValidation } from "../types/optimizely.ts";

/**
 * Environment validation configuration
 */
export interface EnvironmentValidationConfig {
  /** Environment keys to validate (if empty, validates all environments) */
  targetEnvironments?: string[];
  /** Whether to include archived flags in validation */
  includeArchivedFlags?: boolean;
  /** Whether to validate targeting rules consistency */
  validateTargetingRules?: boolean;
  /** Minimum number of environments required for consistency checks */
  minimumEnvironments?: number;
}

/**
 * Cross-environment validation report
 */
export interface CrossEnvironmentReport {
  /** Total number of flags validated */
  totalFlags: number;
  /** Number of flags with consistent status across environments */
  consistentFlags: number;
  /** Number of flags with inconsistencies */
  inconsistentFlags: number;
  /** Detailed validation results per flag */
  flagValidations: Record<string, FlagConsistencyValidation>;
  /** Summary of environment health */
  environmentSummary: Record<string, EnvironmentHealthSummary>;
  /** List of flags recommended for review */
  flagsForReview: string[];
  /** Validation timestamp */
  validatedAt: string;
}

/**
 * Environment health summary
 */
export interface EnvironmentHealthSummary {
  /** Environment key */
  key: string;
  /** Environment name */
  name: string;
  /** Total flags in this environment */
  totalFlags: number;
  /** Number of enabled flags */
  enabledFlags: number;
  /** Number of disabled flags */
  disabledFlags: number;
  /** Number of archived flags */
  archivedFlags: number;
  /** Health score (0-1) based on consistency */
  healthScore: number;
}

/**
 * Service for verifying flag status across environments and validating consistency
 */
export class FlagStatusVerifier {
  constructor(private readonly apiClient: OptimizelyApiClient) {}

  /**
   * Validates flag configurations and targeting rules for a specific flag.
   * @param flagKey The feature flag key to validate
   * @param config Validation configuration options
   * @returns Result object with validation results or error
   */
  async validateFlagConfiguration(
    flagKey: string,
    config: EnvironmentValidationConfig = {},
  ): Promise<Result<FlagConsistencyValidation, Error>> {
    try {
      if (!flagKey || typeof flagKey !== "string") {
        return {
          data: null,
          error: new Error("Flag key is required and must be a string"),
        };
      }

      logger.debug("Starting flag configuration validation", {
        flagKey,
        config,
      });

      // Use the API client's validation method as the base
      const validationResult = await this.apiClient.validateFlagConsistency(flagKey);
      if (validationResult.error || !validationResult.data) {
        return validationResult;
      }

      const validation = validationResult.data;

      // Apply additional validation logic based on config
      if (config.targetEnvironments && config.targetEnvironments.length > 0) {
        // Filter to only target environments
        const filteredEnvironments: Record<string, EnvironmentFlagStatus> = {};
        for (const envKey of config.targetEnvironments) {
          if (validation.environments[envKey]) {
            filteredEnvironments[envKey] = validation.environments[envKey];
          }
        }
        validation.environments = filteredEnvironments;
        validation.summary.totalEnvironments = Object.keys(filteredEnvironments).length;
      }

      // Check minimum environments requirement
      if (
        config.minimumEnvironments &&
        validation.summary.totalEnvironments < config.minimumEnvironments
      ) {
        validation.isConsistent = false;
        validation.inconsistencies.push({
          type: "missing_environment",
          message:
            `Flag is missing from required environments. Found ${validation.summary.totalEnvironments}, required ${config.minimumEnvironments}`,
          affectedEnvironments: Object.keys(validation.environments),
        });
      }

      // Additional targeting rules validation if requested
      if (config.validateTargetingRules) {
        this.#validateTargetingRulesConsistency(validation);
      }

      logger.debug("Flag configuration validation completed", {
        flagKey,
        isConsistent: validation.isConsistent,
        inconsistencyCount: validation.inconsistencies.length,
      });

      return { data: validation, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in validateFlagConfiguration", {
        flagKey,
        error: errorMsg,
      });
      return {
        data: null,
        error: new Error(`Failed to validate flag configuration for ${flagKey}: ${errorMsg}`),
      };
    }
  }

  /**
   * Checks flag status consistency across all or specified environments.
   * @param flagKeys Array of flag keys to check (if empty, checks all flags)
   * @param config Validation configuration options
   * @returns Result object with cross-environment report or error
   */
  async checkFlagStatusConsistency(
    flagKeys: string[] = [],
    config: EnvironmentValidationConfig = {},
  ): Promise<Result<CrossEnvironmentReport, Error>> {
    try {
      logger.debug("Starting cross-environment flag status consistency check", {
        flagCount: flagKeys.length || "all",
        config,
      });

      // Get all flags if none specified
      let flagsToCheck = flagKeys;
      if (flagsToCheck.length === 0) {
        const allFlagsResult = await this.apiClient.getAllFeatureFlags();
        if (allFlagsResult.error || !allFlagsResult.data) {
          return {
            data: null,
            error: allFlagsResult.error || new Error("Failed to fetch all flags"),
          };
        }

        flagsToCheck = allFlagsResult.data
          .filter((flag) => config.includeArchivedFlags || !flag.archived)
          .map((flag) => flag.key);
      }

      // Get all environments for summary
      const environmentsResult = await this.apiClient.getEnvironments();
      if (environmentsResult.error || !environmentsResult.data) {
        return {
          data: null,
          error: environmentsResult.error || new Error("Failed to fetch environments"),
        };
      }

      const allEnvironments = environmentsResult.data;
      const targetEnvironments = config.targetEnvironments?.length
        ? allEnvironments.filter((env) => config.targetEnvironments!.includes(env.key))
        : allEnvironments;

      const report: CrossEnvironmentReport = {
        totalFlags: flagsToCheck.length,
        consistentFlags: 0,
        inconsistentFlags: 0,
        flagValidations: {},
        environmentSummary: {},
        flagsForReview: [],
        validatedAt: new Date().toISOString(),
      };

      // Initialize environment summaries
      for (const env of targetEnvironments) {
        report.environmentSummary[env.key] = {
          key: env.key,
          name: env.name,
          totalFlags: 0,
          enabledFlags: 0,
          disabledFlags: 0,
          archivedFlags: 0,
          healthScore: 1.0,
        };
      }

      // Validate each flag
      const validationPromises = flagsToCheck.map(async (flagKey) => {
        const validation = await this.validateFlagConfiguration(flagKey, config);
        return { flagKey, validation };
      });

      const validationResults = await Promise.all(validationPromises);

      for (const { flagKey, validation } of validationResults) {
        if (validation.error) {
          logger.warn("Failed to validate flag", {
            flagKey,
            error: validation.error.message,
          });
          report.flagsForReview.push(flagKey);
          continue;
        }

        if (!validation.data) {
          continue;
        }

        report.flagValidations[flagKey] = validation.data;

        if (validation.data.isConsistent) {
          report.consistentFlags++;
        } else {
          report.inconsistentFlags++;
          report.flagsForReview.push(flagKey);
        }

        // Update environment summaries
        for (const [envKey, envStatus] of Object.entries(validation.data.environments)) {
          if (report.environmentSummary[envKey]) {
            report.environmentSummary[envKey].totalFlags++;
            if (envStatus.enabled) {
              report.environmentSummary[envKey].enabledFlags++;
            } else {
              report.environmentSummary[envKey].disabledFlags++;
            }
            // Note: We don't have archived status per environment in the current structure
          }
        }
      }

      // Calculate environment health scores
      for (const envSummary of Object.values(report.environmentSummary)) {
        if (envSummary.totalFlags > 0) {
          // Health score based on consistency (flags that appear in all validations)
          const flagsInThisEnv = Object.values(report.flagValidations)
            .filter((validation) => validation.environments[envSummary.key])
            .length;
          envSummary.healthScore = flagsInThisEnv / report.totalFlags;
        }
      }

      logger.info("Cross-environment flag status consistency check completed", {
        totalFlags: report.totalFlags,
        consistentFlags: report.consistentFlags,
        inconsistentFlags: report.inconsistentFlags,
        flagsForReview: report.flagsForReview.length,
      });

      return { data: report, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in checkFlagStatusConsistency", {
        error: errorMsg,
      });
      return {
        data: null,
        error: new Error(`Failed to check flag status consistency: ${errorMsg}`),
      };
    }
  }

  /**
   * Generates a comprehensive cross-environment report with recommendations.
   * @param flagKeys Array of flag keys to include in report (if empty, includes all flags)
   * @param config Validation configuration options
   * @returns Result object with formatted report or error
   */
  async generateCrossEnvironmentReport(
    flagKeys: string[] = [],
    config: EnvironmentValidationConfig = {},
  ): Promise<Result<string, Error>> {
    try {
      const reportResult = await this.checkFlagStatusConsistency(flagKeys, config);
      if (reportResult.error || !reportResult.data) {
        return {
          data: null,
          error: reportResult.error || new Error("Failed to generate consistency report"),
        };
      }

      const report = reportResult.data;
      const reportLines: string[] = [];

      // Header
      reportLines.push("# Cross-Environment Flag Status Report");
      reportLines.push(`Generated: ${report.validatedAt}`);
      reportLines.push("");

      // Summary
      reportLines.push("## Summary");
      reportLines.push(`- Total Flags Validated: ${report.totalFlags}`);
      reportLines.push(`- Consistent Flags: ${report.consistentFlags}`);
      reportLines.push(`- Inconsistent Flags: ${report.inconsistentFlags}`);
      reportLines.push(`- Flags Requiring Review: ${report.flagsForReview.length}`);
      reportLines.push("");

      // Environment Health
      reportLines.push("## Environment Health");
      reportLines.push("| Environment | Total Flags | Enabled | Disabled | Health Score |");
      reportLines.push("|-------------|-------------|---------|----------|--------------|");

      for (const env of Object.values(report.environmentSummary)) {
        const healthPercent = (env.healthScore * 100).toFixed(1);
        reportLines.push(
          `| ${env.name} (${env.key}) | ${env.totalFlags} | ${env.enabledFlags} | ${env.disabledFlags} | ${healthPercent}% |`,
        );
      }
      reportLines.push("");

      // Inconsistent Flags
      if (report.inconsistentFlags > 0) {
        reportLines.push("## Inconsistent Flags");
        for (const [flagKey, validation] of Object.entries(report.flagValidations)) {
          if (!validation.isConsistent) {
            reportLines.push(`### ${flagKey}`);
            for (const inconsistency of validation.inconsistencies) {
              reportLines.push(`- **${inconsistency.type}**: ${inconsistency.message}`);
              if (inconsistency.affectedEnvironments.length > 0) {
                reportLines.push(
                  `  - Affected Environments: ${inconsistency.affectedEnvironments.join(", ")}`,
                );
              }
            }
            reportLines.push("");
          }
        }
      }

      // Recommendations
      reportLines.push("## Recommendations");
      if (report.flagsForReview.length > 0) {
        reportLines.push("The following flags require manual review:");
        for (const flagKey of report.flagsForReview) {
          reportLines.push(`- ${flagKey}`);
        }
      } else {
        reportLines.push("All flags are consistent across environments. No action required.");
      }

      const reportContent = reportLines.join("\n");
      logger.debug("Cross-environment report generated", {
        reportLength: reportContent.length,
        totalFlags: report.totalFlags,
      });

      return { data: reportContent, error: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error in generateCrossEnvironmentReport", {
        error: errorMsg,
      });
      return {
        data: null,
        error: new Error(`Failed to generate cross-environment report: ${errorMsg}`),
      };
    }
  }

  /**
   * Validates targeting rules consistency across environments (private helper).
   * @param validation The validation object to enhance with targeting rules checks
   */
  #validateTargetingRulesConsistency(validation: FlagConsistencyValidation): void {
    try {
      const environments = Object.keys(validation.environments);
      const targetingRuleStatuses = environments.map((env) =>
        validation.environments[env].hasTargetingRules
      );

      // Check if targeting rules are inconsistently applied
      const hasTargetingRules = targetingRuleStatuses.some((status) => status);
      const allHaveTargetingRules = targetingRuleStatuses.every((status) => status);
      const noneHaveTargetingRules = targetingRuleStatuses.every((status) => !status);

      if (hasTargetingRules && !allHaveTargetingRules && !noneHaveTargetingRules) {
        validation.isConsistent = false;
        validation.inconsistencies.push({
          type: "configuration_mismatch",
          message: "Targeting rules are inconsistently configured across environments",
          affectedEnvironments: environments.filter((_env, idx) =>
            targetingRuleStatuses[idx] !== targetingRuleStatuses[0]
          ),
        });
      }
    } catch (error) {
      logger.warn("Failed to validate targeting rules consistency", {
        flagKey: validation.flagKey,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
