import { FlagUsage } from "./code-analysis.ts";
import * as logger from "../utils/logger.ts";

/**
 * Represents a comprehensive flag usage report.
 */
export interface FlagUsageReport {
  timestamp: string;
  totalFlags: number;
  usedFlags: number;
  unusedFlags: number;
  flagUsages: Map<string, FlagUsage[]>;
  unusedFlagKeys: string[];
  summary: {
    usageRate: number;
    flagsByFile: Map<string, string[]>;
    mostUsedFlags: Array<{ flag: string; count: number }>;
  };
}

/**
 * Represents a delta report comparing two flag usage states.
 */
export interface FlagDeltaReport {
  timestamp: string;
  newFlags: string[];
  removedFlags: string[];
  changedUsages: Map<string, {
    added: FlagUsage[];
    removed: FlagUsage[];
  }>;
}

/**
 * Generates comprehensive flag usage reports and identifies unused flags.
 */
export class FlagUsageReporter {
  /**
   * Generates a detailed flag usage report.
   * @param flagKeys Array of all flag keys from Optimizely
   * @param flagUsages Map of flag usages found in codebase
   * @returns Comprehensive usage report
   */
  generateUsageReport(
    flagKeys: string[],
    flagUsages: Map<string, FlagUsage[]>,
  ): FlagUsageReport {
    const timestamp = new Date().toISOString();
    const usedFlags = Array.from(flagUsages.keys()).filter(
      (key) => flagUsages.get(key)!.length > 0,
    );
    const unusedFlags = flagKeys.filter((key) => !usedFlags.includes(key));

    // Calculate usage statistics
    const flagsByFile = new Map<string, string[]>();
    const flagUsageCounts = new Map<string, number>();

    for (const [flag, usages] of flagUsages) {
      flagUsageCounts.set(flag, usages.length);

      for (const usage of usages) {
        if (!flagsByFile.has(usage.file)) {
          flagsByFile.set(usage.file, []);
        }
        if (!flagsByFile.get(usage.file)!.includes(flag)) {
          flagsByFile.get(usage.file)!.push(flag);
        }
      }
    }

    // Sort flags by usage count
    const mostUsedFlags = Array.from(flagUsageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([flag, count]) => ({ flag, count }));

    const report: FlagUsageReport = {
      timestamp,
      totalFlags: flagKeys.length,
      usedFlags: usedFlags.length,
      unusedFlags: unusedFlags.length,
      flagUsages,
      unusedFlagKeys: unusedFlags,
      summary: {
        usageRate: flagKeys.length > 0 ? (usedFlags.length / flagKeys.length) * 100 : 0,
        flagsByFile,
        mostUsedFlags,
      },
    };

    logger.info(
      `Generated usage report: ${usedFlags.length}/${flagKeys.length} flags in use`,
    );

    return report;
  }

  /**
   * Generates a delta report comparing current and previous flag usage.
   * @param currentUsages Current flag usages
   * @param previousUsages Previous flag usages
   * @returns Delta report
   */
  generateDeltaReport(
    currentUsages: Map<string, FlagUsage[]>,
    previousUsages: Map<string, FlagUsage[]>,
  ): FlagDeltaReport {
    const timestamp = new Date().toISOString();
    const currentFlags = new Set(currentUsages.keys());
    const previousFlags = new Set(previousUsages.keys());

    const newFlags = Array.from(currentFlags).filter((flag) => !previousFlags.has(flag));
    const removedFlags = Array.from(previousFlags).filter((flag) => !currentFlags.has(flag));
    const changedUsages = new Map<
      string,
      { added: FlagUsage[]; removed: FlagUsage[] }
    >();

    // Find changed usages for existing flags
    for (const flag of currentFlags) {
      if (!previousFlags.has(flag)) continue;

      const current = currentUsages.get(flag) || [];
      const previous = previousUsages.get(flag) || [];

      const added = current.filter((usage) =>
        !previous.some((prev) =>
          prev.file === usage.file &&
          prev.line === usage.line &&
          prev.context === usage.context
        )
      );

      const removed = previous.filter((usage) =>
        !current.some((curr) =>
          curr.file === usage.file &&
          curr.line === usage.line &&
          curr.context === usage.context
        )
      );

      if (added.length > 0 || removed.length > 0) {
        changedUsages.set(flag, { added, removed });
      }
    }

    const report: FlagDeltaReport = {
      timestamp,
      newFlags,
      removedFlags,
      changedUsages,
    };

    logger.info(
      `Generated delta report: ${newFlags.length} new, ${removedFlags.length} removed, ${changedUsages.size} changed`,
    );

    return report;
  }

  /**
   * Exports usage report to JSON format.
   * @param report Usage report
   * @returns JSON string
   */
  exportToJson(report: FlagUsageReport | FlagDeltaReport): string {
    return JSON.stringify(report, (_key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }, 2);
  }

  /**
   * Exports usage report to CSV format.
   * @param report Usage report
   * @returns CSV string
   */
  exportToCsv(report: FlagUsageReport): string {
    const lines: string[] = [];
    lines.push("Flag,File,Line,Context,Status");

    for (const [flag, usages] of report.flagUsages) {
      if (usages.length === 0) {
        lines.push(`${flag},,,,"UNUSED"`);
      } else {
        for (const usage of usages) {
          const escapedContext = usage.context.replace(/"/g, '""');
          lines.push(
            `${flag},"${usage.file}",${usage.line},"${escapedContext}","USED"`,
          );
        }
      }
    }

    for (const flag of report.unusedFlagKeys) {
      lines.push(`${flag},,,,"UNUSED"`);
    }

    return lines.join("\n");
  }

  /**
   * Generates a human-readable summary of the usage report.
   * @param report Usage report
   * @returns Formatted summary string
   */
  generateSummary(report: FlagUsageReport): string {
    const summary = [];
    summary.push(`# Feature Flag Usage Report`);
    summary.push(`Generated: ${report.timestamp}`);
    summary.push(``);
    summary.push(`## Summary`);
    summary.push(`- Total flags: ${report.totalFlags}`);
    summary.push(`- Used flags: ${report.usedFlags}`);
    summary.push(`- Unused flags: ${report.unusedFlags}`);
    summary.push(`- Usage rate: ${report.summary.usageRate.toFixed(1)}%`);
    summary.push(``);

    if (report.unusedFlagKeys.length > 0) {
      summary.push(`## Unused Flags (${report.unusedFlagKeys.length})`);
      for (const flag of report.unusedFlagKeys) {
        summary.push(`- ${flag}`);
      }
      summary.push(``);
    }

    if (report.summary.mostUsedFlags.length > 0) {
      summary.push(`## Most Used Flags`);
      for (const { flag, count } of report.summary.mostUsedFlags) {
        summary.push(`- ${flag}: ${count} usage${count !== 1 ? "s" : ""}`);
      }
      summary.push(``);
    }

    if (report.summary.flagsByFile.size > 0) {
      summary.push(`## Flags by File`);
      for (const [file, flags] of report.summary.flagsByFile) {
        summary.push(`- ${file}: ${flags.join(", ")}`);
      }
    }

    return summary.join("\n");
  }
}
