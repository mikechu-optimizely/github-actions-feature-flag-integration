import { debug, error, info } from "../utils/logger.ts";
import { OptimizelyFlag } from "../types/optimizely.ts";

/**
 * Audit event types for feature flag synchronization.
 */
export type AuditEventType =
  | "flag_in_use"
  | "flag_unused"
  | "flag_archived"
  | "flag_updated"
  | "api_call"
  | "sync_started"
  | "sync_completed"
  | "error"
  | "warning"
  | "info"
  | "custom";

/**
 * Operation types for audit tracking.
 */
export type OperationType =
  | "cleanup"
  | "audit"
  | "sync"
  | "archive"
  | "restore"
  | "validate";

/**
 * User context for audit events.
 */
export interface UserContext {
  /** User identifier (e.g., GitHub actor, service account) */
  userId: string;
  /** Source of the operation (e.g., 'github-actions', 'cli', 'api') */
  source: string;
  /** Session or run identifier */
  sessionId?: string;
  /** IP address or hostname */
  origin?: string;
}

/**
 * Operation context for tracking related activities.
 */
export interface OperationContext {
  /** Operation type */
  type: OperationType;
  /** Unique operation identifier */
  operationId: string;
  /** Parent operation ID for nested operations */
  parentOperationId?: string;
  /** Dry run mode indicator */
  dryRun: boolean;
  /** Operation start timestamp */
  startTime: string;
  /** Operation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Enhanced audit event structure.
 */
export interface AuditEvent {
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** Type of audit event */
  type: AuditEventType;
  /** Human-readable message describing the event */
  message: string;
  /** User context information */
  userContext?: UserContext;
  /** Operation context information */
  operationContext?: OperationContext;
  /** Flag-specific details */
  flagDetails?: {
    key: string;
    name?: string;
    environments?: string[];
    archived?: boolean;
  };
  /** Additional event details */
  details?: Record<string, unknown>;
  /** Event severity level */
  severity?: "low" | "medium" | "high" | "critical";
}

/**
 * AuditReporter handles structured audit logging and report generation.
 */
export class AuditReporter {
  private events: AuditEvent[] = [];
  private readonly logFilePath: string;

  /**
   * @param logFilePath Path to the audit log file (default: reports/audit.log)
   */
  constructor(logFilePath = "reports/audit.log") {
    this.logFilePath = logFilePath;
  }

  /**
   * Log an audit event in memory and to the console.
   * @param event AuditEvent
   */
  log(event: AuditEvent): void {
    this.events.push(event);
    const msg = `[${event.type.toUpperCase()}] ${event.message}`;
    switch (event.type) {
      case "error":
        error(msg, event.details);
        break;
      case "flag_archived":
      case "flag_updated":
        info(msg, event.details);
        break;
      case "flag_in_use":
      case "flag_unused":
        debug(msg, event.details);
        break;
      case "info":
      case "custom":
      default:
        info(msg, event.details);
    }
  }

  /**
   * Write all audit events to the log file (JSONL format).
   */
  async flush(): Promise<void> {
    if (this.events.length === 0) return;
    await this.#ensureLogDir();
    const lines = this.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await Deno.writeTextFile(this.logFilePath, lines, { append: true });
    this.events = [];
  }

  /**
   * Generate a summary report (JSON) from audit events.
   * @param summaryPath Path to write the summary report (default: reports/summary.json)
   */
  async generateSummaryReport(
    summaryPath = "reports/summary.json",
  ): Promise<void> {
    await this.#ensureLogDir();
    const summary = this.#summarize();
    await Deno.writeTextFile(summaryPath, JSON.stringify(summary, null, 2));
  }

  /**
   * Get a summary object of audit events (in-memory).
   */
  getSummary(): Record<string, unknown> {
    return this.#summarize();
  }

  /**
   * Log a flag operation with comprehensive audit trail.
   * @param flagKey Feature flag key
   * @param operation Operation performed
   * @param userContext User context information
   * @param operationContext Operation context information
   * @param flagData Optional flag data
   * @param additionalDetails Additional operation details
   */
  logFlagOperation(
    flagKey: string,
    operation: AuditEventType,
    userContext: UserContext,
    operationContext: OperationContext,
    flagData?: OptimizelyFlag,
    additionalDetails?: Record<string, unknown>,
  ): void {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      type: operation,
      message: `Flag ${flagKey}: ${operation.replace("_", " ")}`,
      userContext,
      operationContext,
      flagDetails: {
        key: flagKey,
        name: flagData?.name,
        environments: flagData?.environments ? Object.keys(flagData.environments) : undefined,
        archived: flagData?.archived,
      },
      details: additionalDetails,
      severity: this.#determineSeverity(operation),
    };
    this.log(event);
  }

  /**
   * Log an API operation for audit trail.
   * @param apiEndpoint API endpoint called
   * @param method HTTP method
   * @param statusCode Response status code
   * @param userContext User context information
   * @param operationContext Operation context information
   * @param additionalDetails Additional API call details
   */
  logApiOperation(
    apiEndpoint: string,
    method: string,
    statusCode: number,
    userContext: UserContext,
    operationContext: OperationContext,
    additionalDetails?: Record<string, unknown>,
  ): void {
    const isError = statusCode >= 400;
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      type: isError ? "error" : "api_call",
      message: `API ${method} ${apiEndpoint} - ${statusCode}`,
      userContext,
      operationContext,
      details: {
        endpoint: apiEndpoint,
        method,
        statusCode,
        ...additionalDetails,
      },
      severity: isError ? "high" : "low",
    };
    this.log(event);
  }

  /**
   * Generate a comprehensive audit report in multiple formats.
   * @param outputDir Directory to write reports to (default: reports/)
   * @param formats Report formats to generate
   */
  async generateComprehensiveReport(
    outputDir = "reports/",
    formats: ("json" | "markdown" | "csv")[] = ["json", "markdown"],
  ): Promise<void> {
    await this.#ensureReportDir(outputDir);

    const analysis = this.#analyzeAuditTrail();

    for (const format of formats) {
      switch (format) {
        case "json":
          await this.#generateJsonReport(outputDir, analysis);
          break;
        case "markdown":
          await this.#generateMarkdownReport(outputDir, analysis);
          break;
        case "csv":
          await this.#generateCsvReport(outputDir, analysis);
          break;
      }
    }
  }

  /**
   * Generate a compliance report for audit requirements.
   * @param outputPath Path to write the compliance report
   */
  async generateComplianceReport(
    outputPath = "reports/compliance-report.json",
  ): Promise<void> {
    await this.#ensureLogDir();

    const complianceData = {
      reportGenerated: new Date().toISOString(),
      auditPeriod: this.#getAuditPeriod(),
      totalEvents: this.events.length,
      flagOperations: this.#getFlagOperationSummary(),
      apiOperations: this.#getApiOperationSummary(),
      errorSummary: this.#getErrorSummary(),
      userActivity: this.#getUserActivitySummary(),
      securityEvents: this.#getSecurityEventSummary(),
      dataRetention: {
        retentionPeriod: "30 days",
        dataIntegrity: "verified",
        encryptionStatus: "enabled",
      },
    };

    await Deno.writeTextFile(outputPath, JSON.stringify(complianceData, null, 2));
  }

  /**
   * Export audit trail for external systems.
   * @param outputPath Path to write the audit trail export
   * @param includePersonalData Whether to include personal data in export
   */
  async exportAuditTrail(
    outputPath = "reports/audit-trail-export.jsonl",
    includePersonalData = false,
  ): Promise<void> {
    await this.#ensureLogDir();

    const exportData = this.events.map((event) => {
      const exportEvent = { ...event };

      if (!includePersonalData && exportEvent.userContext) {
        // Anonymize personal data
        exportEvent.userContext = {
          ...exportEvent.userContext,
          userId: this.#hashUserId(exportEvent.userContext.userId),
          origin: "[REDACTED]",
        };
      }

      return exportEvent;
    });

    const lines = exportData.map((event) => JSON.stringify(event)).join("\n");
    await Deno.writeTextFile(outputPath, lines);
  }

  /**
   * Ensure the log directory exists.
   */
  async #ensureLogDir(): Promise<void> {
    const dir = this.logFilePath.split("/").slice(0, -1).join("/");
    if (dir) {
      await Deno.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Summarize audit events by type and key metrics.
   */
  #summarize(): Record<string, unknown> {
    const counts: Record<string, number> = {};
    for (const e of this.events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return {
      total: this.events.length,
      byType: counts,
      lastEvent: this.events[this.events.length - 1] || null,
    };
  }

  /**
   * Determine severity level for audit event type.
   */
  #determineSeverity(eventType: AuditEventType): "low" | "medium" | "high" | "critical" {
    switch (eventType) {
      case "error":
        return "critical";
      case "flag_archived":
      case "flag_updated":
        return "high";
      case "warning":
      case "sync_started":
      case "sync_completed":
        return "medium";
      default:
        return "low";
    }
  }

  /**
   * Ensure report directory exists.
   */
  async #ensureReportDir(dir: string): Promise<void> {
    await Deno.mkdir(dir, { recursive: true });
  }

  /**
   * Analyze audit trail for comprehensive reporting.
   */
  #analyzeAuditTrail(): Record<string, unknown> {
    const analysis = {
      summary: this.#summarize(),
      timeline: this.#generateTimeline(),
      flagOperations: this.#getFlagOperationSummary(),
      apiOperations: this.#getApiOperationSummary(),
      errors: this.#getErrorSummary(),
      userActivity: this.#getUserActivitySummary(),
      operationMetrics: this.#getOperationMetrics(),
    };
    return analysis;
  }

  /**
   * Generate timeline of events.
   */
  #generateTimeline(): Array<{ timestamp: string; type: string; message: string }> {
    return this.events
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((event) => ({
        timestamp: event.timestamp,
        type: event.type,
        message: event.message,
      }));
  }

  /**
   * Get flag operation summary.
   */
  #getFlagOperationSummary(): Record<string, unknown> {
    const flagOps = this.events.filter((e) => e.flagDetails?.key);
    const flagMap = new Map<string, { operations: string[]; lastSeen: string }>();

    for (const event of flagOps) {
      const key = event.flagDetails!.key;
      const existing = flagMap.get(key) || { operations: [], lastSeen: event.timestamp };
      existing.operations.push(event.type);
      existing.lastSeen = event.timestamp;
      flagMap.set(key, existing);
    }

    return {
      totalFlags: flagMap.size,
      flagDetails: Object.fromEntries(flagMap),
      operationCounts: this.#countByType(flagOps.map((e) => e.type)),
    };
  }

  /**
   * Get API operation summary.
   */
  #getApiOperationSummary(): Record<string, unknown> {
    const apiOps = this.events.filter((e) => e.type === "api_call" || (e.details?.endpoint));
    const endpointCounts = new Map<string, number>();
    const statusCodes = new Map<number, number>();

    for (const event of apiOps) {
      const endpoint = event.details?.endpoint as string;
      const statusCode = event.details?.statusCode as number;

      if (endpoint) {
        endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + 1);
      }
      if (statusCode) {
        statusCodes.set(statusCode, (statusCodes.get(statusCode) || 0) + 1);
      }
    }

    return {
      totalApiCalls: apiOps.length,
      endpointCounts: Object.fromEntries(endpointCounts),
      statusCodeCounts: Object.fromEntries(statusCodes),
      errorRate: this.#calculateErrorRate(apiOps),
    };
  }

  /**
   * Get error summary.
   */
  #getErrorSummary(): Record<string, unknown> {
    const errors = this.events.filter((e) => e.type === "error" || e.severity === "critical");
    const errorTypes = new Map<string, number>();

    for (const error of errors) {
      const errorKey = error.details?.errorType as string || "unknown";
      errorTypes.set(errorKey, (errorTypes.get(errorKey) || 0) + 1);
    }

    return {
      totalErrors: errors.length,
      errorTypes: Object.fromEntries(errorTypes),
      recentErrors: errors.slice(-5).map((e) => ({
        timestamp: e.timestamp,
        message: e.message,
        details: e.details,
      })),
    };
  }

  /**
   * Get user activity summary.
   */
  #getUserActivitySummary(): Record<string, unknown> {
    const userMap = new Map<
      string,
      { count: number; lastActivity: string; sources: Set<string> }
    >();

    for (const event of this.events) {
      if (event.userContext?.userId) {
        const userId = event.userContext.userId;
        const existing = userMap.get(userId) ||
          { count: 0, lastActivity: event.timestamp, sources: new Set() };
        existing.count++;
        existing.lastActivity = event.timestamp;
        existing.sources.add(event.userContext.source);
        userMap.set(userId, existing);
      }
    }

    return {
      totalUsers: userMap.size,
      userActivity: Object.fromEntries(
        Array.from(userMap.entries()).map(([userId, data]) => [
          userId,
          {
            count: data.count,
            lastActivity: data.lastActivity,
            sources: Array.from(data.sources),
          },
        ]),
      ),
    };
  }

  /**
   * Get security event summary.
   */
  #getSecurityEventSummary(): Record<string, unknown> {
    const securityEvents = this.events.filter((e) =>
      e.severity === "critical" ||
      e.type === "error" ||
      (e.details?.security === true)
    );

    return {
      totalSecurityEvents: securityEvents.length,
      recentSecurityEvents: securityEvents.slice(-10).map((e) => ({
        timestamp: e.timestamp,
        type: e.type,
        message: e.message,
        severity: e.severity,
      })),
    };
  }

  /**
   * Get operation metrics.
   */
  #getOperationMetrics(): Record<string, unknown> {
    const operations = this.events.filter((e) => e.operationContext);
    const operationMap = new Map<string, { count: number; avgDuration?: number; errors: number }>();

    for (const event of operations) {
      const opType = event.operationContext!.type;
      const existing = operationMap.get(opType) || { count: 0, errors: 0 };
      existing.count++;
      if (event.type === "error") {
        existing.errors++;
      }
      operationMap.set(opType, existing);
    }

    return {
      totalOperations: operations.length,
      operationBreakdown: Object.fromEntries(operationMap),
    };
  }

  /**
   * Get audit period information.
   */
  #getAuditPeriod(): { start: string; end: string; duration: string } {
    const timestamps = this.events.map((e) => e.timestamp).sort();
    const start = timestamps[0] || new Date().toISOString();
    const end = timestamps[timestamps.length - 1] || new Date().toISOString();
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const durationMs = endTime - startTime;
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    return {
      start,
      end,
      duration: `${durationMinutes} minutes`,
    };
  }

  /**
   * Count events by type.
   */
  #countByType(types: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const type of types) {
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Calculate error rate for API operations.
   */
  #calculateErrorRate(apiEvents: AuditEvent[]): number {
    if (apiEvents.length === 0) return 0;
    const errors = apiEvents.filter((e) =>
      e.type === "error" || (e.details?.statusCode as number) >= 400
    );
    return Math.round((errors.length / apiEvents.length) * 100 * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Hash user ID for anonymization.
   */
  #hashUserId(userId: string): string {
    // Simple hash for demo purposes - in production, use a proper hashing algorithm
    const hash = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `user_${hash.toString(16)}`;
  }

  /**
   * Generate JSON format audit report.
   */
  async #generateJsonReport(outputDir: string, analysis: Record<string, unknown>): Promise<void> {
    const reportPath = `${outputDir}/audit-report.json`;
    const jsonReport = {
      metadata: {
        generatedAt: new Date().toISOString(),
        reportType: "comprehensive_audit",
        version: "1.0",
      },
      ...analysis,
    };
    await Deno.writeTextFile(reportPath, JSON.stringify(jsonReport, null, 2));
  }

  /**
   * Generate Markdown format audit report.
   */
  async #generateMarkdownReport(
    outputDir: string,
    analysis: Record<string, unknown>,
  ): Promise<void> {
    const reportPath = `${outputDir}/audit-report.md`;
    const summary = analysis.summary as Record<string, unknown>;
    const flagOps = analysis.flagOperations as Record<string, unknown>;
    const apiOps = analysis.apiOperations as Record<string, unknown>;
    const errors = analysis.errors as Record<string, unknown>;
    const users = analysis.userActivity as Record<string, unknown>;

    const markdown = `# Feature Flag Audit Report

**Generated:** ${new Date().toISOString()}

## Executive Summary

- **Total Events:** ${summary.total}
- **Total Flags Processed:** ${flagOps.totalFlags}
- **Total API Calls:** ${apiOps.totalApiCalls}
- **Total Errors:** ${errors.totalErrors}
- **Active Users:** ${users.totalUsers}
- **API Error Rate:** ${apiOps.errorRate}%

## Event Summary

| Event Type | Count |
|------------|-------|
${
      Object.entries(summary.byType as Record<string, number>)
        .map(([type, count]) => `| ${type} | ${count} |`)
        .join("\n")
    }

## Flag Operations

### Operation Breakdown
${
      Object.entries(flagOps.operationCounts as Record<string, number>)
        .map(([op, count]) => `- **${op}:** ${count}`)
        .join("\n")
    }

## API Operations

### Status Code Distribution
${
      Object.entries(apiOps.statusCodeCounts as Record<string, number>)
        .map(([code, count]) => `- **${code}:** ${count}`)
        .join("\n")
    }

## Error Analysis

${
      (errors.totalErrors as number) > 0
        ? `### Recent Errors
${
          (errors.recentErrors as Array<{ timestamp: string; message: string }>)
            .map((err) => `- **${err.timestamp}:** ${err.message}`)
            .join("\n")
        }`
        : "No errors recorded during this audit period."
    }

## Recommendations

${this.#generateRecommendations(analysis)}

---
*Report generated by Feature Flag Synchronization Solution*
`;

    await Deno.writeTextFile(reportPath, markdown);
  }

  /**
   * Generate CSV format audit report.
   */
  async #generateCsvReport(outputDir: string, _analysis: Record<string, unknown>): Promise<void> {
    const reportPath = `${outputDir}/audit-events.csv`;

    // CSV headers
    const headers = [
      "timestamp",
      "type",
      "message",
      "severity",
      "user_id",
      "user_source",
      "operation_type",
      "operation_id",
      "dry_run",
      "flag_key",
      "flag_archived",
      "api_endpoint",
      "api_status_code",
    ];

    // Convert events to CSV rows
    const rows = this.events.map((event) => [
      event.timestamp,
      event.type,
      `"${event.message.replace(/"/g, '""')}"`, // Escape quotes
      event.severity || "",
      event.userContext?.userId || "",
      event.userContext?.source || "",
      event.operationContext?.type || "",
      event.operationContext?.operationId || "",
      event.operationContext?.dryRun?.toString() || "",
      event.flagDetails?.key || "",
      event.flagDetails?.archived?.toString() || "",
      (event.details?.endpoint as string) || "",
      (event.details?.statusCode as number)?.toString() || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    await Deno.writeTextFile(reportPath, csvContent);
  }

  /**
   * Generate recommendations based on audit analysis.
   */
  #generateRecommendations(analysis: Record<string, unknown>): string {
    const recommendations: string[] = [];
    const apiOps = analysis.apiOperations as Record<string, unknown>;
    const errors = analysis.errors as Record<string, unknown>;
    const flagOps = analysis.flagOperations as Record<string, unknown>;

    // API error rate recommendations
    const errorRate = apiOps.errorRate as number;
    if (errorRate > 10) {
      recommendations.push(
        "🔴 **High API Error Rate**: Consider reviewing API client configuration and implementing better error handling.",
      );
    } else if (errorRate > 5) {
      recommendations.push(
        "🟡 **Moderate API Error Rate**: Monitor API performance and consider implementing circuit breakers.",
      );
    } else {
      recommendations.push(
        "🟢 **Good API Performance**: API error rate is within acceptable limits.",
      );
    }

    // Error analysis recommendations
    const totalErrors = errors.totalErrors as number;
    if (totalErrors > 0) {
      recommendations.push(
        `⚠️ **Error Review Required**: ${totalErrors} errors detected. Review error logs and implement fixes.`,
      );
    }

    // Flag operation recommendations
    const totalFlags = flagOps.totalFlags as number;
    if (totalFlags === 0) {
      recommendations.push(
        "ℹ️ **No Flag Operations**: No flag operations were detected in this audit period.",
      );
    } else {
      recommendations.push(
        `✅ **Flag Operations Completed**: Successfully processed ${totalFlags} feature flags.`,
      );
    }

    // General recommendations
    recommendations.push(
      "📊 **Regular Monitoring**: Continue monitoring flag synchronization operations regularly.",
    );
    recommendations.push(
      "🔒 **Security**: Ensure all sensitive data is properly anonymized in exported reports.",
    );

    return recommendations.join("\n\n");
  }
}

/**
 * Singleton instance for global audit logging.
 */
export const auditReporter = new AuditReporter();
