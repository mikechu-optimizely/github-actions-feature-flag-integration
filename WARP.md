# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository Overview

This is a **development repository** for the Optimizely Feature Flag Sync GitHub Action - a tool that prevents feature flag debt by automatically identifying and archiving unused feature flags. The final product will be published as a composite GitHub Action for client integration.

**Technology Stack:**
- **Runtime**: Deno 2.x with TypeScript 5.x
- **Testing**: Deno's built-in test framework
- **Distribution**: GitHub Actions composite action
- **APIs**: Optimizely Feature Experimentation REST API v2

## Development Commands

### Core Development Tasks
```bash
# Start the application (main entry point)
deno task start

# Run all tests with coverage (parallel execution enabled)
deno task test

# Run tests in watch mode for active development
deno task test:watch

# Generate coverage report
deno task test:coverage

# Run CI test suite with JUnit output
deno task test:ci
```

### Code Quality & Formatting
```bash
# Run linter
deno task lint

# Fix linting issues automatically
deno task lint:fix

# Format code
deno task fmt

# Check formatting without changes
deno task fmt:check

# Type check all TypeScript files
deno task check

# Run complete pre-commit quality checks
deno task precommit

# Run all CI checks
deno task ci
```

### Testing Individual Files
```bash
# Run specific test file
deno test src/modules/optimizely-client.test.ts --allow-all

# Run tests with specific pattern
deno test --allow-all --match="FlagValidator" src/

# Run tests without parallel execution (for debugging test isolation issues)
deno test --allow-all src/

# Run tests with specific parallelism control
deno test --allow-all --parallel --jobs=4 src/
```

## Architecture & Module Structure

### Core Architecture Pattern
The codebase follows a **modular script-based architecture** optimized for GitHub Actions execution:

```
src/
├── main.ts                    # Entry point and workflow orchestration
├── config/                    # Configuration management layer
│   ├── environment.ts         # Environment variable loading
│   └── flag-sync-config.ts    # Application configuration schema
├── modules/                   # Core business logic modules
│   ├── code-analysis.ts       # Multi-language codebase scanning
│   ├── optimizely-client.ts   # API client with rate limiting/retries
│   ├── flag-sync-core.ts      # Core synchronization workflow
│   ├── audit-reporter.ts      # Comprehensive audit logging
│   ├── compliance-reporter.ts # Compliance and governance reporting
│   └── flag-usage-reporter.ts # Usage analytics and insights
├── types/                     # TypeScript type definitions
│   └── config.ts              # Shared configuration types
└── utils/                     # Utility functions and helpers
    ├── logger.ts              # Structured logging
    ├── retry.ts               # Resilient retry logic
    └── pattern-config-manager.ts # Multi-language pattern management
```

### Key Integration Points

1. **Main Orchestrator** (`main.ts`): CLI entry point that coordinates all modules
2. **Optimizely API Client** (`optimizely-client.ts`): Enterprise-grade API client with rate limiting, retries, and comprehensive error handling
3. **Code Analysis Module** (`code-analysis.ts`): Multi-language flag detection supporting JavaScript/TypeScript, Python, Java, C#, Go, and PHP
4. **Configuration Layer** (`config/`): Environment-driven configuration with validation and defaults

## Environment Configuration

The application requires these environment variables for operation:

### Required Variables
```bash
OPTIMIZELY_API_TOKEN=your-api-token
OPTIMIZELY_PROJECT_ID=your-project-id
```

### Optional Configuration
```bash
ENVIRONMENT=auto                # Target environment
OPERATION=cleanup               # Operation type: cleanup, audit
DRY_RUN=true                   # Dry run mode (default: true)
REPORTS_PATH=reports           # Output path for reports
LOG_LEVEL=info                 # Logging level
GITHUB_TOKEN=token             # For GitHub integration
```

## CLI Usage Patterns

### Basic Operations
```bash
# Audit flags in dry run mode (default)
deno run --allow-all src/main.ts --operation audit

# Execute cleanup in production (requires --no-dry-run)
deno run --allow-all src/main.ts --operation cleanup --no-dry-run

# Target specific environment
deno run --allow-all src/main.ts --environment production
```

### Reporting and Output
```bash
# Custom reports path
deno run --allow-all src/main.ts --reports-path ./output

# Get help information
deno run --allow-all src/main.ts --help
```

## Testing Architecture

### Test Organization
- **Unit Tests**: Individual module validation (`.test.ts` files co-located with modules)
- **Integration Tests**: API interaction testing with mocks
- **Comprehensive Coverage**: Target >80% coverage for critical modules
- **Parallel Execution**: Tests designed to run safely in parallel with proper isolation

### Parallel Testing Strategy
The test suite is optimized for parallel execution to improve CI/CD performance:

```bash
# Default test execution with parallel processing
deno task test  # Uses --parallel flag automatically

# Control parallelism for resource-constrained environments
deno test --allow-all --parallel --jobs=2 src/

# Disable parallelism for debugging test isolation issues
deno test --allow-all src/  # No --parallel flag
```

### Test Isolation Best Practices
When writing tests that may run in parallel:

```typescript
// ✅ Good: Use isolated test configuration objects
Deno.test({
  name: "test with environment isolation",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () => {
    // Store and restore environment state
    const originalEnv = Deno.env.get("VARIABLE");
    try {
      // Test logic
    } finally {
      // Restore original state
      if (originalEnv) Deno.env.set("VARIABLE", originalEnv);
      else Deno.env.delete("VARIABLE");
    }
  },
});

// ❌ Avoid: Global state modifications without cleanup
Deno.test("unsafe global state test", () => {
  Deno.env.set("GLOBAL_VAR", "value");  // May interfere with parallel tests
  // ... test logic without cleanup
});
```

### Test Naming Convention
```typescript
// Pattern: TestFunctionName_Scenario_ExpectedBehavior
describe("FlagValidator", () => {
  it("should validate correct flag configuration", () => {
    // Test implementation
  });
  
  it("should reject configuration without API token", () => {
    // Test implementation
  });
});
```

## Key Design Patterns

### Configuration Management
- **Environment-First**: Configuration loaded from environment variables with sensible defaults
- **Validation Layer**: Comprehensive input validation with detailed error messages
- **Type Safety**: Strong TypeScript typing throughout configuration chain

### API Integration
- **Rate Limiting**: Built-in rate limiting for Optimizely API (default: 5 requests/second)
- **Retry Logic**: Exponential backoff retry mechanism for resilient API calls
- **Circuit Breaker**: Fail-fast pattern for unreliable external services

### Error Handling & Audit Trail
- **Structured Logging**: All operations logged with consistent structured format
- **Audit Reporter**: Comprehensive audit trail for compliance and debugging
- **Graceful Degradation**: System continues operation even with partial failures

## Performance Considerations

- **Concurrency**: Default concurrency limit of 5 for code analysis operations
- **File Size Limits**: 1MB max file size for code analysis to prevent memory issues
- **Batch Processing**: API requests batched for optimal performance
- **Caching**: Results cached where appropriate to minimize redundant operations
- **Parallel Testing**: Test suite runs in parallel by default for faster CI/CD pipelines
- **Test Isolation**: Proper test isolation ensures reliable parallel execution without race conditions

## Security & Compliance Features

- **Token Validation**: API tokens validated before use
- **Log Sanitization**: Sensitive data automatically sanitized in logs
- **Audit Trail**: Complete audit trail of all flag operations
- **Dry Run Mode**: Default dry-run mode prevents accidental changes

## Development Status

This is an **active development repository**. Current implementation status:
- ✅ Core architecture and configuration
- ✅ Type definitions and interfaces  
- 🔄 Core module implementation (in progress)
- ⏳ Integration testing (planned)
- ⏳ Performance optimization (planned)
- ⏳ GitHub Marketplace publication (planned)

## Contribution Guidelines

Follow the established patterns:
- Use Deno task commands for all operations
- Maintain comprehensive test coverage
- Follow TypeScript strict mode conventions
- **Ensure test isolation**: Write tests that can run safely in parallel without shared state conflicts
- **Test parallel execution**: Verify new tests pass with `deno task test` (which runs with `--parallel`)
- Run `deno task precommit` before submitting changes
- Follow TDD principles for new functionality

## VS Code Integration

The repository includes VS Code configuration:
- **Tasks**: Pre-configured tasks for common Deno operations
- **Settings**: Deno-specific editor settings
- **Extensions**: Recommended extensions for optimal development experience
