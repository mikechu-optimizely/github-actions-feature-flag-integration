# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository Overview

This is the **Optimizely Feature Flag Sync GitHub Action** - a production-ready tool that prevents feature flag debt by automatically identifying and archiving unused feature flags across multiple programming languages. This repository contains the complete implementation ready for GitHub Marketplace distribution.

**Technology Stack:**
- **Runtime**: Deno 2.x with TypeScript 5.x
- **Testing**: Deno's built-in test framework with serial/parallel execution
- **Distribution**: GitHub Actions composite action (marketplace-ready)
- **APIs**: Optimizely Feature Experimentation REST API v2
- **Languages Supported**: JavaScript, TypeScript, Python, Java, C#, Go, PHP

## Development Commands

### Core Development Tasks
```bash
# Start the application (main entry point)
deno task start

# Run all tests (serial tests first, then parallel tests)
deno task test

# Run only serial tests (environment-dependent tests)
deno task test:serial

# Run only parallel tests (isolated tests)
deno task test:parallel

# Run tests in watch mode for active development
deno task test:watch

# Generate coverage report (includes both serial and parallel)
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

# Run specific serial test file
deno test src/config/environment.serial.test.ts --allow-all

# Run tests with specific pattern
deno test --allow-all --match="FlagValidator" src/

# Run tests without parallel execution (for debugging test isolation issues)
deno test --allow-all src/

# Run tests with specific parallelism control
deno test --allow-all --parallel --jobs=4 --ignore='**/*.serial.test.ts' src/

# Run tests with coverage for specific file
deno test --allow-all --coverage=coverage src/modules/flag-sync-core.test.ts
```

## Architecture & Module Structure

### Core Architecture Pattern
The codebase follows a **modular script-based architecture** optimized for GitHub Actions execution:

```
src/
├── main.ts                           # Entry point and workflow orchestration
├── config/                           # Configuration management layer
│   ├── environment.ts                # Environment variable loading
│   └── flag-sync-config.ts           # Application configuration schema
├── modules/                          # Core business logic modules
│   ├── audit-reporter.ts             # Comprehensive audit logging
│   ├── cleanup-plan-manager.ts       # Cleanup plan creation and management
│   ├── code-analysis.ts              # Multi-language codebase scanning
│   ├── compliance-reporter.ts        # Compliance and governance reporting
│   ├── consistency-validator.ts      # Cross-system consistency validation
│   ├── flag-status-verifier.ts       # Flag status verification across environments
│   ├── flag-sync-core.ts             # Core synchronization workflow
│   ├── flag-usage-reporter.ts        # Usage analytics and insights
│   ├── optimizely-client.ts          # API client with rate limiting/retries
│   ├── plan-preview.ts               # Plan preview and visualization
│   └── unused-flag-manager.ts        # Unused flag identification and management
├── types/                            # TypeScript type definitions
│   ├── config.ts                     # Shared configuration types
│   ├── optimizely.ts                 # Optimizely API response types
│   └── sync.ts                       # Synchronization operation types
└── utils/                            # Utility functions and helpers
    ├── api-fallback.ts               # API fallback mechanisms
    ├── api-health-monitor.ts         # API health monitoring
    ├── approval-workflow-manager.ts  # Approval workflow coordination
    ├── circuit-breaker.ts            # Circuit breaker pattern implementation
    ├── emergency-control-manager.ts  # Emergency control and safety mechanisms
    ├── error-recovery.ts             # Error recovery strategies
    ├── logger.ts                     # Structured logging
    ├── override-audit-tracker.ts     # Override configuration audit tracking
    ├── override-config-manager.ts    # Override configuration management
    ├── pattern-config-manager.ts     # Multi-language pattern management
    ├── retry.ts                      # Resilient retry logic
    ├── test-helpers.ts               # Testing utilities and fixtures
    ├── try-catch.ts                  # Enhanced error handling utilities
    └── validation.ts                 # Input validation utilities
```

### Key Integration Points

1. **Main Orchestrator** (`main.ts`): CLI entry point that coordinates all modules with comprehensive error handling
2. **Optimizely API Client** (`optimizely-client.ts`): Enterprise-grade API client with circuit breakers, rate limiting, retries, and health monitoring
3. **Code Analysis Module** (`code-analysis.ts`): Multi-language flag detection supporting JavaScript/TypeScript, Python, Java, C#, Go, and PHP
4. **Flag Sync Core** (`flag-sync-core.ts`): Central synchronization workflow with plan creation and execution
5. **Cleanup Plan Manager** (`cleanup-plan-manager.ts`): Advanced cleanup planning with risk assessment and validation
6. **Configuration Layer** (`config/`): Environment-driven configuration with validation, defaults, and override support
7. **Safety Systems**: Emergency controls, circuit breakers, and approval workflows for production safety

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
- **Serial Tests**: Environment-dependent tests (`.serial.test.ts` files)
- **Integration Tests**: API interaction testing with mocks and circuit breaker testing
- **Comprehensive Coverage**: Target >80% coverage for critical modules with separate reporting
- **Hybrid Execution**: Serial tests run first, followed by parallel tests for optimal performance

### Serial/Parallel Testing Strategy
The test suite uses a sophisticated execution strategy to optimize performance while ensuring reliability:

```bash
# Default test execution: serial tests first, then parallel
deno task test  # Runs test:serial as dependency, then test:parallel

# Run only serial tests (environment manipulation, global state)
deno task test:serial

# Run only parallel tests (isolated unit tests)
deno task test:parallel

# Control parallelism for resource-constrained environments
deno test --allow-all --parallel --jobs=2 --ignore='**/*.serial.test.ts' src/

# Debug test isolation issues
deno test --allow-all src/  # No parallel execution
```

### Test Isolation Best Practices
The project uses two test execution strategies based on isolation requirements:

#### Serial Tests (*.serial.test.ts)
For tests that manipulate global state or environment variables:

```typescript
// ✅ Serial test for environment manipulation
// File: environment.serial.test.ts
Deno.test({
  name: "should load environment variables correctly",
  fn: () => {
    // Safe to manipulate environment in serial tests
    Deno.env.set("TEST_VARIABLE", "value");
    // Test logic that depends on environment state
    Deno.env.delete("TEST_VARIABLE");
  },
});
```

#### Parallel Tests (*.test.ts)
For isolated unit tests that don't share state:

```typescript
// ✅ Good: Isolated test with no shared state
Deno.test("should validate flag configuration", () => {
  const config = { apiToken: "test-token", projectId: "123" };
  // Test logic with local state only
});

// ❌ Avoid: Global state in parallel tests
Deno.test("unsafe global state test", () => {
  Deno.env.set("GLOBAL_VAR", "value");  // Will interfere with other parallel tests
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

- **Concurrency**: Default concurrency limit of 5 for code analysis operations with configurable limits
- **File Size Limits**: 1MB max file size for code analysis to prevent memory issues
- **Batch Processing**: API requests batched for optimal performance with rate limiting
- **Caching**: Results cached where appropriate to minimize redundant operations
- **Circuit Breakers**: Automatic failover and recovery for unreliable external services
- **Health Monitoring**: Continuous API health monitoring with automatic fallback mechanisms
- **Hybrid Testing**: Serial tests for environment dependencies, parallel tests for isolated units
- **Coverage Optimization**: Separate coverage collection for serial and parallel test suites
- **Emergency Controls**: Built-in safety mechanisms to prevent runaway operations

## Security & Compliance Features

- **Token Validation**: API tokens validated before use
- **Log Sanitization**: Sensitive data automatically sanitized in logs
- **Audit Trail**: Complete audit trail of all flag operations
- **Dry Run Mode**: Default dry-run mode prevents accidental changes

## Development Status

This is a **production-ready implementation** ready for GitHub Marketplace distribution. Current implementation status:
- ✅ Core architecture and configuration
- ✅ Type definitions and interfaces
- ✅ Complete module implementation (all phases completed)
- ✅ Comprehensive test coverage with serial/parallel execution
- ✅ Enterprise-grade safety features (circuit breakers, health monitoring, emergency controls)
- ✅ Multi-language support (JavaScript, TypeScript, Python, Java, C#, Go, PHP)
- ✅ Advanced cleanup planning with risk assessment
- ✅ Audit and compliance reporting
- ✅ GitHub Actions integration and marketplace documentation
- 🔄 GitHub Marketplace publication (ready for publishing)
- 🔄 Production deployment testing (ongoing)

## Contribution Guidelines

Follow the established patterns:
- Use Deno task commands for all operations
- Maintain comprehensive test coverage (>80% for critical modules)
- Follow TypeScript strict mode conventions
- **Choose appropriate test type**:
  - Use `.serial.test.ts` for environment-dependent tests
  - Use `.test.ts` for isolated unit tests that can run in parallel
- **Test execution strategy**: Verify tests pass with `deno task test` (serial first, then parallel)
- **Safety patterns**: Implement circuit breakers, health monitoring, and emergency controls for external integrations
- **Configuration management**: Use override patterns for customization without breaking defaults
- Run `deno task precommit` before submitting changes
- Follow TDD principles for new functionality
- Document enterprise patterns and safety mechanisms

## VS Code Integration

The repository includes VS Code configuration:
- **Tasks**: Pre-configured tasks for common Deno operations
- **Settings**: Deno-specific editor settings
- **Extensions**: Recommended extensions for optimal development experience
