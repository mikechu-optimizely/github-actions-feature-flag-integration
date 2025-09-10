/**
 * Override configuration manager for parsing and validating manual override configurations.
 * Handles loading, parsing, and validation of override configuration files from .github/ directory.
 */

import { join } from "@std/path";
import { exists } from "@std/fs";
import { parse as parseYaml } from "@std/yaml";
import {
  ApprovalRule,
  ExclusionRule,
  OverrideConfig,
  PatternExclusionRule,
  ValidationResult,
} from "../types/config.ts";

/**
 * Default override configuration paths (in order of preference).
 */
export const DEFAULT_OVERRIDE_PATHS = [
  ".github/optimizely/overrides.json",
  ".github/optimizely/overrides.yml",
  ".github/optimizely/overrides.yaml",
  ".github/feature-flags/overrides.json",
  ".github/feature-flags/overrides.yml",
  ".github/feature-flags/overrides.yaml",
  "overrides.json",
  "overrides.yml",
  "overrides.yaml",
] as const;

/**
 * Override configuration manager class for loading and validating override configurations.
 */
export class OverrideConfigManager {
  private workspaceRoot: string;
  private cachedConfig?: OverrideConfig;

  constructor(workspaceRoot: string = Deno.cwd()) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Loads override configuration from the first available file.
   */
  async loadOverrideConfig(): Promise<OverrideConfig | null> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    for (const configPath of DEFAULT_OVERRIDE_PATHS) {
      const fullPath = join(this.workspaceRoot, configPath);

      if (await exists(fullPath)) {
        try {
          const config = await this.loadConfigFromFile(fullPath);

          if (config) {
            const validation = this.validateOverrideConfig(config);
            if (validation.isValid) {
              this.cachedConfig = config;
              return config;
            } else {
              console.warn(`Invalid override config at ${configPath}:`, validation.errors);
            }
          }
        } catch (error) {
          console.warn(
            `Failed to load override config from ${configPath}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    return null;
  }

  /**
   * Loads and parses configuration from a specific file.
   */
  private async loadConfigFromFile(filePath: string): Promise<OverrideConfig | null> {
    try {
      const content = await Deno.readTextFile(filePath);

      if (filePath.endsWith(".json")) {
        return JSON.parse(content) as OverrideConfig;
      } else if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
        return parseYaml(content) as OverrideConfig;
      }
    } catch (error) {
      throw new Error(
        `Failed to parse config file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return null;
  }

  /**
   * Validates override configuration structure and content.
   */
  validateOverrideConfig(config: OverrideConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required top-level fields
    if (!config.version) errors.push("Missing required field: version");
    if (!config.organizationId) errors.push("Missing required field: organizationId");
    if (!config.overrideConfig) errors.push("Missing required field: overrideConfig");

    // Validate exclusion lists
    if (config.overrideConfig?.exclusionLists) {
      const { permanentExclusions, temporaryExclusions, patternExclusions } =
        config.overrideConfig.exclusionLists;

      // Validate permanent exclusions
      if (permanentExclusions) {
        for (const exclusion of permanentExclusions) {
          const validation = this.validateExclusionRule(exclusion, "permanent");
          errors.push(...validation.errors);
          warnings.push(...validation.warnings);
        }
      }

      // Validate temporary exclusions
      if (temporaryExclusions) {
        for (const exclusion of temporaryExclusions) {
          const validation = this.validateExclusionRule(exclusion, "temporary");
          errors.push(...validation.errors);
          warnings.push(...validation.warnings);
        }
      }

      // Validate pattern exclusions
      if (patternExclusions) {
        for (const exclusion of patternExclusions) {
          const validation = this.validatePatternExclusionRule(exclusion);
          errors.push(...validation.errors);
          warnings.push(...validation.warnings);
        }
      }
    }

    // Validate approval workflows
    if (config.overrideConfig?.approvalWorkflows?.approvalRequired) {
      for (const approval of config.overrideConfig.approvalWorkflows.approvalRequired) {
        const validation = this.validateApprovalRule(approval);
        errors.push(...validation.errors);
        warnings.push(...validation.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates individual exclusion rule.
   */
  private validateExclusionRule(
    rule: ExclusionRule,
    type: "permanent" | "temporary",
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rule.flagKey) errors.push("Exclusion rule missing flagKey");
    if (!rule.reason) errors.push("Exclusion rule missing reason");
    if (!rule.addedBy) errors.push("Exclusion rule missing addedBy");
    if (!rule.addedAt) errors.push("Exclusion rule missing addedAt");

    // Validate date format
    if (rule.addedAt) {
      try {
        new Date(rule.addedAt);
      } catch {
        errors.push(`Invalid addedAt date format: ${rule.addedAt}`);
      }
    }

    // Validate expiration for temporary exclusions
    if (type === "temporary") {
      if (!rule.expiresAt) {
        warnings.push("Temporary exclusion should have expiresAt date");
      } else if (rule.expiresAt) {
        try {
          const expiresDate = new Date(rule.expiresAt);
          const addedDate = new Date(rule.addedAt);
          if (expiresDate <= addedDate) {
            errors.push("expiresAt date must be after addedAt date");
          }
        } catch {
          errors.push(`Invalid expiresAt date format: ${rule.expiresAt}`);
        }
      }
    }

    // Validate tags
    if (rule.tags && !Array.isArray(rule.tags)) {
      errors.push("Tags must be an array");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates pattern exclusion rule.
   */
  private validatePatternExclusionRule(rule: PatternExclusionRule): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rule.pattern) errors.push("Pattern exclusion rule missing pattern");
    if (!rule.reason) errors.push("Pattern exclusion rule missing reason");
    if (!rule.addedBy) errors.push("Pattern exclusion rule missing addedBy");
    if (!rule.addedAt) errors.push("Pattern exclusion rule missing addedAt");

    // Validate regex pattern
    if (rule.pattern) {
      try {
        new RegExp(rule.pattern);
      } catch {
        errors.push(`Invalid regex pattern: ${rule.pattern}`);
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates approval workflow rule.
   */
  private validateApprovalRule(rule: ApprovalRule): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rule.flagKey) errors.push("Approval rule missing flagKey");
    if (!rule.approvalType) errors.push("Approval rule missing approvalType");
    if (!rule.approvers || !Array.isArray(rule.approvers) || rule.approvers.length === 0) {
      errors.push("Approval rule must have at least one approver");
    }

    if (rule.approvalType && !["manual", "automated"].includes(rule.approvalType)) {
      errors.push("approvalType must be either 'manual' or 'automated'");
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Checks if a flag should be excluded from cleanup operations.
   */
  async isExcluded(flagKey: string): Promise<boolean> {
    const config = await this.loadOverrideConfig();
    if (!config) return false;

    const { exclusionLists } = config.overrideConfig;
    const now = new Date();

    // Check permanent exclusions
    if (exclusionLists.permanentExclusions) {
      for (const exclusion of exclusionLists.permanentExclusions) {
        if (exclusion.isPattern) {
          const pattern = new RegExp(exclusion.flagKey.replace(/\*/g, ".*"));
          if (pattern.test(flagKey)) return true;
        } else if (exclusion.flagKey === flagKey) {
          return true;
        }
      }
    }

    // Check temporary exclusions (non-expired)
    if (exclusionLists.temporaryExclusions) {
      for (const exclusion of exclusionLists.temporaryExclusions) {
        if (exclusion.expiresAt) {
          const expiresDate = new Date(exclusion.expiresAt);
          if (expiresDate > now) {
            if (exclusion.isPattern) {
              const pattern = new RegExp(exclusion.flagKey.replace(/\*/g, ".*"));
              if (pattern.test(flagKey)) return true;
            } else if (exclusion.flagKey === flagKey) {
              return true;
            }
          }
        }
      }
    }

    // Check pattern exclusions
    if (exclusionLists.patternExclusions) {
      for (const exclusion of exclusionLists.patternExclusions) {
        const pattern = new RegExp(exclusion.pattern);
        if (pattern.test(flagKey)) return true;
      }
    }

    return false;
  }

  /**
   * Checks if a flag requires manual approval before archiving.
   */
  async requiresApproval(flagKey: string): Promise<ApprovalRule | null> {
    const config = await this.loadOverrideConfig();
    if (!config?.overrideConfig?.approvalWorkflows?.approvalRequired) return null;

    for (const rule of config.overrideConfig.approvalWorkflows.approvalRequired) {
      if (rule.flagKey.includes("*")) {
        const pattern = new RegExp(rule.flagKey.replace(/\*/g, ".*"));
        if (pattern.test(flagKey)) return rule;
      } else if (rule.flagKey === flagKey) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Gets emergency control configuration.
   */
  async getEmergencyControls() {
    const config = await this.loadOverrideConfig();
    return config?.overrideConfig?.emergencyControls || null;
  }

  /**
   * Clears cached configuration (useful for testing or config updates).
   */
  clearCache(): void {
    this.cachedConfig = undefined;
  }
}

/**
 * Default instance for the current workspace.
 */
export const overrideConfigManager = new OverrideConfigManager();
