/**
 * Example usage of the flag status verification functionality.
 * This demonstrates how to use the new cross-environment validation features.
 */
import { OptimizelyApiClient } from "../modules/optimizely-client.ts";
import { FlagStatusVerifier } from "../modules/flag-status-verifier.ts";
import { loadEnvironment } from "../config/environment.ts";
import * as logger from "../utils/logger.ts";

/**
 * Example: Validating flag status across all environments
 */
async function validateAllFlagStatuses() {
  try {
    // Load environment configuration
    const env = await loadEnvironment();
    
    // Create API client
    const apiClient = await OptimizelyApiClient.create({
      maxRps: 5,
      maxRetries: 3,
    });

    // Create flag status verifier
    const verifier = new FlagStatusVerifier(apiClient);

    // Get all flags and check their consistency across environments
    const reportResult = await verifier.checkFlagStatusConsistency();
    
    if (reportResult.error) {
      logger.error("Failed to generate consistency report", {
        error: reportResult.error.message,
      });
      return;
    }

    const report = reportResult.data!;
    
    // Log summary
    logger.info("Flag status verification completed", {
      totalFlags: report.totalFlags,
      consistentFlags: report.consistentFlags,
      inconsistentFlags: report.inconsistentFlags,
      flagsForReview: report.flagsForReview.length,
    });

    // Generate and display detailed report
    const detailedReportResult = await verifier.generateCrossEnvironmentReport();
    
    if (detailedReportResult.error) {
      logger.error("Failed to generate detailed report", {
        error: detailedReportResult.error.message,
      });
      return;
    }

    console.log("\n" + detailedReportResult.data);
    
    // Handle flags that require review
    if (report.flagsForReview.length > 0) {
      logger.warn("Flags requiring manual review", {
        flags: report.flagsForReview,
      });
      
      // Optionally validate specific flags with detailed configuration
      for (const flagKey of report.flagsForReview.slice(0, 3)) { // Limit to first 3 for demo
        const validationResult = await verifier.validateFlagConfiguration(flagKey, {
          validateTargetingRules: true,
          minimumEnvironments: 2,
        });
        
        if (validationResult.data && !validationResult.data.isConsistent) {
          logger.warn("Flag inconsistency details", {
            flagKey,
            inconsistencies: validationResult.data.inconsistencies,
          });
        }
      }
    }

  } catch (error) {
    logger.error("Error in flag status validation", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Example: Validating a specific flag across environments
 */
async function validateSpecificFlag(flagKey: string) {
  try {
    const apiClient = await OptimizelyApiClient.create();
    const verifier = new FlagStatusVerifier(apiClient);

    // Validate specific flag
    const validationResult = await verifier.validateFlagConfiguration(flagKey, {
      targetEnvironments: ["development", "staging", "production"],
      validateTargetingRules: true,
      minimumEnvironments: 3,
    });

    if (validationResult.error) {
      logger.error("Failed to validate flag", {
        flagKey,
        error: validationResult.error.message,
      });
      return;
    }

    const validation = validationResult.data!;
    
    if (validation.isConsistent) {
      logger.info("Flag is consistent across environments", {
        flagKey,
        environments: Object.keys(validation.environments),
      });
    } else {
      logger.warn("Flag has inconsistencies", {
        flagKey,
        inconsistencies: validation.inconsistencies,
        environments: validation.environments,
      });
    }

  } catch (error) {
    logger.error("Error validating specific flag", {
      flagKey,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Example: Getting environment-specific flag status
 */
async function getEnvironmentSpecificStatus(flagKey: string, environmentKey: string) {
  try {
    const apiClient = await OptimizelyApiClient.create();

    // Get flag status in specific environment
    const statusResult = await apiClient.getFlagStatusInEnvironment(flagKey, environmentKey);

    if (statusResult.error) {
      logger.error("Failed to get flag status", {
        flagKey,
        environmentKey,
        error: statusResult.error.message,
      });
      return;
    }

    const status = statusResult.data!;
    
    logger.info("Flag status in environment", {
      flagKey,
      environmentKey,
      enabled: status.enabled,
      status: status.status,
      hasTargetingRules: !!(status.rolloutRules && status.rolloutRules.length > 0),
    });

  } catch (error) {
    logger.error("Error getting environment-specific status", {
      flagKey,
      environmentKey,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Example usage
if (import.meta.main) {
  const flagKey = Deno.args[0];
  const environmentKey = Deno.args[1];

  if (flagKey && environmentKey) {
    // deno run --allow-all examples/flag-verification.ts my_flag production
    await getEnvironmentSpecificStatus(flagKey, environmentKey);
  } else if (flagKey) {
    // deno run --allow-all examples/flag-verification.ts my_flag
    await validateSpecificFlag(flagKey);
  } else {
    // deno run --allow-all examples/flag-verification.ts
    await validateAllFlagStatuses();
  }
}
