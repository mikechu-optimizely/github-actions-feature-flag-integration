# Optimizely Feature Flag Sync Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Optimizely%20Feature%20Flag%20Sync-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4n3NZfkznt/AEaYttUyAjbL7bVpJQd2BJ7eKYf6UNJlAwZ77myTmYm1aSjeHvHmJ0FQhfY3ORk8vb6BcKLWBAKCEBHEAA1kQEdhGhEBAQEOhRANIAABIQAxWWFPPAkEYBBhEBCGkMBACEIEACEQMYgdDwEBAQAAEAEBAAABAAABAAABAAAEAAAEAAAAAAEAAAAAAABAEAABAAAAAwABAAABAAIBAQAABAABAAABBAAKAAAAAgABAAABAAAAAAHYKkBAWHbJ8/XZaVUDBAAAAAElFTkSuQmCC)](https://github.com/marketplace/actions/optimizely-feature-flag-sync)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/optimizely/feature-flag-sync-action)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Deno Runtime](https://img.shields.io/badge/Deno-2.x-black.svg)](https://deno.com)

Automatically sync feature flags between your codebase and Optimizely Feature Experimentation. Prevent feature flag debt by identifying and archiving unused flags across JavaScript, TypeScript, Python, Java, C#, Go, and PHP codebases.

## ✨ Features

- **🔄 Automated Cleanup**: Detect and archive feature flags removed from code
- **🌍 Multi-Language Support**: Analyze JavaScript, TypeScript, Python, Java, C#, Go, and PHP
- **📊 Audit Trail**: Comprehensive logging and reporting of all flag operations  
- **🔒 Security**: Secure API authentication and data handling with audit logging
- **⚡ Performance**: Efficient processing of large codebases (100k+ lines in <5 minutes)
- **🎯 Smart Detection**: Context-aware search to avoid false positives from comments or tests
- **📋 PR Integration**: Automatic PR comments with flag change summaries
- **🛡️ Safety First**: Dry-run mode and rollback capabilities for safe operations

## 🚀 Quick Start

Add feature flag synchronization to your repository in minutes:

### 1. Create Workflow File

Create `.github/workflows/feature-flag-sync.yml` in your repository:

```yaml
name: Feature Flag Sync

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6 AM

jobs:
  sync-flags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Sync Feature Flags
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          scan-paths: 'src,lib,components'
          languages: 'typescript,javascript'
```

### 2. Configure Secrets

Add the following secrets to your repository:

- `OPTIMIZELY_SDK_KEY`: Your Optimizely SDK key
- `OPTIMIZELY_API_TOKEN`: Your Optimizely API token with flag management permissions
- `OPTIMIZELY_PROJECT_ID`: Your Optimizely project ID

### 3. That's It! 

The action will now:
- ✅ Scan your code for feature flag references
- ✅ Compare with flags in your Optimizely project
- ✅ Archive unused flags (safely in dry-run mode by default)
- ✅ Generate detailed reports and audit trails

## 📖 Usage Examples

### Basic Usage

```yaml
- name: Sync Feature Flags
  uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
```

### Advanced Configuration

```yaml
- name: Advanced Flag Sync
  uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
    scan-paths: 'src,lib,components,pages,utils'
    languages: 'typescript,javascript,python,java'
    exclude-patterns: '*.test.ts,*.spec.js,docs/**'
    dry-run: false
    operation: 'cleanup'
    max-parallel-requests: 10
```

## ⚙️ Configuration Reference

### Required Inputs

| Input | Description | Example |
|-------|-------------|----------|
| `optimizely-sdk-key` | Your Optimizely SDK key | `${{ secrets.OPTIMIZELY_SDK_KEY }}` |
| `optimizely-token` | API token with flag management permissions | `${{ secrets.OPTIMIZELY_API_TOKEN }}` |
| `project-id` | Your Optimizely project ID | `${{ secrets.OPTIMIZELY_PROJECT_ID }}` |

### Optional Inputs

| Input | Description | Default | Example |
|-------|-------------|---------|----------|
| `scan-paths` | Comma-separated paths to scan | `'src,lib'` | `'src,components,utils'` |
| `languages` | Programming languages to analyze | `'typescript,javascript'` | `'typescript,python,java'` |
| `exclude-patterns` | Patterns to exclude from scanning | `'*.test.*,docs/**'` | `'**/*.spec.js,test/**'` |
| `dry-run` | Preview changes without executing | `'true'` | `'false'` |
| `operation` | Operation type to perform | `'cleanup'` | `'audit'` or `'cleanup'` |
| `max-parallel-requests` | Max concurrent API requests | `'5'` | `'10'` |

### Outputs

| Output | Description |
|--------|-------------|
| `flags-archived` | Number of flags archived in Optimizely |
| `flags-analyzed` | Total number of flags analyzed |
| `audit-report` | Path to generated audit report |
| `summary-report` | Path to summary report file |

## 🔧 Setup Guide

### Step 1: Get Your Optimizely Credentials

1. **API Token**: Generate an API token from your [Optimizely settings](https://app.optimizely.com/v2/profile/api)
   - Required permissions: `projects:read`, `feature_flags:read`, `feature_flags:write`

2. **Project ID**: Find your project ID in the Optimizely dashboard URL:
   ```
   https://app.optimizely.com/v2/projects/YOUR_PROJECT_ID/...
   ```

3. **SDK Key**: Copy your SDK key from the Optimizely dashboard under Settings > Environments

### Step 2: Configure GitHub Secrets

In your repository, go to **Settings > Secrets and variables > Actions** and add:

```
OPTIMIZELY_API_TOKEN=your_api_token_here
OPTIMIZELY_PROJECT_ID=your_project_id_here
OPTIMIZELY_SDK_KEY=your_sdk_key_here
```

### Step 3: Create Your Workflow

See the [Quick Start](#-quick-start) section above for workflow configuration.

### Step 4: Test with Dry Run

By default, the action runs in **dry-run mode** to preview changes safely:

```yaml
with:
  dry-run: 'true'  # This is the default - previews changes only
```

Once you're satisfied with the preview, set `dry-run: 'false'` to enable actual flag archiving.

## 📚 Documentation

- **[Configuration Reference](docs/configuration.md)** - Complete configuration options and examples
- **[User Guide](docs/user-guide.md)** - Workflow patterns and best practices
- **[API Reference](docs/api-reference.md)** - Optimizely API integration details
- **[Examples](docs/examples/)** - Workflow examples for different use cases
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## 🎯 Supported Languages

| Language | File Extensions | Example Patterns |
|----------|----------------|------------------|
| **JavaScript** | `.js`, `.jsx`, `.mjs` | `optimizely.isFeatureEnabled('flag-key')` |
| **TypeScript** | `.ts`, `.tsx` | `client.isFeatureEnabled('flag-key')` |
| **Python** | `.py` | `optimizely_client.is_feature_enabled('flag-key')` |
| **Java** | `.java` | `optimizely.isFeatureEnabled("flag-key")` |
| **C#** | `.cs` | `optimizely.IsFeatureEnabled("flag-key")` |
| **Go** | `.go` | `client.IsFeatureEnabled("flag-key")` |
| **PHP** | `.php` | `$optimizely->isFeatureEnabled('flag-key')` |

## 🔄 How It Works

1. **Code Analysis**: Scans your repository for feature flag references using language-specific patterns
2. **Flag Discovery**: Fetches all feature flags from your Optimizely project
3. **Comparison**: Identifies flags that exist in Optimizely but are no longer referenced in code
4. **Safe Cleanup**: Archives unused flags (with dry-run mode for safety)
5. **Reporting**: Generates comprehensive audit trails and summary reports
6. **PR Integration**: Automatically comments on pull requests with flag change summaries

## 🛡️ Safety Features

### Dry Run Mode (Default)
The action runs in dry-run mode by default, showing you exactly what changes would be made without actually making them:

```yaml
with:
  dry-run: 'true'  # Safe preview mode (default)
```

### Comprehensive Audit Trail
- All operations are logged with timestamps
- Detailed reports show exactly what flags were analyzed, archived, or skipped
- Audit files are uploaded as workflow artifacts for 30-day retention

### Smart Exclusions
Automatically excludes common false positives:
- Test files (`*.test.js`, `*.spec.ts`, etc.)
- Documentation files (`docs/`, `README.md`, etc.)
- Configuration files and build artifacts
- Comments and string literals (context-aware)

### Rollback Capability
Archived flags can be easily restored in Optimizely if needed - archiving is a soft delete operation.

## 📊 Workflow Triggers

### Recommended Triggers

```yaml
on:
  # Check flags when code changes
  push:
    branches: [main]
  pull_request:
    branches: [main]
    
  # Weekly automated cleanup
  schedule:
    - cron: '0 6 * * 1'  # Monday 6 AM
    
  # Manual execution with options
  workflow_dispatch:
    inputs:
      operation:
        type: choice
        options: ['cleanup', 'audit']
      dry_run:
        type: boolean
        default: true
```

### Operations

- **cleanup**: Archive unused flags (default)
- **audit**: Generate reports without making changes

### Manual Override

Run manually from the Actions tab with custom parameters for one-off operations or testing.

## 🤝 Support

### Getting Help

1. **📖 Documentation**: Check our [comprehensive documentation](docs/) for detailed guides
2. **🐛 Issues**: Report bugs or request features via [GitHub Issues](../../issues)
3. **💬 Discussions**: Join the conversation in [GitHub Discussions](../../discussions)
4. **📋 Examples**: See [working examples](docs/examples/) for different scenarios

### Common Issues

- **Permission Errors**: Ensure your API token has `feature_flags:write` permissions
- **Rate Limiting**: Adjust `max-parallel-requests` if hitting API limits
- **False Positives**: Use `exclude-patterns` to skip test files and docs
- **Large Repositories**: The action automatically optimizes for large codebases

See [Troubleshooting Guide](docs/troubleshooting.md) for detailed solutions.

## 📋 Example Workflows

### Simple Weekly Cleanup

```yaml
name: Weekly Flag Cleanup
on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9 AM

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          dry-run: 'false'
```

### Multi-Environment Setup

```yaml
name: Flag Sync - Multi Environment
on: [push, pull_request]

jobs:
  sync-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY_PROD }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          
  sync-staging:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY_STAGING }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          dry-run: 'true'
```

### Custom Language Configuration

```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    # ... auth config ...
    scan-paths: 'src,backend,frontend/components'
    languages: 'typescript,python,java'
    exclude-patterns: '**/*.test.*,**/*.spec.*,docs/**,*.md'
    max-parallel-requests: 8
```

More examples available in [docs/examples/](docs/examples/).

## 🚀 Version History

- **v1.x**: Current stable release with full multi-language support
- **v1.2**: Enhanced reporting and PR comment integration
- **v1.1**: Added support for custom exclusion patterns
- **v1.0**: Initial release with core cleanup functionality

See [Releases](../../releases) for detailed changelogs.

## 📈 Metrics & Performance

- **⚡ Speed**: Processes 100k+ lines of code in under 5 minutes
- **🎯 Accuracy**: Context-aware parsing prevents false positives
- **🔒 Security**: Zero credential exposure with secure secret handling
- **📊 Reporting**: Comprehensive audit trails and summary reports
- **🌍 Scale**: Supports repositories with thousands of feature flags

## Legal Notice

This document and all artifacts related to and including a final deployed solution are for illustrative purposes and are not officially supported by Optimizely nor any other entity. The solution is a conceptual framework designed to illustrate the potential benefits and implementation strategies for automated feature flag management.

## 📄 License

This action is available under the [Apache License](LICENSE.md). 

## 🙏 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

**Made with ❤️ for the developer community**

*Streamline your feature flag management and keep your Optimizely configuration clean and efficient.*

