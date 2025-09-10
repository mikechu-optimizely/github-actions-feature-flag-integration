/**
 * Emergency control manager for halting cleanup operations and rollback procedures.
 * Provides emergency stop functionality and rollback mechanisms for flag cleanup operations.
 */

import { overrideConfigManager } from "./override-config-manager.ts";
import * as logger from "./logger.ts";

/**
 * Emergency stop reasons enum.
 */
export enum EmergencyStopReason {
  USER_INITIATED = "user_initiated",
  STOP_WORD_DETECTED = "stop_word_detected",
  API_ERROR_SPIKE = "api_error_spike",
  FLAG_VALIDATION_FAILURE = "flag_validation_failure",
  HIGH_FAILURE_RATE = "high_failure_rate",
  SYSTEM_ERROR = "system_error",
}

/**
 * Rollback operation record for tracking what needs to be undone.
 */
export interface RollbackOperation {
  id: string;
  timestamp: string;
  operation: "archive_flag" | "update_flag" | "delete_flag";
  flagKey: string;
  previousState: {
    archived?: boolean;
    enabled?: boolean;
    rolloutPercentage?: number;
    targetingRules?: unknown[];
    variationSettings?: unknown;
  };
  rollbackStatus: "pending" | "completed" | "failed" | "skipped";
  rollbackError?: string;
}

/**
 * Emergency state tracking.
 */
interface EmergencyState {
  isEmergencyStop: boolean;
  stopReason?: EmergencyStopReason;
  stopInitiatedBy?: string;
  stopTimestamp?: string;
  rollbackOperations: Map<string, RollbackOperation>;
  emergencyNotificationsSent: boolean;
}

/**
 * Emergency control manager class.
 */
export class EmergencyControlManager {
  private emergencyState: EmergencyState = {
    isEmergencyStop: false,
    rollbackOperations: new Map(),
    emergencyNotificationsSent: false,
  };

  private rollbackTimeoutMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private githubToken: string | undefined;
  private repository: string | undefined;

  constructor() {
    this.githubToken = Deno.env.get("GITHUB_TOKEN");
    this.repository = Deno.env.get("GITHUB_REPOSITORY");
  }

  /**
   * Checks for emergency stop conditions in logs or environment.
   */
  async checkEmergencyConditions(
    logMessage?: string,
    errorRate?: number,
    failureCount?: number,
  ): Promise<boolean> {
    try {
      const emergencyControls = await overrideConfigManager.getEmergencyControls();
      if (!emergencyControls) return false;

      // Check for stop words in log messages
      if (logMessage) {
        for (const stopWord of emergencyControls.stopWords) {
          if (logMessage.toUpperCase().includes(stopWord.toUpperCase())) {
            await this.triggerEmergencyStop(EmergencyStopReason.STOP_WORD_DETECTED, "system");
            return true;
          }
        }
      }

      // Check for high error rates
      if (errorRate !== undefined && errorRate > 0.5) {
        await this.triggerEmergencyStop(EmergencyStopReason.API_ERROR_SPIKE, "system");
        return true;
      }

      // Check for high failure counts
      if (failureCount !== undefined && failureCount > 10) {
        await this.triggerEmergencyStop(EmergencyStopReason.HIGH_FAILURE_RATE, "system");
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Failed to check emergency conditions", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Manually triggers emergency stop.
   */
  async triggerEmergencyStop(
    reason: EmergencyStopReason,
    initiatedBy: string = "unknown",
  ): Promise<void> {
    if (this.emergencyState.isEmergencyStop) {
      logger.warn("Emergency stop already active", {
        currentReason: this.emergencyState.stopReason,
        newReason: reason,
      });
      return;
    }

    this.emergencyState = {
      isEmergencyStop: true,
      stopReason: reason,
      stopInitiatedBy: initiatedBy,
      stopTimestamp: new Date().toISOString(),
      rollbackOperations: this.emergencyState.rollbackOperations,
      emergencyNotificationsSent: false,
    };

    logger.error("🚨 EMERGENCY STOP ACTIVATED", {
      reason,
      initiatedBy,
      timestamp: this.emergencyState.stopTimestamp,
    });

    // Send emergency notifications
    await this.sendEmergencyNotifications();

    // Create emergency issue if configured
    await this.createEmergencyIssue();
  }

  /**
   * Clears emergency stop state.
   */
  clearEmergencyStop(clearedBy: string = "unknown"): void {
    if (!this.emergencyState.isEmergencyStop) {
      return;
    }

    logger.info("Emergency stop cleared", {
      clearedBy,
      previousReason: this.emergencyState.stopReason,
      duration: this.emergencyState.stopTimestamp
        ? Date.now() - new Date(this.emergencyState.stopTimestamp).getTime()
        : 0,
    });

    this.emergencyState.isEmergencyStop = false;
    this.emergencyState.stopReason = undefined;
    this.emergencyState.stopInitiatedBy = undefined;
    this.emergencyState.stopTimestamp = undefined;
    this.emergencyState.emergencyNotificationsSent = false;
  }

  /**
   * Checks if emergency stop is active.
   */
  isEmergencyStopActive(): boolean {
    return this.emergencyState.isEmergencyStop;
  }

  /**
   * Gets current emergency state.
   */
  getEmergencyState(): Readonly<EmergencyState> {
    return this.emergencyState;
  }

  /**
   * Records an operation for potential rollback.
   */
  recordOperationForRollback(
    flagKey: string,
    operation: "archive_flag" | "update_flag" | "delete_flag",
    previousState: RollbackOperation["previousState"],
  ): string {
    const rollbackId = `rollback-${flagKey}-${Date.now()}`;

    const rollbackOperation: RollbackOperation = {
      id: rollbackId,
      timestamp: new Date().toISOString(),
      operation,
      flagKey,
      previousState,
      rollbackStatus: "pending",
    };

    this.emergencyState.rollbackOperations.set(rollbackId, rollbackOperation);

    logger.debug("Operation recorded for potential rollback", {
      rollbackId,
      flagKey,
      operation,
    });

    return rollbackId;
  }

  /**
   * Executes rollback for all recorded operations or specific operations.
   */
  async executeRollback(
    operationIds?: string[],
    requiresApproval: boolean = true,
  ): Promise<{
    totalOperations: number;
    successful: number;
    failed: number;
    skipped: number;
    results: Array<{
      id: string;
      flagKey: string;
      status: "success" | "failed" | "skipped";
      error?: string;
    }>;
  }> {
    try {
      const emergencyControls = await overrideConfigManager.getEmergencyControls();

      // Check if approval is required
      if (requiresApproval && emergencyControls?.rollbackConfig?.requiresApproval) {
        logger.warn("Rollback requires approval - operation halted", {
          operationCount: operationIds?.length || this.emergencyState.rollbackOperations.size,
        });

        return {
          totalOperations: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
          results: [],
        };
      }

      const operations = operationIds
        ? operationIds.map((id) => this.emergencyState.rollbackOperations.get(id)).filter(
          Boolean,
        ) as RollbackOperation[]
        : Array.from(this.emergencyState.rollbackOperations.values());

      // Filter operations within rollback window
      const validOperations = operations.filter((op) => {
        const opTime = new Date(op.timestamp).getTime();
        const now = Date.now();
        return now - opTime <= this.rollbackTimeoutMs;
      });

      logger.info("Executing rollback operations", {
        totalOperations: operations.length,
        validOperations: validOperations.length,
        rollbackTimeoutHours: this.rollbackTimeoutMs / (1000 * 60 * 60),
      });

      let successful = 0;
      let failed = 0;
      let skipped = 0;
      const results = [];

      // Note: In a full implementation, this would integrate with OptimizelyApiClient
      // For now, this is a framework for the rollback logic
      for (const operation of validOperations) {
        try {
          if (operation.rollbackStatus !== "pending") {
            results.push({
              id: operation.id,
              flagKey: operation.flagKey,
              status: "skipped" as const,
              error: `Already processed: ${operation.rollbackStatus}`,
            });
            skipped++;
            continue;
          }

          // TODO: Implement actual rollback logic with OptimizelyApiClient
          // This would restore the flag to its previous state
          const rollbackSuccess = await this.performFlagRollback(operation);

          if (rollbackSuccess) {
            operation.rollbackStatus = "completed";
            results.push({
              id: operation.id,
              flagKey: operation.flagKey,
              status: "success" as const,
            });
            successful++;
          } else {
            operation.rollbackStatus = "failed";
            operation.rollbackError = "Rollback operation failed";
            results.push({
              id: operation.id,
              flagKey: operation.flagKey,
              status: "failed" as const,
              error: "Rollback operation failed",
            });
            failed++;
          }
        } catch (error) {
          operation.rollbackStatus = "failed";
          operation.rollbackError = error instanceof Error ? error.message : String(error);
          results.push({
            id: operation.id,
            flagKey: operation.flagKey,
            status: "failed" as const,
            error: error instanceof Error ? error.message : String(error),
          });
          failed++;
        }
      }

      // Send rollback notifications
      if (emergencyControls?.rollbackConfig?.rollbackNotifications) {
        this.sendRollbackNotifications(results);
      }

      return {
        totalOperations: operations.length,
        successful,
        failed,
        skipped,
        results,
      };
    } catch (error) {
      logger.error("Failed to execute rollback", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Sends emergency notifications to configured channels.
   */
  private async sendEmergencyNotifications(): Promise<void> {
    if (this.emergencyState.emergencyNotificationsSent) {
      return;
    }

    try {
      const emergencyControls = await overrideConfigManager.getEmergencyControls();
      if (!emergencyControls?.rollbackConfig?.rollbackNotifications) {
        return;
      }

      logger.info("Sending emergency notifications", {
        recipients: emergencyControls.rollbackConfig.rollbackNotifications.length,
      });

      // In a full implementation, this would send notifications via:
      // - Slack webhooks
      // - Email notifications
      // - PagerDuty alerts
      // - GitHub issue creation
      // For now, we log the notification

      this.emergencyState.emergencyNotificationsSent = true;
    } catch (error) {
      logger.error("Failed to send emergency notifications", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Creates a GitHub issue for the emergency stop.
   */
  private async createEmergencyIssue(): Promise<void> {
    if (!this.githubToken || !this.repository) {
      logger.warn("GitHub token or repository not configured, skipping emergency issue creation");
      return;
    }

    try {
      const [owner, repo] = this.repository.split("/");
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          "Authorization": `token ${this.githubToken}`,
          "Content-Type": "application/json",
          "User-Agent": "optimizely-flag-sync-action",
        },
        body: JSON.stringify({
          title: `🚨 EMERGENCY: Flag Sync Operation Halted - ${this.emergencyState.stopReason}`,
          body: this.generateEmergencyIssueBody(),
          labels: ["emergency", "flag-sync", "incident", "high-priority"],
          assignees: [], // Would be configured based on override config
        }),
      });

      if (response.ok) {
        const issue = await response.json();
        logger.info("Emergency issue created", {
          issueNumber: issue.number,
          issueUrl: issue.html_url,
        });
      }
    } catch (error) {
      logger.error("Failed to create emergency issue", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generates GitHub issue body for emergency situations.
   */
  private generateEmergencyIssueBody(): string {
    const state = this.emergencyState;

    return `# 🚨 EMERGENCY: Flag Sync Operation Halted

**Status:** EMERGENCY STOP ACTIVE  
**Reason:** ${state.stopReason}  
**Initiated By:** ${state.stopInitiatedBy}  
**Timestamp:** ${state.stopTimestamp}  

## Summary
The Optimizely Feature Flag Sync operation has been automatically halted due to emergency conditions.

## Emergency Details
- **Stop Reason:** ${state.stopReason}
- **Initiated By:** ${state.stopInitiatedBy}
- **Stop Time:** ${new Date(state.stopTimestamp!).toLocaleString()}
- **Pending Rollback Operations:** ${state.rollbackOperations.size}

## Immediate Actions Required

1. **🔍 Investigate the root cause:**
   - Check application logs for errors
   - Verify Optimizely service status
   - Review recent flag changes

2. **🛠️ Take corrective action:**
   - Fix any identified issues
   - Verify flag configurations
   - Test critical functionality

3. **✅ Clear emergency state:**
   - When ready to resume: Add comment \`/clear-emergency\`
   - Or use workflow dispatch to clear emergency state

## Rollback Options
${
      state.rollbackOperations.size > 0
        ? `- **Available Rollback Operations:** ${state.rollbackOperations.size}
- **Rollback Window:** 24 hours from operation time
- **Requires Approval:** Yes (configured)
- To execute rollback: Add comment \`/rollback [operation-ids]\``
        : "No rollback operations available"
    }

## Prevention
- Review override configuration in \`.github/optimizely/overrides.json\`
- Update emergency stop conditions if needed
- Consider additional monitoring and alerting

---
**⚠️ This is an automated emergency response. Manual intervention required.**
**🔗 For more information, see the [Emergency Procedures Documentation](docs/emergency-procedures.md)**`;
  }

  /**
   * Performs the actual rollback of a flag operation.
   * This is a placeholder for the actual rollback implementation.
   */
  private async performFlagRollback(operation: RollbackOperation): Promise<boolean> {
    // TODO: Implement actual rollback logic with OptimizelyApiClient
    // This would restore the flag to its previous state based on operation.previousState

    logger.info("Performing rollback operation", {
      flagKey: operation.flagKey,
      operation: operation.operation,
      previousState: operation.previousState,
    });

    // Placeholder implementation
    await new Promise((resolve) => setTimeout(resolve, 100));
    return true; // Assume success for now
  }

  /**
   * Sends notifications after rollback operations.
   */
  private sendRollbackNotifications(
    results: Array<{
      id: string;
      flagKey: string;
      status: "success" | "failed" | "skipped";
      error?: string;
    }>,
  ): void {
    logger.info("Sending rollback completion notifications", {
      totalResults: results.length,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
    });

    // TODO: Implement actual notification sending
    // This would integrate with configured notification channels
  }
}

/**
 * Default instance of the emergency control manager.
 */
export const emergencyControlManager = new EmergencyControlManager();
