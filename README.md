# Optimizely Feature Flag Sync Action - Development Repository

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/mikechu-optimizely/github-actions-feature-flag-integration)
[![Deno Version](https://img.shields.io/badge/Deno-2.x-blue.svg)](https://deno.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

This repository contains the development source code for the **Optimizely Feature Flag Sync GitHub Action** - a reusable action that helps prevent feature flag debt by automatically identifying and archiving unused feature flags in client repositories.

> **Note**: This is the development repository. For usage instructions and implementation examples, see the [published GitHub Action](https://github.com/marketplace/actions/optimizely-feature-flag-sync) and [packaging strategy documentation](docs/packaging-strategy.md).

## What This Repository Contains

This development repository includes:

- **Source Code**: TypeScript/Deno implementation of the feature flag synchronization logic
- **Documentation**: Technical specifications, API documentation, and implementation guides  
- **Test Suite**: Comprehensive testing framework and test cases
- **Development Tools**: Build scripts, linting, and formatting configurations
- **Examples**: Reference implementations and client usage examples

## Target End Product

The final deliverable will be a **composite GitHub Action** that clients can easily integrate into their repositories:

```yaml
- name: Sync Feature Flags
  uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_TOKEN }}
    project-id: '12345'
    scan-paths: 'src,components,pages'
    languages: 'typescript,javascript'
```

## Key Features

The published action will provide:

- **Automated Cleanup**: Detects and archives feature flags removed from code
- **Multi-Language Support**: Analyzes JavaScript, TypeScript, Python, Java, C#, Go, and PHP codebases
- **Audit Trail**: Comprehensive logging and reporting of all flag operations
- **Security**: Secure API authentication and data handling
- **Performance**: Efficient processing of large codebases (100k+ lines in <5 minutes)

## Development Setup

### Prerequisites

- [Deno 2.x](https://deno.com/manual@v2.0.0/getting_started/installation) (latest stable)
- Git for version control
- VS Code (recommended) with Deno extension

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/mikechu-optimizely/github-actions-feature-flag-integration.git
   cd github-actions-feature-flag-integration
   ```

2. **Setup environment variables** (for testing)
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit with your test credentials
   # OPTIMIZELY_API_TOKEN=your-test-token
   # OPTIMIZELY_PROJECT_ID=your-test-project-id
   ```

3. **Run development tasks**
   ```bash
   # Install dependencies and run tests
   deno task test

   # Run linting and formatting
   deno task lint
   deno task fmt

   # Run the core logic locally (for testing)
   deno run --allow-all src/main.ts
   ```

### Available Development Scripts

- `deno task test` - Run all tests
- `deno task test:watch` - Run tests in watch mode  
- `deno task test:coverage` - Generate coverage report
- `deno task lint` - Run linter
- `deno task fmt` - Format code
- `deno task precommit` - Run all quality checks

## Architecture & Design

### Technology Stack
- **Runtime**: Deno 2.x for secure, modern TypeScript execution
- **Language**: TypeScript for type safety and developer experience  
- **Distribution**: GitHub Actions composite action for easy client integration
- **Testing**: Deno's built-in test framework with comprehensive coverage

### Modular Design

The codebase follows a modular architecture optimized for maintainability and testability:

```
src/
├── main.ts                    # Entry point and orchestration logic
├── config/
│   ├── environment.ts         # Environment configuration management
│   └── flag-sync-config.ts    # Application configuration schema
├── modules/
│   ├── code-analysis.ts       # Multi-language code scanning
│   ├── optimizely-client.ts   # Optimizely API integration
│   ├── flag-sync-core.ts      # Core synchronization logic
│   ├── audit-reporter.ts      # Comprehensive audit logging
│   ├── compliance-reporter.ts # Compliance and governance reporting
│   ├── flag-usage-reporter.ts # Usage analytics and insights
│   └── security.ts            # Security validation and sanitization
├── types/
│   ├── config.ts              # Configuration type definitions
│   ├── optimizely.ts          # Optimizely API type definitions
│   └── sync.ts                # Synchronization data structures
└── utils/
    ├── logger.ts              # Structured logging with levels
    ├── retry.ts               # Resilient retry logic
    └── test-helpers.ts        # Testing utilities and mocks
```

For detailed architecture documentation, see [docs/tdd.md](docs/tdd.md).

## Client Usage Examples

### Basic Implementation
See [docs/example-workflow.yml](docs/example-workflow.yml) for a complete client workflow example.

### Advanced Configuration
The published action will support extensive customization:
- Multiple programming languages
- Custom scan paths and exclusions  
- Flexible dry-run and audit modes
- Configurable reporting and notifications

## Testing Strategy

### Comprehensive Test Coverage
- **Unit Tests**: Individual module validation
- **Integration Tests**: API interaction testing
- **End-to-End Tests**: Complete workflow validation
- **Security Tests**: Vulnerability and data protection testing

### Continuous Integration
- Automated testing on all pull requests
- Code quality enforcement (linting, formatting)
- Security scanning and dependency updates
- Performance benchmarking

## Contributing

We welcome contributions to improve the Optimizely Feature Flag Sync Action! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our development process.

### Development Guidelines

- Follow TypeScript best practices and maintain type safety
- Write comprehensive tests for all new functionality  
- Include documentation for new features and changes
- Run `deno task precommit` before submitting pull requests
- Follow semantic versioning for releases

### Release Process

1. Development and testing in feature branches
2. Code review and approval process
3. Integration testing with sample repositories
4. Version tagging and GitHub release creation
5. Publication to GitHub Marketplace

## Project Documentation

- **[Product Requirements](docs/prd.md)** - Business requirements and acceptance criteria
- **[Technical Design](docs/tdd.md)** - Detailed architecture and implementation
- **[Packaging Strategy](docs/packaging-strategy.md)** - Distribution approach and client integration
- **[Example Workflow](docs/example-workflow.yml)** - Reference client implementation
- **[Development Setup](docs/dev-setup.md)** - Detailed development environment configuration
- **[API Documentation](docs/api-documentation.md)** - Complete API reference and examples

## Repository Status

This is an **active development repository**. The final GitHub Action will be published to a separate repository for distribution once development is complete.

### Current Status
- ✅ Core architecture and design
- ✅ Type definitions and interfaces  
- 🔄 Implementation of core modules (in progress)
- ⏳ Integration testing (planned)
- ⏳ Performance optimization (planned)
- ⏳ Security audit (planned)
- ⏳ GitHub Marketplace publication (planned)

## Legal Notice

This document and all artifacts related to and including a final deployed solution are for illustrative purposes and are not officially supported by Optimizely nor any other entity. The solution is a conceptual framework designed to illustrate the potential benefits and implementation strategies for automated feature flag management.

## Support

For development questions and contributions:
1. Review the [existing documentation](docs/)
2. Check [GitHub Issues](../../issues) for known problems
3. Create a new issue with detailed information about bugs or feature requests
4. Join discussions in pull requests and issues

For questions about the published GitHub Action (once available):
- See the published action's documentation and support channels

