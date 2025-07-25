# Testing Guidelines and Standards

This document outlines the comprehensive testing strategy, guidelines, and standards for the Feature Flag Synchronization Solution.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Structure](#test-structure)
3. [Testing Guidelines](#testing-guidelines)
4. [Test Categories](#test-categories)
5. [Coverage Requirements](#coverage-requirements)
6. [Running Tests](#running-tests)
7. [Continuous Integration](#continuous-integration)
8. [Best Practices](#best-practices)

## Testing Strategy

Our testing strategy follows the testing pyramid approach with three main levels:

### 1. Unit Tests (70%)
- Test individual functions and methods in isolation
- Mock external dependencies
- Fast execution time (<1ms per test)
- High coverage of business logic

### 2. Integration Tests (20%)
- Test interactions between modules
- Test external API integrations
- Validate configuration loading
- Test file system operations

### 3. End-to-End Tests (10%)
- Test complete workflows
- Validate GitHub Actions integration
- Test real-world scenarios with dry-run mode

## Test Structure

### File Organization
```
src/
├── config/
│   ├── environment.ts
│   └── environment.test.ts          # Unit tests for environment config
├── modules/
│   ├── optimizely-client.ts
│   ├── optimizely-client.test.ts    # Unit tests for API client
│   ├── audit-reporter.ts
│   └── audit-reporter.test.ts       # Unit tests for audit reporter
├── utils/
│   ├── test-helpers.ts              # Common test utilities
│   ├── test-helpers.test.ts         # Tests for test helpers
│   ├── validation.ts
│   └── validation.test.ts           # Unit tests for validation
└── types/
    └── config.ts                    # Type definitions
```

### Sibling Test Files
Each module should have a corresponding `.test.ts` file in the same directory:
- `module-name.ts` → `module-name.test.ts`
- Tests should be co-located with the code they test
- Import the module using relative paths

### Test Naming Convention
```typescript
Deno.test("ModuleName: should do something when condition is met", () => {
  // Test implementation
});

// Examples:
Deno.test("OptimizelyApiClient: should fetch flags successfully with valid token", async () => {});
Deno.test("AuditReporter: should write audit events to file when flush is called", async () => {});
Deno.test("Environment: should throw error when required variables are missing", async () => {});
```

## Testing Guidelines

### 1. Test Structure (AAA Pattern)
```typescript
Deno.test("function should do something when condition", () => {
  // Arrange - Set up test data and conditions
  const input = createMockInput();
  const expectedOutput = { success: true };
  
  // Act - Execute the function under test
  const result = functionUnderTest(input);
  
  // Assert - Verify the results
  assertEquals(result, expectedOutput);
});
```

### 2. Use Test Helpers
Leverage the test helper utilities for common testing patterns:

```typescript
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createMockFlag,
  createMockFetch,
  TestFixtures
} from "../utils/test-helpers.ts";

Deno.test("should use test helpers", async () => {
  // Setup
  setupTestEnvironment({ OPERATION: "audit" });
  const mockFlag = createMockFlag({ key: "test_flag" });
  
  // Use fixtures
  const codeSnippet = TestFixtures.codeSnippets.typescript;
  
  // Test implementation...
  
  // Cleanup
  cleanupTestEnvironment();
});
```

### 3. Mock External Dependencies
Always mock external dependencies to ensure test isolation:

```typescript
// Mock fetch for API calls
const originalFetch = globalThis.fetch;
globalThis.fetch = createMockFetch([
  { body: { success: true }, status: 200 }
]);

// Restore after test
globalThis.fetch = originalFetch;
```

### 4. Test Error Conditions
Always test both success and failure scenarios:

```typescript
Deno.test("should handle API errors gracefully", async () => {
  globalThis.fetch = createMockFetch([
    { status: 500, statusText: "Internal Server Error" }
  ]);
  
  const client = new OptimizelyApiClient("test-token");
  const result = await client.getAllFeatureFlags();
  
  assert(result.error instanceof Error);
  assertEquals(result.data, null);
});
```

### 5. Test Async Functions
Use async/await for testing asynchronous operations:

```typescript
Deno.test("async function should resolve correctly", async () => {
  const result = await asyncFunction();
  assertEquals(result.status, "success");
});
```

## Test Categories

### Unit Tests
Mark unit tests for targeted execution:
```typescript
Deno.test("unit: OptimizelyApiClient should validate API paths", () => {
  // Unit test implementation
});
```

### Integration Tests  
Mark integration tests for separate execution:
```typescript
Deno.test("integration: should load environment config from file", async () => {
  // Integration test implementation
});
```

### End-to-End Tests
Mark e2e tests for full workflow testing:
```typescript
Deno.test("e2e: should complete full flag cleanup workflow", async () => {
  // End-to-end test implementation
});
```

## Coverage Requirements

### Minimum Coverage Targets
- **Overall Code Coverage**: 85%
- **Unit Test Coverage**: 90%
- **Integration Test Coverage**: 70%
- **Critical Path Coverage**: 100%

### Critical Paths (100% Coverage Required)
- Environment configuration loading
- API authentication and error handling
- Flag archiving operations
- Audit logging
- Security validation

### Coverage Exclusions
- Type definitions (`*.types.ts`)
- Test helper utilities
- Development-only code
- External library integrations (mock the interfaces)

## Running Tests

### Basic Test Commands
```bash
# Run all tests
deno task test

# Run tests with coverage
deno task test:coverage

# Generate HTML coverage report
deno task test:coverage:html

# Generate LCOV coverage report (for CI)
deno task test:coverage:lcov

# Run specific test categories
deno task test:unit
deno task test:integration
deno task test:e2e

# Run tests in parallel (faster)
deno task test:parallel

# Watch mode for development
deno task test:watch

# CI-friendly test run with JUnit output
deno task test:ci
```

### Individual Test Files
```bash
# Run specific test file
deno test --allow-all src/modules/optimizely-client.test.ts

# Run tests matching pattern
deno test --allow-all src/ --filter="OptimizelyApiClient"

# Run with verbose output
deno test --allow-all src/ --reporter=verbose
```

## Continuous Integration

### GitHub Actions Integration
The `.github/workflows/feature-flag-sync.yml` includes comprehensive testing:

```yaml
- name: Run Tests with Coverage
  run: deno task test:coverage:lcov

- name: Upload Coverage Reports
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage.lcov

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: test-results
    path: test-results.xml
```

### CI Test Requirements
- All tests must pass before merge
- Coverage must meet minimum thresholds
- No test flakiness tolerated
- Tests must run in under 5 minutes

## Best Practices

### 1. Test Independence
- Each test should be independent and isolated
- Tests should not depend on execution order
- Clean up resources after each test

### 2. Descriptive Test Names
```typescript
// Good
Deno.test("OptimizelyApiClient: should retry failed requests with exponential backoff", () => {});

// Bad  
Deno.test("test api retry", () => {});
```

### 3. Test Data Management
```typescript
// Use factories for test data
const createTestFlag = (overrides = {}) => ({
  key: "test_flag",
  name: "Test Flag",
  archived: false,
  ...overrides
});

// Use constants for expected values
const EXPECTED_API_TIMEOUT = 30000;
```

### 4. Error Testing
```typescript
// Test specific error types and messages
Deno.test("should throw ValidationError for invalid input", () => {
  assertThrows(
    () => validateInput(""),
    ValidationError,
    "Input cannot be empty"
  );
});
```

### 5. Performance Testing
```typescript
Deno.test("should complete within performance threshold", async () => {
  const startTime = Date.now();
  
  await performOperation();
  
  const duration = Date.now() - startTime;
  assert(duration < 1000, `Operation took ${duration}ms, expected < 1000ms`);
});
```

### 6. Test Documentation
```typescript
Deno.test("OptimizelyApiClient: should handle rate limiting correctly", async () => {
  // This test verifies that the API client respects rate limits
  // by introducing appropriate delays between requests
  
  // Given: A client with 2 RPS limit
  const client = new OptimizelyApiClient("token", { maxRps: 2 });
  
  // When: Making 3 rapid requests
  const start = Date.now();
  await Promise.all([
    client.request("/test1"),
    client.request("/test2"), 
    client.request("/test3")
  ]);
  
  // Then: Should take at least 1000ms (rate limiting delay)
  const elapsed = Date.now() - start;
  assert(elapsed >= 1000, `Expected >= 1000ms, got ${elapsed}ms`);
});
```

### 7. Cleanup and Resource Management
```typescript
Deno.test("should clean up temp files", async () => {
  const tempDir = await createTempDir();
  
  try {
    // Test implementation
    await doSomethingWithTempDir(tempDir);
    
    // Assertions
    await assertFileExists(`${tempDir}/expected-file.txt`);
  } finally {
    // Always clean up
    await cleanupTempDir(tempDir);
  }
});
```

## Debugging Tests

### Debug Mode
```bash
# Run with debug logging
LOG_LEVEL=debug deno task test

# Run single test with inspector
deno test --inspect-brk --allow-all src/modules/specific.test.ts
```

### Common Issues
1. **Flaky Tests**: Often caused by timing issues or external dependencies
2. **Test Isolation**: Tests affecting each other due to shared state
3. **Mock Issues**: Incorrectly configured mocks causing unexpected behavior
4. **Environment Variables**: Tests failing due to missing or incorrect env vars

### Test Debugging Checklist
- [ ] Are all external dependencies mocked?
- [ ] Are environment variables properly set/cleaned up?
- [ ] Are async operations properly awaited?
- [ ] Are temporary files/directories cleaned up?
- [ ] Are test assertions specific and meaningful?

## Conclusion

Following these testing guidelines ensures:
- High code quality and reliability
- Rapid feedback during development
- Confidence in deployments  
- Maintainable test suite
- Comprehensive coverage of critical functionality

For questions or improvements to these guidelines, please create an issue or submit a pull request.
