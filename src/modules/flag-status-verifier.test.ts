/**
 * Unit tests for FlagStatusVerifier.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { EnvironmentValidationConfig, FlagStatusVerifier } from "./flag-status-verifier.ts";
import { OptimizelyApiClient } from "./optimizely-client.ts";
import {
  FlagConsistencyValidation,
  OptimizelyEnvironmentListItem,
  OptimizelyFlag,
} from "../types/optimizely.ts";

// Mock environment variables
const envVars = {
  OPTIMIZELY_API_TOKEN: "test-token",
  OPTIMIZELY_PROJECT_ID: "123456",
  GITHUB_TOKEN: "gh-token",
  OPERATION: "cleanup",
  DRY_RUN: "true",
};

// Store original environment values to restore after tests
const originalEnvValues: Record<string, string | undefined> = {};

function setEnv() {
  // Store original values before setting test values
  for (const key of Object.keys(envVars)) {
    if (!(key in originalEnvValues)) {
      originalEnvValues[key] = Deno.env.get(key);
    }
  }

  for (const [k, v] of Object.entries(envVars)) {
    Deno.env.set(k, v);
  }
}

function restoreEnv() {
  // Restore original environment values
  for (const [key, originalValue] of Object.entries(originalEnvValues)) {
    if (originalValue === undefined) {
      Deno.env.delete(key);
    } else {
      Deno.env.set(key, originalValue);
    }
  }
  // Clear the stored values
  Object.keys(originalEnvValues).forEach((key) => delete originalEnvValues[key]);
}

// Helper to create mock environment with all required properties
function createMockEnvironment(
  key: string,
  name: string,
  id: number,
): OptimizelyEnvironmentListItem {
  return {
    key,
    name,
    archived: false,
    priority: 1000 + id,
    account_id: 789,
    project_id: 123456,
    role: "admin",
    id,
    has_restricted_permissions: false,
  };
}

// Mock API client for testing
class MockOptimizelyApiClient {
  private mockFlags: OptimizelyFlag[] = [];
  private mockEnvironments: OptimizelyEnvironmentListItem[] = [];
  private mockValidations: Record<string, FlagConsistencyValidation> = {};

  setMockFlags(flags: OptimizelyFlag[]) {
    this.mockFlags = flags;
  }

  setMockEnvironments(environments: OptimizelyEnvironmentListItem[]) {
    this.mockEnvironments = environments;
  }

  setMockValidation(flagKey: string, validation: FlagConsistencyValidation) {
    this.mockValidations[flagKey] = validation;
  }

  getAllFeatureFlags() {
    return { data: this.mockFlags, error: null };
  }

  getEnvironments() {
    return { data: this.mockEnvironments, error: null };
  }

  validateFlagConsistency(flagKey: string) {
    const validation = this.mockValidations[flagKey];
    if (validation) {
      return { data: validation, error: null };
    }
    return { data: null, error: new Error(`No mock validation for ${flagKey}`) };
  }
}

Deno.test("FlagStatusVerifier: validateFlagConfiguration handles basic validation", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  const mockValidation: FlagConsistencyValidation = {
    flagKey: "test_flag",
    isConsistent: true,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [],
    summary: {
      totalEnvironments: 2,
      enabledEnvironments: 2,
      disabledEnvironments: 0,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("test_flag", mockValidation);

  const result = await verifier.validateFlagConfiguration("test_flag");

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.flagKey, "test_flag");
  assertEquals(result.data.isConsistent, true);
  assertEquals(result.data.summary.totalEnvironments, 2);
});

Deno.test("FlagStatusVerifier: validateFlagConfiguration filters target environments", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  const mockValidation: FlagConsistencyValidation = {
    flagKey: "test_flag",
    isConsistent: true,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      staging: {
        key: "staging",
        name: "Staging",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [],
    summary: {
      totalEnvironments: 3,
      enabledEnvironments: 3,
      disabledEnvironments: 0,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("test_flag", mockValidation);

  const config: EnvironmentValidationConfig = {
    targetEnvironments: ["dev", "prod"], // Only validate dev and prod
  };

  const result = await verifier.validateFlagConfiguration("test_flag", config);

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.summary.totalEnvironments, 2);
  assertEquals(Object.keys(result.data.environments).length, 2);
  assert(result.data.environments["dev"]);
  assert(result.data.environments["prod"]);
  assert(!result.data.environments["staging"]);
});

Deno.test("FlagStatusVerifier: validateFlagConfiguration detects missing environments", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  const mockValidation: FlagConsistencyValidation = {
    flagKey: "test_flag",
    isConsistent: true,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [],
    summary: {
      totalEnvironments: 1,
      enabledEnvironments: 1,
      disabledEnvironments: 0,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("test_flag", mockValidation);

  const config: EnvironmentValidationConfig = {
    minimumEnvironments: 3, // Require at least 3 environments
  };

  const result = await verifier.validateFlagConfiguration("test_flag", config);

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.isConsistent, false);
  assertEquals(result.data.inconsistencies.length, 1);
  assertEquals(result.data.inconsistencies[0].type, "missing_environment");
  assert(result.data.inconsistencies[0].message.includes("Found 1, required 3"));
});

Deno.test("FlagStatusVerifier: checkFlagStatusConsistency processes multiple flags", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  // Mock environments
  mockClient.setMockEnvironments([
    createMockEnvironment("dev", "Development", 1),
    createMockEnvironment("prod", "Production", 2),
  ]);

  // Mock consistent flag
  const consistentValidation: FlagConsistencyValidation = {
    flagKey: "consistent_flag",
    isConsistent: true,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [],
    summary: {
      totalEnvironments: 2,
      enabledEnvironments: 2,
      disabledEnvironments: 0,
      archivedEnvironments: 0,
    },
  };

  // Mock inconsistent flag
  const inconsistentValidation: FlagConsistencyValidation = {
    flagKey: "inconsistent_flag",
    isConsistent: false,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: false,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [{
      type: "mixed_enabled_status",
      message: "Flag has mixed enabled/disabled status across environments",
      affectedEnvironments: ["prod"],
    }],
    summary: {
      totalEnvironments: 2,
      enabledEnvironments: 1,
      disabledEnvironments: 1,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("consistent_flag", consistentValidation);
  mockClient.setMockValidation("inconsistent_flag", inconsistentValidation);

  const result = await verifier.checkFlagStatusConsistency([
    "consistent_flag",
    "inconsistent_flag",
  ]);

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.totalFlags, 2);
  assertEquals(result.data.consistentFlags, 1);
  assertEquals(result.data.inconsistentFlags, 1);
  assertEquals(result.data.flagsForReview.length, 1);
  assertEquals(result.data.flagsForReview[0], "inconsistent_flag");

  // Check environment summaries
  assert(result.data.environmentSummary["dev"]);
  assert(result.data.environmentSummary["prod"]);
  assertEquals(result.data.environmentSummary["dev"].totalFlags, 2);
  assertEquals(result.data.environmentSummary["dev"].enabledFlags, 2);
  assertEquals(result.data.environmentSummary["prod"].totalFlags, 2);
  assertEquals(result.data.environmentSummary["prod"].enabledFlags, 1);
});

Deno.test("FlagStatusVerifier: checkFlagStatusConsistency fetches all flags when none specified", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  // Mock flags
  const mockFlags: OptimizelyFlag[] = [
    {
      key: "flag1",
      name: "Flag 1",
      archived: false,
      id: 1,
      urn: "urn:flag:1",
      project_id: 123456,
      account_id: 789,
      created_by_user_id: "user1",
      created_by_user_email: "user1@example.com",
      role: "admin",
      created_time: "2023-01-01T00:00:00Z",
      updated_time: "2023-01-01T00:00:00Z",
      revision: 1,
      outlier_filtering_enabled: false,
      url: "https://app.optimizely.com/flags/1",
    },
    {
      key: "flag2",
      name: "Flag 2",
      archived: true, // This should be filtered out by default
      id: 2,
      urn: "urn:flag:2",
      project_id: 123456,
      account_id: 789,
      created_by_user_id: "user1",
      created_by_user_email: "user1@example.com",
      role: "admin",
      created_time: "2023-01-01T00:00:00Z",
      updated_time: "2023-01-01T00:00:00Z",
      revision: 1,
      outlier_filtering_enabled: false,
      url: "https://app.optimizely.com/flags/2",
    },
  ];

  mockClient.setMockFlags(mockFlags);
  mockClient.setMockEnvironments([
    createMockEnvironment("dev", "Development", 1),
    createMockEnvironment("prod", "Production", 2),
  ]);

  // Mock validation for flag1 only (flag2 should be filtered out)
  const validation: FlagConsistencyValidation = {
    flagKey: "flag1",
    isConsistent: true,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [],
    summary: {
      totalEnvironments: 2,
      enabledEnvironments: 2,
      disabledEnvironments: 0,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("flag1", validation);

  const result = await verifier.checkFlagStatusConsistency([]); // Empty array should fetch all flags

  assertEquals(result.error, null);
  assert(result.data);
  assertEquals(result.data.totalFlags, 1); // Only flag1 should be processed (flag2 is archived)
  assertEquals(result.data.consistentFlags, 1);
  assertEquals(result.data.inconsistentFlags, 0);
});

Deno.test("FlagStatusVerifier: generateCrossEnvironmentReport creates formatted output", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  mockClient.setMockEnvironments([
    createMockEnvironment("dev", "Development", 1),
    createMockEnvironment("prod", "Production", 2),
  ]);

  const validation: FlagConsistencyValidation = {
    flagKey: "test_flag",
    isConsistent: false,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: false,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [{
      type: "mixed_enabled_status",
      message: "Flag has mixed enabled/disabled status across environments",
      affectedEnvironments: ["prod"],
    }],
    summary: {
      totalEnvironments: 2,
      enabledEnvironments: 1,
      disabledEnvironments: 1,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("test_flag", validation);

  const result = await verifier.generateCrossEnvironmentReport(["test_flag"]);

  assertEquals(result.error, null);
  assert(result.data);

  const report = result.data;
  assert(report.includes("# Cross-Environment Flag Status Report"));
  assert(report.includes("Total Flags Validated: 1"));
  assert(report.includes("Inconsistent Flags: 1"));
  assert(report.includes("## Environment Health"));
  assert(report.includes("Development (dev)"));
  assert(report.includes("Production (prod)"));
  assert(report.includes("## Inconsistent Flags"));
  assert(report.includes("### test_flag"));
  assert(report.includes("mixed_enabled_status"));
  assert(report.includes("## Recommendations"));
  assert(report.includes("test_flag"));
});

Deno.test("FlagStatusVerifier: generateCrossEnvironmentReport handles consistent flags", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  mockClient.setMockEnvironments([
    createMockEnvironment("dev", "Development", 1),
    createMockEnvironment("prod", "Production", 2),
  ]);

  const validation: FlagConsistencyValidation = {
    flagKey: "test_flag",
    isConsistent: true,
    environments: {
      dev: {
        key: "dev",
        name: "Development",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
      prod: {
        key: "prod",
        name: "Production",
        enabled: true,
        status: "active",
        hasTargetingRules: false,
        priority: 1000,
      },
    },
    inconsistencies: [],
    summary: {
      totalEnvironments: 2,
      enabledEnvironments: 2,
      disabledEnvironments: 0,
      archivedEnvironments: 0,
    },
  };

  mockClient.setMockValidation("test_flag", validation);

  const result = await verifier.generateCrossEnvironmentReport(["test_flag"]);

  assertEquals(result.error, null);
  assert(result.data);

  const report = result.data;
  assert(report.includes("Consistent Flags: 1"));
  assert(report.includes("Inconsistent Flags: 0"));
  assert(report.includes("All flags are consistent across environments. No action required."));
  assert(!report.includes("## Inconsistent Flags"));
});

Deno.test("FlagStatusVerifier: validateFlagConfiguration handles invalid parameters", async () => {
  setEnv();
  const mockClient = new MockOptimizelyApiClient();
  const verifier = new FlagStatusVerifier(mockClient as unknown as OptimizelyApiClient);

  // Test empty flag key
  const result1 = await verifier.validateFlagConfiguration("");
  assertEquals(result1.data, null);
  assert(result1.error?.message.includes("Flag key is required"));

  // Test non-string flag key
  const result2 = await verifier.validateFlagConfiguration(null as unknown as string);
  assertEquals(result2.data, null);
  assert(result2.error?.message.includes("Flag key is required"));
});

// Add cleanup after all tests
Deno.test("FlagStatusVerifier: cleanup environment", () => {
  restoreEnv();
});
