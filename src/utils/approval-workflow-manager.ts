/**
 * Approval workflow manager for handling manual approval processes before flag archiving.
 * Integrates with GitHub Actions workflow dispatch and creates approval issues when needed.
 */

import { ApprovalRule } from "../types/config.ts";
import { overrideConfigManager } from "./override-config-manager.ts";
import * as logger from "./logger.ts";

/**
 * Approval request structure for tracking pending approvals.
 */
export interface ApprovalRequest {
  id: string;
  flagKey: string;
  rule: ApprovalRule;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
  approvals: ApprovalResponse[];
  metadata: {
    reason: string;
    flagAge?: number;
    usageAnalysis?: string;
    riskLevel: "low" | "medium" | "high";
  };
}

/**
 * Individual approval response from an approver.
 */
export interface ApprovalResponse {
  approver: string;
  decision: "approved" | "rejected";
  timestamp: string;
  comment?: string;
}

/**
 * GitHub issue creation request for approval workflows.
 */
interface GitHubIssueRequest {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
}

/**
 * Approval workflow manager for coordinating manual approval processes.
 */
export class ApprovalWorkflowManager {
  private pendingApprovals = new Map<string, ApprovalRequest>();
  private githubToken: string | undefined;
  private repository: string | undefined;

  constructor() {
    this.githubToken = Deno.env.get("GITHUB_TOKEN");
    this.repository = Deno.env.get("GITHUB_REPOSITORY");
  }

  /**
   * Checks if a flag requires approval and initiates the approval process if needed.
   */
  async checkAndRequestApproval(
    flagKey: string,
    requestedBy: string = "flag-sync-action",
    metadata: {
      reason: string;
      flagAge?: number;
      usageAnalysis?: string;
      riskLevel: "low" | "medium" | "high";
    },
  ): Promise<{
    requiresApproval: boolean;
    approvalRequest?: ApprovalRequest;
    canProceed: boolean;
  }> {
    try {
      // Check if flag requires approval based on override configuration
      const approvalRule = await overrideConfigManager.requiresApproval(flagKey);

      if (!approvalRule) {
        return {
          requiresApproval: false,
          canProceed: true,
        };
      }

      // Check if there's already a pending or approved request for this flag
      const existingRequest = this.pendingApprovals.get(flagKey);
      if (existingRequest) {
        if (existingRequest.status === "approved") {
          return {
            requiresApproval: true,
            approvalRequest: existingRequest,
            canProceed: true,
          };
        } else if (existingRequest.status === "pending") {
          return {
            requiresApproval: true,
            approvalRequest: existingRequest,
            canProceed: false,
          };
        }
      }

      // Create new approval request
      const approvalRequest: ApprovalRequest = {
        id: `approval-${flagKey}-${Date.now()}`,
        flagKey,
        rule: approvalRule,
        requestedBy,
        requestedAt: new Date().toISOString(),
        status: "pending",
        approvals: [],
        metadata,
      };

      this.pendingApprovals.set(flagKey, approvalRequest);

      // Create GitHub issue for manual approval if configured
      if (this.shouldCreateGitHubIssue(approvalRule)) {
        await this.createApprovalIssue(approvalRequest);
      }

      logger.info("Approval request created", {
        flagKey,
        approvalId: approvalRequest.id,
        approvers: approvalRule.approvers,
        requiresAllApprovers: approvalRule.requiresAllApprovers,
      });

      return {
        requiresApproval: true,
        approvalRequest,
        canProceed: false,
      };
    } catch (error) {
      logger.error("Failed to check approval requirements", {
        flagKey,
        error: error instanceof Error ? error.message : String(error),
      });

      // In case of error, default to requiring approval for safety
      return {
        requiresApproval: true,
        canProceed: false,
      };
    }
  }

  /**
   * Processes an approval response from an approver.
   */
  processApprovalResponse(
    flagKey: string,
    approver: string,
    decision: "approved" | "rejected",
    comment?: string,
  ): {
    success: boolean;
    finalDecision?: "approved" | "rejected";
    message: string;
  } {
    const request = this.pendingApprovals.get(flagKey);
    if (!request || request.status !== "pending") {
      return {
        success: false,
        message: "No pending approval request found for this flag",
      };
    }

    // Check if approver is authorized
    if (!this.isAuthorizedApprover(approver, request.rule)) {
      return {
        success: false,
        message: "Approver is not authorized for this flag",
      };
    }

    // Check if approver has already responded
    const existingResponse = request.approvals.find((a) => a.approver === approver);
    if (existingResponse) {
      return {
        success: false,
        message: "Approver has already provided a response",
      };
    }

    // Add approval response
    const response: ApprovalResponse = {
      approver,
      decision,
      timestamp: new Date().toISOString(),
      comment,
    };
    request.approvals.push(response);

    // Check if we have enough approvals/rejections to make a final decision
    const finalDecision = this.evaluateFinalDecision(request);

    if (finalDecision) {
      request.status = finalDecision;

      logger.info("Approval request finalized", {
        flagKey,
        finalDecision,
        totalApprovals: request.approvals.filter((a) => a.decision === "approved").length,
        totalRejections: request.approvals.filter((a) => a.decision === "rejected").length,
      });

      return {
        success: true,
        finalDecision,
        message: `Approval request ${finalDecision} for flag ${flagKey}`,
      };
    }

    logger.info("Approval response recorded", {
      flagKey,
      approver,
      decision,
      remainingApprovers: this.getRemainingApprovers(request),
    });

    return {
      success: true,
      message: `Approval response recorded. Waiting for additional approvers.`,
    };
  }

  /**
   * Gets all pending approval requests.
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter((request) => request.status === "pending");
  }

  /**
   * Gets approval request status for a specific flag.
   */
  getApprovalStatus(flagKey: string): ApprovalRequest | null {
    return this.pendingApprovals.get(flagKey) || null;
  }

  /**
   * Clears expired approval requests based on configurable timeout.
   */
  clearExpiredApprovals(maxAgeHours: number = 72): number {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    let clearedCount = 0;

    for (const [flagKey, request] of this.pendingApprovals.entries()) {
      const requestTime = new Date(request.requestedAt);
      if (requestTime < cutoffTime && request.status === "pending") {
        request.status = "expired";
        this.pendingApprovals.delete(flagKey);
        clearedCount++;

        logger.info("Approval request expired", {
          flagKey,
          approvalId: request.id,
          ageHours: (Date.now() - requestTime.getTime()) / (1000 * 60 * 60),
        });
      }
    }

    return clearedCount;
  }

  /**
   * Creates GitHub issue for approval workflow.
   */
  private async createApprovalIssue(request: ApprovalRequest): Promise<void> {
    if (!this.githubToken || !this.repository) {
      logger.warn("GitHub token or repository not configured, skipping issue creation");
      return;
    }

    const issueRequest: GitHubIssueRequest = {
      title: `🔐 Manual Approval Required: ${request.flagKey}`,
      body: this.generateIssueBody(request),
      labels: ["flag-sync", "approval-required", `risk-${request.metadata.riskLevel}`],
      assignees: this.extractGitHubUsernames(request.rule.approvers),
    };

    try {
      const [owner, repo] = this.repository.split("/");
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          "Authorization": `token ${this.githubToken}`,
          "Content-Type": "application/json",
          "User-Agent": "optimizely-flag-sync-action",
        },
        body: JSON.stringify(issueRequest),
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const issue = await response.json();
      logger.info("Approval issue created", {
        flagKey: request.flagKey,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      });
    } catch (error) {
      logger.error("Failed to create approval issue", {
        flagKey: request.flagKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generates GitHub issue body for approval request.
   */
  private generateIssueBody(request: ApprovalRequest): string {
    const { flagKey, rule, metadata, requestedAt } = request;

    return `## 🔐 Manual Approval Required

**Flag:** \`${flagKey}\`
**Requested:** ${new Date(requestedAt).toLocaleString()}
**Risk Level:** ${metadata.riskLevel.toUpperCase()}
**Requested By:** ${request.requestedBy}

### Reason for Archival
${metadata.reason}

### Flag Analysis
${metadata.usageAnalysis ? `- **Usage Analysis:** ${metadata.usageAnalysis}` : ""}
${metadata.flagAge ? `- **Flag Age:** ${metadata.flagAge} days` : ""}
- **Risk Level:** ${metadata.riskLevel}

### Approval Requirements
- **Approval Type:** ${rule.approvalType}
- **Required Approvers:** ${rule.approvers.join(", ")}
- **Requires All Approvers:** ${rule.requiresAllApprovers ? "Yes" : "No"}

### Instructions for Approvers
To approve or reject this flag archival request:

1. **Review the flag usage and business impact**
2. **Add a comment with your decision:**
   - ✅ **To Approve:** Comment with \`/approve [optional reason]\`
   - ❌ **To Reject:** Comment with \`/reject [required reason]\`

### Context
This flag has been identified as potentially unused in the codebase and is being considered for archival. Manual approval is required due to the flag matching pattern \`${rule.flagKey}\` with reason: ${rule.reason}

---
*This issue was created automatically by the Optimizely Feature Flag Sync Action.*
*For questions or issues, please check the [documentation](README.md) or contact the development team.*`;
  }

  /**
   * Checks if the approval rule should create a GitHub issue.
   */
  private shouldCreateGitHubIssue(rule: ApprovalRule): boolean {
    return rule.approvalType === "manual" && !!this.githubToken && !!this.repository;
  }

  /**
   * Checks if an approver is authorized for the given rule.
   */
  private isAuthorizedApprover(approver: string, rule: ApprovalRule): boolean {
    // Normalize approver name (remove @ prefix if present)
    const normalizedApprover = approver.startsWith("@") ? approver.slice(1) : approver;

    return rule.approvers.some((authorized) => {
      const normalizedAuthorized = authorized.startsWith("@") ? authorized.slice(1) : authorized;
      return normalizedAuthorized.toLowerCase() === normalizedApprover.toLowerCase();
    });
  }

  /**
   * Evaluates if enough approvals/rejections have been collected to make a final decision.
   */
  private evaluateFinalDecision(request: ApprovalRequest): "approved" | "rejected" | null {
    const approvals = request.approvals.filter((a) => a.decision === "approved");
    const rejections = request.approvals.filter((a) => a.decision === "rejected");

    // If any rejection, and not requiring all approvers, reject immediately
    if (rejections.length > 0 && !request.rule.requiresAllApprovers) {
      return "rejected";
    }

    // If requiring all approvers, check if all have approved
    if (request.rule.requiresAllApprovers) {
      if (rejections.length > 0) {
        return "rejected";
      }
      if (approvals.length === request.rule.approvers.length) {
        return "approved";
      }
    } else {
      // If not requiring all, one approval is enough
      if (approvals.length > 0) {
        return "approved";
      }
    }

    return null; // Still pending
  }

  /**
   * Gets list of remaining approvers who haven't responded yet.
   */
  private getRemainingApprovers(request: ApprovalRequest): string[] {
    const respondedApprovers = new Set(request.approvals.map((a) => a.approver.toLowerCase()));

    return request.rule.approvers.filter((approver) => {
      const normalized = approver.startsWith("@")
        ? approver.slice(1).toLowerCase()
        : approver.toLowerCase();
      return !respondedApprovers.has(normalized);
    });
  }

  /**
   * Extracts GitHub usernames from approver list (removes @ prefix).
   */
  private extractGitHubUsernames(approvers: string[]): string[] {
    return approvers.map((approver) => approver.startsWith("@") ? approver.slice(1) : approver)
      .filter((username) => username.length > 0);
  }
}

/**
 * Default instance for the approval workflow manager.
 */
export const approvalWorkflowManager = new ApprovalWorkflowManager();
