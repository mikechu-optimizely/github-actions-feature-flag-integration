/**
 * Override audit and compliance tracker for monitoring override activities.
 * Provides comprehensive logging and reporting for all override-related activities.
 */

import { ApprovalRequest, ApprovalResponse } from "./approval-workflow-manager.ts";
import { EmergencyStopReason, RollbackOperation } from "./emergency-control-manager.ts";
import { ExclusionRule, PatternExclusionRule } from "../types/config.ts";
import * as logger from "./logger.ts";

/**
 * Override activity event types.
 */
export enum OverrideActivityType {
  EXCLUSION_RULE_APPLIED = "exclusion_rule_applied",
  APPROVAL_REQUESTED = "approval_requested",
  APPROVAL_GRANTED = "approval_granted",
  APPROVAL_DENIED = "approval_denied",
  APPROVAL_EXPIRED = "approval_expired",
  EMERGENCY_STOP_TRIGGERED = "emergency_stop_triggered",
  EMERGENCY_CLEARED = "emergency_cleared",
  ROLLBACK_INITIATED = "rollback_initiated",
  ROLLBACK_COMPLETED = "rollback_completed",
  ROLLBACK_FAILED = "rollback_failed",
  OVERRIDE_CONFIG_UPDATED = "override_config_updated",
  BYPASS_USED = "bypass_used",
}

/**
 * Override activity event structure.
 */
export interface OverrideActivityEvent {
  id: string;
  timestamp: string;
  type: OverrideActivityType;
  actor: string; // GitHub username or system identifier
  flagKey?: string;
  details: {
    reason?: string;
    approvers?: string[];
    decision?: "approved" | "rejected" | "expired";
    riskLevel?: "low" | "medium" | "high";
    bypassReason?: string;
    rollbackOperations?: number;
    configChanges?: unknown;
    metadata?: Record<string, unknown>;
  };
  compliance: {
    requiresReview: boolean;
    riskScore: number; // 0-100
    auditFlag: "normal" | "attention" | "critical";
  };
}

/**
 * Override usage statistics.
 */
export interface OverrideUsageStats {
  totalExclusions: number;
  permanentExclusions: number;
  temporaryExclusions: number;
  patternExclusions: number;
  totalApprovals: number;
  approvalRate: number; // percentage of approvals vs rejections
  avgApprovalTime: number; // in hours
  emergencyStops: number;
  rollbackOperations: number;
  bypassUsage: number;
  highRiskActivities: number;
}

/**
 * Compliance report for override activities.
 */
export interface OverrideComplianceReport {
  reportId: string;
  timestamp: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalActivities: number;
    criticalActivities: number;
    complianceScore: number; // 0-100
    riskLevel: "low" | "medium" | "high";
  };
  statistics: OverrideUsageStats;
  flagActivityBreakdown: Map<string, {
    totalActivities: number;
    exclusions: number;
    approvals: number;
    emergencyActions: number;
    lastActivity: string;
  }>;
  recommendations: string[];
  issues: Array<{
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    flagsAffected: string[];
    recommendation: string;
  }>;
}

/**
 * Override audit and compliance tracker.
 */
export class OverrideAuditTracker {
  private events: OverrideActivityEvent[] = [];
  private auditFilePath: string;

  constructor(auditFilePath: string = "reports/override-audit.jsonl") {
    this.auditFilePath = auditFilePath;
  }

  /**
   * Records an exclusion rule being applied.
   */
  async recordExclusionApplied(
    flagKey: string,
    rule: ExclusionRule | PatternExclusionRule,
    actor: string = "system",
  ): Promise<void> {
    const event: OverrideActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: OverrideActivityType.EXCLUSION_RULE_APPLIED,
      actor,
      flagKey,
      details: {
        reason: rule.reason,
        metadata: {
          ruleType: "pattern" in rule ? "pattern" : "direct",
          pattern: "pattern" in rule ? rule.pattern : undefined,
          tags: rule.tags,
          addedBy: rule.addedBy,
          expiresAt: rule.expiresAt,
        },
      },
      compliance: {
        requiresReview: false,
        riskScore: this.calculateRiskScore("exclusion", rule),
        auditFlag: "normal",
      },
    };

    await this.recordEvent(event);
  }

  /**
   * Records an approval request event.
   */
  async recordApprovalRequest(
    request: ApprovalRequest,
    actor: string = "system",
  ): Promise<void> {
    const event: OverrideActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: OverrideActivityType.APPROVAL_REQUESTED,
      actor,
      flagKey: request.flagKey,
      details: {
        reason: request.metadata.reason,
        approvers: request.rule.approvers,
        riskLevel: request.metadata.riskLevel,
        metadata: {
          approvalId: request.id,
          requiresAllApprovers: request.rule.requiresAllApprovers,
          approvalType: request.rule.approvalType,
        },
      },
      compliance: {
        requiresReview: request.metadata.riskLevel === "high",
        riskScore: this.calculateRiskScore("approval_request", request),
        auditFlag: request.metadata.riskLevel === "high" ? "attention" : "normal",
      },
    };

    await this.recordEvent(event);
  }

  /**
   * Records an approval response (granted or denied).
   */
  async recordApprovalResponse(
    flagKey: string,
    response: ApprovalResponse,
    finalDecision?: "approved" | "rejected",
  ): Promise<void> {
    const event: OverrideActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: response.decision === "approved"
        ? OverrideActivityType.APPROVAL_GRANTED
        : OverrideActivityType.APPROVAL_DENIED,
      actor: response.approver,
      flagKey,
      details: {
        decision: response.decision,
        reason: response.comment || "No comment provided",
        metadata: {
          responseTimestamp: response.timestamp,
          finalDecision,
        },
      },
      compliance: {
        requiresReview: response.decision === "rejected",
        riskScore: response.decision === "rejected" ? 60 : 20,
        auditFlag: response.decision === "rejected" ? "attention" : "normal",
      },
    };

    await this.recordEvent(event);
  }

  /**
   * Records emergency stop activation.
   */
  async recordEmergencyStop(
    reason: EmergencyStopReason,
    initiatedBy: string,
    affectedOperations: number = 0,
  ): Promise<void> {
    const event: OverrideActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: OverrideActivityType.EMERGENCY_STOP_TRIGGERED,
      actor: initiatedBy,
      details: {
        reason: reason.toString(),
        metadata: {
          affectedOperations,
          emergencyReason: reason,
        },
      },
      compliance: {
        requiresReview: true,
        riskScore: 90,
        auditFlag: "critical",
      },
    };

    await this.recordEvent(event);
  }

  /**
   * Records rollback operation completion.
   */
  async recordRollbackComplete(
    operations: RollbackOperation[],
    results: { successful: number; failed: number; skipped: number },
    initiatedBy: string,
  ): Promise<void> {
    const event: OverrideActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: OverrideActivityType.ROLLBACK_COMPLETED,
      actor: initiatedBy,
      details: {
        reason: "Rollback operations executed",
        rollbackOperations: operations.length,
        metadata: {
          successful: results.successful,
          failed: results.failed,
          skipped: results.skipped,
          flagsAffected: operations.map((op) => op.flagKey),
        },
      },
      compliance: {
        requiresReview: results.failed > 0,
        riskScore: results.failed > 0 ? 70 : 40,
        auditFlag: results.failed > 0 ? "attention" : "normal",
      },
    };

    await this.recordEvent(event);
  }

  /**
   * Records bypass usage (emergency or otherwise).
   */
  async recordBypassUsage(
    flagKey: string,
    bypassType: "emergency" | "manual",
    reason: string,
    actor: string,
  ): Promise<void> {
    const event: OverrideActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: OverrideActivityType.BYPASS_USED,
      actor,
      flagKey,
      details: {
        reason,
        bypassReason: `${bypassType} bypass`,
        metadata: {
          bypassType,
        },
      },
      compliance: {
        requiresReview: true,
        riskScore: bypassType === "emergency" ? 80 : 60,
        auditFlag: "attention",
      },
    };

    await this.recordEvent(event);
  }

  /**
   * Generates comprehensive compliance report for a given time period.
   */
  generateComplianceReport(
    startDate: string,
    endDate: string,
  ): OverrideComplianceReport {
    const filteredEvents = this.events.filter((event) => {
      const eventTime = new Date(event.timestamp);
      return eventTime >= new Date(startDate) && eventTime <= new Date(endDate);
    });

    const statistics = this.calculateUsageStatistics(filteredEvents);
    const flagBreakdown = this.calculateFlagActivityBreakdown(filteredEvents);
    const issues = this.identifyComplianceIssues(filteredEvents);
    const recommendations = this.generateRecommendations(statistics, issues);

    const complianceScore = this.calculateComplianceScore(statistics, issues);
    const riskLevel = this.determineRiskLevel(complianceScore, issues);

    const report: OverrideComplianceReport = {
      reportId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      period: { startDate, endDate },
      summary: {
        totalActivities: filteredEvents.length,
        criticalActivities:
          filteredEvents.filter((e) => e.compliance.auditFlag === "critical").length,
        complianceScore,
        riskLevel,
      },
      statistics,
      flagActivityBreakdown: flagBreakdown,
      recommendations,
      issues,
    };

    // Log report generation
    logger.info("Override compliance report generated", {
      reportId: report.reportId,
      period: report.period,
      totalActivities: report.summary.totalActivities,
      complianceScore: report.summary.complianceScore,
      riskLevel: report.summary.riskLevel,
    });

    return report;
  }

  /**
   * Records an event to the audit trail.
   */
  private async recordEvent(event: OverrideActivityEvent): Promise<void> {
    this.events.push(event);

    // Write to audit file
    try {
      await Deno.mkdir("reports", { recursive: true });
      const auditLine = JSON.stringify(event) + "\n";
      await Deno.writeTextFile(this.auditFilePath, auditLine, { append: true });
    } catch (error) {
      logger.error("Failed to write audit event", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.debug("Override activity recorded", {
      eventId: event.id,
      type: event.type,
      actor: event.actor,
      flagKey: event.flagKey,
      riskScore: event.compliance.riskScore,
    });
  }

  /**
   * Calculates risk score for different types of activities.
   */
  private calculateRiskScore(
    activityType: string,
    context: unknown,
  ): number {
    // Base risk scores
    const baseScores = {
      exclusion: 30,
      approval_request: 50,
      approval_granted: 20,
      approval_denied: 60,
      emergency_stop: 90,
      rollback: 70,
      bypass: 80,
    };

    let baseScore = baseScores[activityType as keyof typeof baseScores] || 40;

    // Adjust based on context (this is simplified - real implementation would be more sophisticated)
    if (typeof context === "object" && context !== null) {
      const ctx = context as Record<string, unknown>;
      if (ctx.riskLevel === "high") baseScore += 20;
      if (ctx.riskLevel === "low") baseScore -= 10;
    }

    return Math.min(100, Math.max(0, baseScore));
  }

  /**
   * Calculates usage statistics from events.
   */
  private calculateUsageStatistics(events: OverrideActivityEvent[]): OverrideUsageStats {
    const exclusions = events.filter((e) => e.type === OverrideActivityType.EXCLUSION_RULE_APPLIED);
    const approvals = events.filter((e) =>
      e.type === OverrideActivityType.APPROVAL_GRANTED ||
      e.type === OverrideActivityType.APPROVAL_DENIED
    );
    const approved = events.filter((e) => e.type === OverrideActivityType.APPROVAL_GRANTED);
    const emergencyStops = events.filter((e) =>
      e.type === OverrideActivityType.EMERGENCY_STOP_TRIGGERED
    );
    const rollbacks = events.filter((e) => e.type === OverrideActivityType.ROLLBACK_COMPLETED);
    const bypasses = events.filter((e) => e.type === OverrideActivityType.BYPASS_USED);
    const highRisk = events.filter((e) => e.compliance.riskScore >= 70);

    return {
      totalExclusions: exclusions.length,
      permanentExclusions: exclusions.filter((e) => !e.details.metadata?.expiresAt).length,
      temporaryExclusions: exclusions.filter((e) => e.details.metadata?.expiresAt).length,
      patternExclusions:
        exclusions.filter((e) => e.details.metadata?.ruleType === "pattern").length,
      totalApprovals: approvals.length,
      approvalRate: approvals.length > 0 ? (approved.length / approvals.length) * 100 : 0,
      avgApprovalTime: 0, // Would calculate based on request/response timing
      emergencyStops: emergencyStops.length,
      rollbackOperations: rollbacks.length,
      bypassUsage: bypasses.length,
      highRiskActivities: highRisk.length,
    };
  }

  /**
   * Calculates per-flag activity breakdown.
   */
  private calculateFlagActivityBreakdown(
    events: OverrideActivityEvent[],
  ): Map<string, {
    totalActivities: number;
    exclusions: number;
    approvals: number;
    emergencyActions: number;
    lastActivity: string;
  }> {
    const breakdown = new Map();

    events.forEach((event) => {
      if (!event.flagKey) return;

      const existing = breakdown.get(event.flagKey) || {
        totalActivities: 0,
        exclusions: 0,
        approvals: 0,
        emergencyActions: 0,
        lastActivity: event.timestamp,
      };

      existing.totalActivities++;

      if (event.type === OverrideActivityType.EXCLUSION_RULE_APPLIED) {
        existing.exclusions++;
      } else if (
        [
          OverrideActivityType.APPROVAL_REQUESTED,
          OverrideActivityType.APPROVAL_GRANTED,
          OverrideActivityType.APPROVAL_DENIED,
        ].includes(event.type)
      ) {
        existing.approvals++;
      } else if (
        [
          OverrideActivityType.EMERGENCY_STOP_TRIGGERED,
          OverrideActivityType.ROLLBACK_COMPLETED,
        ].includes(event.type)
      ) {
        existing.emergencyActions++;
      }

      if (new Date(event.timestamp) > new Date(existing.lastActivity)) {
        existing.lastActivity = event.timestamp;
      }

      breakdown.set(event.flagKey, existing);
    });

    return breakdown;
  }

  /**
   * Identifies compliance issues from events.
   */
  private identifyComplianceIssues(events: OverrideActivityEvent[]): Array<{
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    flagsAffected: string[];
    recommendation: string;
  }> {
    const issues = [];

    // Critical issues
    const criticalEvents = events.filter((e) => e.compliance.auditFlag === "critical");
    if (criticalEvents.length > 0) {
      issues.push({
        severity: "critical" as const,
        description: `${criticalEvents.length} critical override activities detected`,
        flagsAffected: criticalEvents.map((e) => e.flagKey || "unknown").filter((k) =>
          k !== "unknown"
        ),
        recommendation: "Immediate review required for all critical activities",
      });
    }

    // High bypass usage
    const bypasses = events.filter((e) => e.type === OverrideActivityType.BYPASS_USED);
    if (bypasses.length > 5) {
      issues.push({
        severity: "high" as const,
        description: `High bypass usage detected (${bypasses.length} instances)`,
        flagsAffected: bypasses.map((e) => e.flagKey || "unknown").filter((k) => k !== "unknown"),
        recommendation: "Review bypass policies and consider stricter controls",
      });
    }

    return issues;
  }

  /**
   * Generates recommendations based on statistics and issues.
   */
  private generateRecommendations(
    stats: OverrideUsageStats,
    issues: Array<{ severity: string; description: string; recommendation: string }>,
  ): string[] {
    const recommendations: string[] = [];

    if (stats.highRiskActivities > 10) {
      recommendations.push(
        "Consider implementing additional approval layers for high-risk activities",
      );
    }

    if (stats.emergencyStops > 2) {
      recommendations.push("Review emergency stop triggers and consider improving monitoring");
    }

    if (stats.approvalRate < 70) {
      recommendations.push(
        "Low approval rate detected - review override policies and communication",
      );
    }

    if (stats.bypassUsage > 5) {
      recommendations.push("High bypass usage - consider reviewing bypass policies");
    }

    // Add issue-specific recommendations
    issues.forEach((issue) => {
      if (!recommendations.includes(issue.recommendation)) {
        recommendations.push(issue.recommendation);
      }
    });

    return recommendations;
  }

  /**
   * Calculates overall compliance score.
   */
  private calculateComplianceScore(
    stats: OverrideUsageStats,
    issues: Array<{ severity: string }>,
  ): number {
    let score = 100;

    // Deduct points for issues
    issues.forEach((issue) => {
      switch (issue.severity) {
        case "critical":
          score -= 25;
          break;
        case "high":
          score -= 15;
          break;
        case "medium":
          score -= 10;
          break;
        case "low":
          score -= 5;
          break;
      }
    });

    // Deduct points for high-risk activities
    score -= Math.min(20, stats.highRiskActivities * 2);
    score -= Math.min(15, stats.bypassUsage * 3);
    score -= Math.min(10, stats.emergencyStops * 5);

    return Math.max(0, score);
  }

  /**
   * Determines overall risk level based on score and issues.
   */
  private determineRiskLevel(
    complianceScore: number,
    issues: Array<{ severity: string }>,
  ): "low" | "medium" | "high" {
    const hasCritical = issues.some((i) => i.severity === "critical");
    const hasHigh = issues.some((i) => i.severity === "high");

    if (hasCritical || complianceScore < 60) return "high";
    if (hasHigh || complianceScore < 80) return "medium";
    return "low";
  }
}

/**
 * Default instance of the override audit tracker.
 */
export const overrideAuditTracker = new OverrideAuditTracker();
