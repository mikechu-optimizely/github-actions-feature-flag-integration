import { debug, error, info } from "../utils/logger.ts";

/**
 * Audit event types for feature flag synchronization.
 */
export type AuditEventType =
  | "flag_in_use"
  | "flag_unused"
  | "flag_archived"
  | "flag_created"
  | "flag_updated"
  | "error"
  | "info"
  | "custom";

/**
 * Audit event structure.
 */
export interface AuditEvent {
  timestamp: string;
  type: AuditEventType;
  message: string;
  details?: Record<string, unknown>;
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
      case "flag_created":
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
}

/**
 * Singleton instance for global audit logging.
 */
export const auditReporter = new AuditReporter();
