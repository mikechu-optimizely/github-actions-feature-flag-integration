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
