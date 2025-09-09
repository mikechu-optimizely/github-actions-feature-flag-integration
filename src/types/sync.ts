/**
 * Synchronization data types for flag sync operations
 */

import { FlagUsage } from "../modules/code-analysis.ts";
import { OptimizelyFlag } from "./optimizely.ts";

/**
 * Sync plan operation types
 */
export type SyncOperationType = "archive" | "enable" | "disable" | "update" | "no_action";

/**
 * Risk level assessment for operations
 */
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Status of sync plan execution
 */
export type SyncPlanStatus = "pending" | "in_progress" | "completed" | "failed" | "rolled_back";

/**
 * Represents a single sync operation
 */
export interface SyncOperation {
  /** Unique identifier for the operation */
  id: string;
  /** Type of operation to perform */
  type: SyncOperationType;
  /** Target flag key */
  flagKey: string;
  /** Target environment (optional, null for all environments) */
  environment?: string;
  /** Risk level of this operation */
  riskLevel: RiskLevel;
  /** Human-readable reason for the operation */
  reason: string;
  /** Additional context or metadata */
  context: {
    /** Current flag configuration from Optimizely */
    currentFlag?: OptimizelyFlag;
    /** Flag usage found in codebase */
    codeUsages: FlagUsage[];
    /** Dependencies or related operations */
    dependencies?: string[];
    /** Usage report for validation */
    usageReport?: import("../modules/flag-usage-reporter.ts").FlagUsageReport;
  };
  /** Validation checks that must pass before execution */
  validationChecks: ValidationCheck[];
  /** Rollback information */
  rollbackInfo?: RollbackInfo;
}

/**
 * Validation check for sync operations
 */
export interface ValidationCheck {
  /** Check identifier */
  id: string;
  /** Check description */
  description: string;
  /** Whether this check is required or optional */
  required: boolean;
  /** Check result */
  status: "pending" | "passed" | "failed" | "skipped";
  /** Error message if check failed */
  errorMessage?: string;
}

/**
 * Rollback information for operations
 */
export interface RollbackInfo {
  /** Whether rollback is supported for this operation */
  supported: boolean;
  /** Previous state to restore */
  previousState?: {
    archived: boolean;
    enabled: boolean;
    configuration?: Record<string, unknown>;
  };
  /** Rollback instructions */
  instructions: string;
}

/**
 * Complete synchronization plan
 */
export interface SyncPlan {
  /** Unique plan identifier */
  id: string;
  /** Plan creation timestamp */
  timestamp: string;
  /** Plan status */
  status: SyncPlanStatus;
  /** Operations to execute */
  operations: SyncOperation[];
  /** Plan summary */
  summary: {
    /** Total operations */
    totalOperations: number;
    /** Operations by type */
    operationsByType: Record<SyncOperationType, number>;
    /** Operations by risk level */
    operationsByRisk: Record<RiskLevel, number>;
    /** Estimated execution time in milliseconds */
    estimatedDurationMs: number;
  };
  /** Pre-execution validation results */
  validationResults: PlanValidationResult;
  /** Execution progress */
  progress?: {
    /** Number of completed operations */
    completed: number;
    /** Number of failed operations */
    failed: number;
    /** Currently executing operation */
    currentOperation?: string;
    /** Execution start time */
    startTime?: string;
    /** Execution end time */
    endTime?: string;
  };
}

/**
 * Plan validation result
 */
export interface PlanValidationResult {
  /** Whether the plan is valid and safe to execute */
  isValid: boolean;
  /** Blocking errors that prevent execution */
  errors: string[];
  /** Warnings that should be reviewed */
  warnings: string[];
  /** Information messages */
  info: string[];
  /** Overall risk assessment */
  riskAssessment: RiskAssessment;
}

/**
 * Risk assessment for the entire plan
 */
export interface RiskAssessment {
  /** Overall risk level */
  overallRisk: RiskLevel;
  /** Number of high-risk operations */
  highRiskOperations: number;
  /** Potential impact description */
  potentialImpact: string[];
  /** Recommended precautions */
  recommendations: string[];
}

/**
 * Flag consistency check result
 */
export interface FlagConsistencyResult {
  /** Flag key being checked */
  flagKey: string;
  /** Whether flag is consistent */
  isConsistent: boolean;
  /** Consistency issues found */
  issues: ConsistencyIssue[];
  /** Code-Optimizely alignment status */
  alignment: {
    /** Flag exists in Optimizely */
    existsInOptimizely: boolean;
    /** Flag is used in code */
    usedInCode: boolean;
    /** Flag status matches usage */
    statusAligned: boolean;
  };
}

/**
 * Consistency issue details
 */
export interface ConsistencyIssue {
  /** Issue type */
  type: "orphaned_flag" | "missing_flag" | "status_mismatch" | "configuration_drift";
  /** Issue severity */
  severity: "low" | "medium" | "high";
  /** Issue description */
  message: string;
  /** Suggested resolution */
  resolution?: string;
}

/**
 * Execution result for a sync operation
 */
export interface SyncOperationResult {
  /** Operation ID */
  operationId: string;
  /** Execution status */
  status: "success" | "failed" | "rolled_back";
  /** Result message */
  message: string;
  /** Execution start time */
  startTime: string;
  /** Execution end time */
  endTime: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Rollback information if applicable */
  rollback?: {
    attempted: boolean;
    successful: boolean;
    message: string;
  };
}

/**
 * Complete sync execution result
 */
export interface SyncExecutionResult {
  /** Plan ID */
  planId: string;
  /** Execution status */
  status: "success" | "partial_success" | "failed";
  /** Execution start time */
  startTime: string;
  /** Execution end time */
  endTime: string;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Results for each operation */
  operationResults: SyncOperationResult[];
  /** Summary statistics */
  summary: {
    /** Total operations executed */
    totalExecuted: number;
    /** Number of successful operations */
    successful: number;
    /** Number of failed operations */
    failed: number;
    /** Number of rolled back operations */
    rolledBack: number;
  };
  /** Any warnings or notable issues */
  warnings: string[];
}

/**
 * Flag difference types for analysis
 */
export type FlagDifferenceType =
  | "orphaned_in_optimizely"
  | "missing_in_optimizely"
  | "archived_but_used"
  | "active_but_unused"
  | "configuration_drift";

/**
 * Flag difference identified during analysis
 */
export interface FlagDifference {
  /** Flag key */
  flagKey: string;
  /** Type of difference */
  type: FlagDifferenceType;
  /** Severity level */
  severity: "low" | "medium" | "high";
  /** Description of the difference */
  description: string;
  /** Recommended action to resolve */
  recommendedAction: string;
  /** Risk level of resolving this difference */
  riskLevel: RiskLevel;
  /** Additional context */
  context: {
    /** Usage locations in code */
    usageLocations: FlagUsage[];
    /** Last modification timestamp */
    lastModified?: string;
    /** Optimizely flag details */
    optimizelyFlag?: OptimizelyFlag;
  };
}

/**
 * Flag analysis result
 */
export interface FlagAnalysisResult {
  /** Analysis timestamp */
  timestamp: string;
  /** Total flags in Optimizely */
  totalOptimizelyFlags: number;
  /** Total flags found in codebase */
  totalCodebaseFlags: number;
  /** Flag differences found */
  differences: FlagDifference[];
  /** Summary statistics */
  summary: {
    /** Flags in Optimizely not used in code */
    orphanedFlags: number;
    /** Flags used in code but missing in Optimizely */
    missingFlags: number;
    /** Flags archived in Optimizely but used in code */
    archivedButUsed: number;
    /** Flags active in Optimizely but unused in code */
    activeButUnused: number;
    /** Flags that are consistent */
    consistentFlags: number;
  };
}

/**
 * Options for cleanup plan creation
 */
export interface CleanupPlanOptions {
  /** Whether to run in dry-run mode */
  dryRun: boolean;
  /** Maximum operations per batch */
  batchSize: number;
  /** Maximum concurrent operations */
  maxConcurrentOperations: number;
  /** Whether to require manual confirmation */
  requireConfirmation: boolean;
  /** Whether to enable automatic rollback */
  enableRollback: boolean;
}

/**
 * Plan execution phase
 */
export interface ExecutionPhase {
  /** Phase name */
  name: string;
  /** Phase description */
  description: string;
  /** Operations in this phase */
  operations: { flagKey: string; reason: string }[];
}

/**
 * Plan execution ordering information
 */
export interface PlanExecutionOrder {
  /** Execution strategy */
  strategy: "risk_based" | "dependency_based" | "manual";
  /** Execution phases */
  phases: ExecutionPhase[];
  /** Operation dependencies */
  dependencies: Map<string, string[]>;
}

/**
 * Comprehensive cleanup plan
 */
export interface CleanupPlan {
  /** Plan ID */
  id: string;
  /** Plan timestamp */
  timestamp: string;
  /** Plan status */
  status: "draft" | "approved" | "executing" | "completed" | "failed" | "cancelled";
  /** Flag analysis results */
  analysis: FlagAnalysisResult;
  /** Operations to execute */
  operations: SyncOperation[];
  /** Execution ordering */
  executionOrder: PlanExecutionOrder;
  /** Plan options */
  options: CleanupPlanOptions;
  /** Validation results */
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    info: string[];
    riskAssessment: RiskAssessment;
  };
  /** Additional metadata */
  metadata: {
    /** Plan creator */
    createdBy: string;
    /** Estimated execution duration in ms */
    estimatedDuration: number;
    /** Risk assessment */
    riskAssessment: RiskAssessment;
    /** External dependencies */
    dependencies: string[];
  };
}
