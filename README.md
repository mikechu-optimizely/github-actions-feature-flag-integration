# Feature Flag Synchronization Solution

[![CI/CD](https://github.com/username/github-actions-feature-flag-integration/workflows/Feature%20Flag%20Synchronization/badge.svg)](https://github.com/username/github-actions-feature-flag-integration/actions)
[![Deno Version](https://img.shields.io/badge/Deno-2.x-blue.svg)](https://deno.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

An automated GitHub Actions-based solution for synchronizing feature flags between your codebase and Optimizely Feature Experimentation. This tool helps prevent feature flag debt by automatically identifying and archiving unused feature flags.

## Overview

This solution addresses the critical challenge of feature flag management by:

- **Automated Cleanup**: Automatically detects and archives feature flags that have been removed from code
- **Consistency Assurance**: Maintains alignment between code state and Optimizely feature flag configurations
- **Operational Transparency**: Provides comprehensive audit logs and reporting for all flag operations
- **Multi-Language Support**: Analyzes feature flag usage across JavaScript, TypeScript, Python, Java, C#, Go, and PHP codebases

## Architecture

The solution is built using:
- **Runtime**: Deno 2.x for secure, modern TypeScript execution
- **CI/CD Platform**: GitHub Actions for seamless repository integration
- **Language**: TypeScript for type safety and developer experience
- **Architecture**: Modular script-based approach for maintainability and testability

For detailed architecture documentation, see [docs/tdd.md](docs/tdd.md).

## Quick Start

### Prerequisites

- [Deno 2.x](https://deno.com/manual@v2.0.0/getting_started/installation) (latest stable)
- Optimizely Feature Experimentation account with API access
- GitHub repository with Actions enabled

### Installation

1. **Install Deno 2.x**

   **Windows (PowerShell):**
   ```powershell
   iwr https://deno.land/install.ps1 -useb | iex
   ```

   **macOS/Linux:**
   ```bash
   curl -fsSL https://deno.land/install.sh | sh
   ```

   **Verify installation:**
   ```bash
   deno --version
   ```

2. **Clone and Setup**
   ```bash
   git clone <your-repo-url>
   cd github-actions-feature-flag-integration
   ```

3. **Configure Environment Variables**

   Set the following environment variables in your GitHub repository secrets or local environment:

   **Required:**
   - `OPTIMIZELY_API_TOKEN` - Your Optimizely API token
   - `OPTIMIZELY_PROJECT_ID` - Your Optimizely project ID

   **Optional:**
   - `GITHUB_TOKEN` - GitHub token for repository access (auto-provided in Actions)
   - `OPERATION` - Operation type: `cleanup` or `audit` (default: `cleanup`)
   - `DRY_RUN` - Enable dry run mode: `true` or `false` (default: `true`)
   - `REPORTS_PATH` - Path for reports output (default: `reports`)
   - `LOG_LEVEL` - Logging level: `debug`, `info`, `warn`, `error` (default: `info`)

4. **Test the Setup**
   ```bash
   # Install dependencies and run tests
   deno task test

   # Run linting and formatting
   deno task lint
   deno task fmt

   # Run the application (dry-run mode by default)
   deno task start
   ```

## Usage

### Local Development

```bash
# Run in audit mode (dry-run)
deno run --allow-all src/main.ts --operation audit

# Run cleanup with dry-run disabled
deno run --allow-all src/main.ts --operation cleanup --no-dry-run

# Run with custom environment
deno run --allow-all src/main.ts --environment production --operation sync
```

### GitHub Actions

The solution runs automatically via GitHub Actions:

- **On Push**: Audits feature flag usage
- **On Pull Request**: Analyzes flag changes and comments on PR
- **Scheduled**: Weekly cleanup (Mondays at 6 AM UTC)
- **Manual**: Via workflow dispatch with configurable options

### Available Operations

1. **`sync`** (default): Comprehensive synchronization including audit and cleanup
2. **`cleanup`**: Focus on identifying and archiving unused flags
3. **`audit`**: Read-only analysis and reporting without modifications

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPTIMIZELY_API_TOKEN` | Yes | - | Optimizely API authentication token |
| `OPTIMIZELY_PROJECT_ID` | Yes | - | Optimizely project ID (numeric) |
| `OPERATION` | No | `cleanup` | Operation type: `cleanup`, `audit` |
| `DRY_RUN` | No | `true` | Enable dry-run mode (no actual changes) |
| `ENVIRONMENT` | No | `auto` | Target environment identifier |
| `REPORTS_PATH` | No | `reports` | Directory for output reports |
| `LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `API_RATE_LIMIT` | No | `5` | Optimizely API requests per second (1-100) |
| `API_TIMEOUT` | No | `30000` | API request timeout in milliseconds |
| `MAX_RETRIES` | No | `3` | Maximum API retry attempts (0-10) |
| `CONCURRENCY_LIMIT` | No | `5` | Concurrent file processing limit (1-20) |

### Code Analysis Configuration

The tool automatically excludes common non-source files:
- `node_modules/**`, `.git/**`, `dist/**`, `build/**`
- Test files: `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`
- Documentation: `**/*.md`, config files, lock files

## Project Structure

```
src/
├── main.ts                    # Entry point and CLI handling
├── config/
│   ├── environment.ts         # Environment variable loading
│   └── flag-sync-config.ts    # Configuration management
├── modules/
│   ├── code-analysis.ts       # Repository scanning and flag extraction
│   ├── optimizely-client.ts   # Optimizely API client with rate limiting
│   ├── audit-reporter.ts      # Audit logging and reporting
│   ├── compliance-reporter.ts # Compliance reporting functionality
│   ├── flag-usage-reporter.ts # Flag usage reporting
│   └── security.ts            # Security utilities and validation
├── types/
│   ├── config.ts              # Configuration types
│   ├── optimizely.ts          # Optimizely API response types
│   └── sync.ts                # Synchronization data types
└── utils/
    ├── logger.ts              # Structured logging utilities
    ├── retry.ts               # Retry logic with exponential backoff
    ├── validation.ts          # Input validation utilities
    └── try-catch.ts           # Error handling utilities
```

## Development

### Setup Development Environment

1. **Install recommended VS Code extensions:**
   - Deno (denoland.vscode-deno)
   - YAML (redhat.vscode-yaml)

2. **Configure VS Code workspace:**
   ```json
   {
     "deno.enable": true,
     "deno.lint": true,
     "deno.unstable": false
   }
   ```

3. **Run development tasks:**
   ```bash
   # Run tests with coverage
   deno task test:coverage

   # Watch mode for development
   deno task test:watch

   # Format and lint code
   deno task precommit
   ```

### Available Scripts

- `deno task start` - Run the application
- `deno task test` - Run all tests
- `deno task test:watch` - Run tests in watch mode
- `deno task test:coverage` - Run tests with coverage report
- `deno task lint` - Run linter
- `deno task fmt` - Format code
- `deno task precommit` - Run format, lint, and test

## Security

This solution implements several security measures:

- **Token Validation**: API tokens are validated for format and permissions
- **Data Sanitization**: Sensitive information is masked in logs and reports
- **Audit Logging**: All operations are logged with timestamps and context
- **Path Validation**: File paths are validated to prevent directory traversal
- **Rate Limiting**: API calls are rate-limited to prevent abuse

## Monitoring and Observability

### Reports and Artifacts

The solution generates comprehensive reports available as GitHub Actions artifacts:

- **Audit Summary**: Complete operation log with timestamps
- **Flag Usage Report**: Detailed flag usage analysis
- **Compliance Report**: Regulatory compliance information
- **PR Summary**: Change impact analysis for pull requests

### Logging

Structured logging with configurable levels:
- **DEBUG**: Detailed execution information
- **INFO**: General operational information
- **WARN**: Warning conditions that don't halt execution
- **ERROR**: Error conditions that may cause failures

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   ```bash
   # Ensure proper permissions for Deno
   deno run --allow-all src/main.ts
   ```

2. **API Rate Limiting**
   ```bash
   # Reduce API rate limit
   export API_RATE_LIMIT=3
   ```

3. **Large Codebase Performance**
   ```bash
   # Reduce concurrency for large repositories
   export CONCURRENCY_LIMIT=3
   ```

### Debug Mode

Enable debug logging for detailed troubleshooting:
```bash
export LOG_LEVEL=debug
deno task start
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Guidelines

- Follow TypeScript best practices and type safety
- Write comprehensive tests for all new functionality
- Include documentation for new features
- Run `deno task precommit` before submitting changes

## Documentation

- [Technical Design Document](docs/tdd.md) - Detailed architecture and implementation
- [Product Requirements](docs/prd.md) - Functional requirements and acceptance criteria
- [Development Setup](docs/dev-setup.md) - Detailed development environment setup
- [Task Planning](docs/tasks.md) - Implementation roadmap and progress

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Legal Notice

This document and all artifacts related to and including a final deployed solution are for illustrative purposes and are not officially supported by Optimizely nor any other entity. The solution is a conceptual framework designed to illustrate the potential benefits and implementation strategies for automated feature flag management.

## Support

For questions and support:
1. Check the troubleshooting section above
2. Review existing [GitHub Issues](../../issues)
3. Create a new issue with detailed information about your problem

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Deno Compatibility**: 2.x+  
**TypeScript Version**: 5.x+
