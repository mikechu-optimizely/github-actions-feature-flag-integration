# Configuration Reference

## Overview

This document provides comprehensive details about all configuration options available for the Optimizely Feature Flag Sync Action. Understanding these options allows you to tailor the action to your specific repository structure, development workflow, and organizational requirements.

## Table of Contents

- [Action Inputs](#action-inputs)
- [Action Outputs](#action-outputs)
- [Environment Variables](#environment-variables)
- [Configuration Files](#configuration-files)
- [Language Support](#language-support)
- [Pattern Matching](#pattern-matching)
- [Advanced Configuration](#advanced-configuration)
- [Examples](#examples)

## Action Inputs

All inputs are configured in your GitHub workflow file under the `with:` section of the action step.

### Required Inputs

#### `optimizely-sdk-key`
- **Type**: String (Required)
- **Description**: Your Optimizely SDK key for the environment
- **Example**: `${{ secrets.OPTIMIZELY_SDK_KEY }}`
- **Notes**: 
  - Different environments (staging/production) should use different SDK keys
  - Store as a GitHub repository secret
  - Format: Usually starts with SDK key prefix

```yaml
with:
  optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
```

#### `optimizely-token`
- **Type**: String (Required)
- **Description**: Your Optimizely API token with feature flag management permissions
- **Example**: `${{ secrets.OPTIMIZELY_API_TOKEN }}`
- **Required Permissions**:
  - `projects:read`
  - `feature_flags:read`
  - `feature_flags:write`
- **Notes**: 
  - Generate from Optimizely Dashboard > Settings > API Tokens
  - Store as a GitHub repository secret
  - Token should be associated with a service account

```yaml
with:
  optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
```

#### `project-id`
- **Type**: String (Required)
- **Description**: Your Optimizely project ID
- **Example**: `${{ secrets.OPTIMIZELY_PROJECT_ID }}`
- **Notes**: 
  - Found in Optimizely dashboard URL: `/v2/projects/PROJECT_ID/...`
  - Numeric string (e.g., "12345678")
  - Store as a GitHub repository secret or variable

```yaml
with:
  project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
```

### Optional Inputs

#### `scan-paths`
- **Type**: String (Optional)
- **Default**: `'src,lib'`
- **Description**: Comma-separated list of directories to scan for feature flag references
- **Examples**:
  - `'src,components,utils'`
  - `'frontend/src,backend/src,shared'`
  - `'.'` (scan entire repository)

```yaml
with:
  scan-paths: 'src,lib,components,pages'
```

**Best Practices**:
- Include only directories that contain application code
- Exclude build output directories (`dist`, `build`, `node_modules`)
- Use specific paths for better performance on large repositories

#### `languages`
- **Type**: String (Optional)
- **Default**: `'typescript,javascript'`
- **Description**: Comma-separated list of programming languages to analyze
- **Supported Languages**: 
  - `javascript` - .js, .jsx, .mjs files
  - `typescript` - .ts, .tsx files
  - `python` - .py files
  - `java` - .java files
  - `csharp` - .cs files
  - `go` - .go files
  - `php` - .php files

```yaml
with:
  languages: 'typescript,python,java'
```

#### `exclude-patterns`
- **Type**: String (Optional)
- **Default**: `'*.test.*,docs/**'`
- **Description**: Comma or newline-separated glob patterns to exclude from scanning
- **Pattern Format**: Standard glob patterns (supports `*`, `**`, `?`, `[]`)

```yaml
with:
  exclude-patterns: |
    **/*.test.*
    **/*.spec.*
    **/test/**
    **/tests/**
    docs/**
    **/*.md
```

#### `dry-run`
- **Type**: String (Boolean) (Optional)
- **Default**: `'true'`
- **Description**: When `'true'`, preview changes without executing them
- **Values**: `'true'` or `'false'`

```yaml
with:
  dry-run: 'false'  # Enable actual flag archiving
```

#### `operation`
- **Type**: String (Optional)
- **Default**: `'cleanup'`
- **Description**: Type of operation to perform
- **Values**:
  - `'cleanup'` - Archive unused flags (default)
  - `'audit'` - Generate reports without making changes

```yaml
with:
  operation: 'audit'  # Report only, no changes
```

#### `max-parallel-requests`
- **Type**: String (Number) (Optional)
- **Default**: `'5'`
- **Description**: Maximum number of concurrent API requests to Optimizely
- **Range**: 1-20 (recommended: 3-10)

```yaml
with:
  max-parallel-requests: '8'
```

**Tuning Guidelines**:
- **Low (1-3)**: Conservative, for rate-limited environments or large flag sets
- **Medium (4-7)**: Balanced performance and reliability
- **High (8-15)**: Maximum performance, ensure API limits can handle the load

#### `flag-prefix`
- **Type**: String (Optional)
- **Default**: None
- **Description**: Only process flags that start with the specified prefix
- **Example**: `'frontend_'`, `'mobile_'`

```yaml
with:
  flag-prefix: 'mobile_'  # Only process mobile_* flags
```

#### `environments`
- **Type**: String (Optional)
- **Default**: All environments
- **Description**: Comma-separated list of environment names to analyze
- **Example**: `'production,staging'`

```yaml
with:
  environments: 'production,staging'
```

#### `ignore-flags`
- **Type**: String (Optional)
- **Default**: None
- **Description**: Comma-separated list of specific flags to ignore (never archive)
- **Example**: `'critical_feature,system_maintenance'`

```yaml
with:
  ignore-flags: 'critical_feature,legacy_compatibility'
```

## Action Outputs

Outputs can be used by subsequent workflow steps using the `${{ steps.step-id.outputs.output-name }}` syntax.

### `flags-archived`
- **Type**: String (Number)
- **Description**: Number of feature flags that were archived
- **Example Usage**:

```yaml
- name: Feature Flag Sync
  id: sync-step
  uses: optimizely/feature-flag-sync-action@v1
  # ... configuration

- name: Report Results
  run: |
    echo "Archived ${{ steps.sync-step.outputs.flags-archived }} flags"
```

### `flags-analyzed`
- **Type**: String (Number)
- **Description**: Total number of flags that were analyzed
- **Notes**: Includes both used and unused flags

### `flags-found-in-code`
- **Type**: String (Number)
- **Description**: Number of flags found to be actively used in the codebase

### `flags-not-found`
- **Type**: String (Number)
- **Description**: Number of flags that exist in Optimizely but were not found in code

### `audit-report`
- **Type**: String (Path)
- **Description**: File path to the generated audit report
- **Format**: JSON file with detailed analysis results

### `summary-report`
- **Type**: String (Path)
- **Description**: File path to the human-readable summary report
- **Format**: Markdown file suitable for PR comments

### `errors-encountered`
- **Type**: String (Number)
- **Description**: Number of errors encountered during execution

## Environment Variables

Environment variables provide additional configuration options and can be set at the workflow or step level.

### Debug and Logging

#### `DEBUG`
- **Default**: `'false'`
- **Description**: Enable detailed debug logging
- **Values**: `'true'` or `'false'`

```yaml
env:
  DEBUG: 'true'
```

#### `VERBOSE_LOGGING`
- **Default**: `'false'`
- **Description**: Enable verbose output for troubleshooting
- **Values**: `'true'` or `'false'`

#### `LOG_LEVEL`
- **Default**: `'info'`
- **Description**: Set logging level
- **Values**: `'debug'`, `'info'`, `'warn'`, `'error'`

```yaml
env:
  LOG_LEVEL: 'debug'
```

### API Configuration

#### `OPTIMIZELY_API_BASE_URL`
- **Default**: `'https://api.optimizely.com/v2'`
- **Description**: Base URL for Optimizely API (for testing or enterprise instances)

#### `API_TIMEOUT`
- **Default**: `'30000'` (30 seconds)
- **Description**: Timeout for individual API requests in milliseconds

#### `API_RETRY_COUNT`
- **Default**: `'3'`
- **Description**: Number of retry attempts for failed API requests

#### `API_RETRY_DELAY`
- **Default**: `'1000'` (1 second)
- **Description**: Initial delay between retry attempts in milliseconds

### Performance Tuning

#### `SCAN_TIMEOUT`
- **Default**: `'300000'` (5 minutes)
- **Description**: Maximum time allowed for code scanning in milliseconds

#### `MEMORY_LIMIT`
- **Default**: System dependent
- **Description**: Memory limit for file processing (e.g., '512MB', '1GB')

#### `PARALLEL_FILE_PROCESSING`
- **Default**: `'true'`
- **Description**: Enable parallel processing of files
- **Values**: `'true'` or `'false'`

## Configuration Files

The action supports configuration files for complex setups and reusable configurations.

### `.github/optimizely-sync.yml`

Create this file in your repository for advanced configuration:

```yaml
# Advanced configuration file
version: 1

# Default configuration
default:
  scan-paths:
    - 'src'
    - 'lib' 
    - 'components'
  
  exclude-patterns:
    - '**/*.test.*'
    - '**/*.spec.*'
    - '**/test/**'
    - '**/tests/**'
    - 'docs/**'
    - '**/*.md'
  
  languages:
    - 'typescript'
    - 'javascript'
  
  performance:
    max-parallel-requests: 5
    api-timeout: 30000
    
# Environment-specific overrides
environments:
  production:
    dry-run: false
    max-parallel-requests: 3
    exclude-patterns:
      - '**/*.test.*'
      - '**/staging/**'
      
  staging:
    dry-run: true
    operation: 'audit'
    max-parallel-requests: 10

# Team-specific configurations
teams:
  frontend:
    scan-paths: ['frontend/src', 'shared/ui']
    languages: ['typescript', 'javascript']
    flag-prefix: 'fe_'
    
  backend:
    scan-paths: ['backend/src', 'shared/api']
    languages: ['typescript', 'python']
    flag-prefix: 'be_'
```

Reference this configuration in your workflow:

```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    config-file: '.github/optimizely-sync.yml'
    config-env: 'production'  # Use production configuration
```

## Language Support

### Language-Specific Configuration

Each supported language has specific patterns and options:

#### JavaScript/TypeScript
```yaml
languages: 'typescript,javascript'
```

**Detection Patterns**:
- `optimizely.isFeatureEnabled('flag-key')`
- `client.isFeatureEnabled('flag-key')`
- `getFeatureFlag('flag-key')`
- Template literals with flags: `` `feature-${flag}` ``

**File Extensions**: `.js`, `.jsx`, `.mjs`, `.ts`, `.tsx`

#### Python
```yaml
languages: 'python'
```

**Detection Patterns**:
- `optimizely_client.is_feature_enabled('flag-key')`
- `client.is_feature_enabled('flag-key')`
- `get_feature_flag('flag-key')`
- f-strings: `f"feature-{flag}"`

**File Extensions**: `.py`

#### Java
```yaml
languages: 'java'
```

**Detection Patterns**:
- `optimizely.isFeatureEnabled("flag-key")`
- `client.isFeatureEnabled("flag-key")`
- `getFeatureFlag("flag-key")`

**File Extensions**: `.java`

#### C#
```yaml
languages: 'csharp'
```

**Detection Patterns**:
- `optimizely.IsFeatureEnabled("flag-key")`
- `client.IsFeatureEnabled("flag-key")`
- `GetFeatureFlag("flag-key")`

**File Extensions**: `.cs`

#### Go
```yaml
languages: 'go'
```

**Detection Patterns**:
- `client.IsFeatureEnabled("flag-key")`
- `optimizely.IsFeatureEnabled("flag-key")`
- `GetFeatureFlag("flag-key")`

**File Extensions**: `.go`

#### PHP
```yaml
languages: 'php'
```

**Detection Patterns**:
- `$optimizely->isFeatureEnabled('flag-key')`
- `$client->isFeatureEnabled('flag-key')`
- `getFeatureFlag('flag-key')`

**File Extensions**: `.php`

### Custom Language Patterns

Define custom patterns for your specific codebase:

```yaml
# In .github/optimizely-sync.yml
custom-patterns:
  typescript:
    - pattern: 'FeatureFlags\.([A-Z_]+)'
      flag-group: 1
    - pattern: 'flags\.get\([\'"]([^\'\"]+)[\'"]\)'
      flag-group: 1
      
  python:
    - pattern: 'FLAGS\[[\'"]([^\'\"]+)[\'"]\]'
      flag-group: 1
```

## Pattern Matching

### Glob Patterns for Exclusions

The action supports standard glob patterns for `exclude-patterns`:

#### Basic Patterns
- `*` - Matches any number of characters within a filename
- `?` - Matches a single character
- `[abc]` - Matches any character in brackets
- `[a-z]` - Matches any character in range

#### Advanced Patterns
- `**` - Matches any number of directories
- `{a,b}` - Matches either 'a' or 'b'
- `!(pattern)` - Negation (excludes pattern)

#### Common Exclusion Examples

```yaml
exclude-patterns: |
  # Test files
  **/*.test.*
  **/*.spec.*
  **/test/**
  **/tests/**
  **/__tests__/**
  **/__mocks__/**
  
  # Documentation
  docs/**
  **/*.md
  **/README*
  
  # Build artifacts
  **/dist/**
  **/build/**
  **/out/**
  **/target/**
  **/node_modules/**
  
  # Configuration files
  **/*.config.*
  **/.*rc.*
  **/.env*
  **/package*.json
  
  # IDE and system files
  **/.vscode/**
  **/.idea/**
  **/.DS_Store
  **/Thumbs.db
  
  # Language-specific exclusions
  **/*.min.js     # Minified files
  **/*.d.ts       # TypeScript declaration files
  **/__pycache__/**  # Python cache
  **/*.class      # Java compiled files
```

### Flag Pattern Matching

The action uses sophisticated pattern matching to identify flag references:

#### Standard Patterns
```javascript
// These patterns are automatically detected:
optimizely.isFeatureEnabled('my-flag')
client.isFeatureEnabled("my-flag")
getFeatureFlag('my-flag')
isFeatureEnabled('my-flag')
```

#### Dynamic Patterns
```javascript
// These require special handling:
const flagKey = 'dynamic-flag';
optimizely.isFeatureEnabled(flagKey);

// Template literals:
optimizely.isFeatureEnabled(`prefix-${suffix}`);

// Object property access:
flags['my-flag']
flags.myFlag
```

## Advanced Configuration

### Complex Workflow Scenarios

#### Multi-Repository Setup
```yaml
strategy:
  matrix:
    repo:
      - { name: 'frontend', path: 'frontend/', languages: 'typescript,javascript' }
      - { name: 'backend', path: 'backend/', languages: 'python' }
      - { name: 'mobile', path: 'mobile/', languages: 'java,typescript' }

steps:
  - uses: optimizely/feature-flag-sync-action@v1
    with:
      scan-paths: ${{ matrix.repo.path }}
      languages: ${{ matrix.repo.languages }}
```

#### Conditional Configuration
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    dry-run: ${{ github.event_name == 'pull_request' }}
    operation: ${{ github.ref == 'refs/heads/main' && 'cleanup' || 'audit' }}
    max-parallel-requests: ${{ github.ref == 'refs/heads/main' && 3 || 10 }}
```

#### Environment-Based Configuration
```yaml
# Use GitHub environments for configuration
- uses: optimizely/feature-flag-sync-action@v1
  environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ vars.OPTIMIZELY_PROJECT_ID }}
    dry-run: ${{ vars.DRY_RUN }}
```

## Examples

### Basic Configuration
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
```

### Development Environment
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
    operation: 'audit'
    dry-run: 'true'
    scan-paths: 'src,components'
    languages: 'typescript,javascript'
    max-parallel-requests: 10
```

### Production Environment
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY_PROD }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
    operation: 'cleanup'
    dry-run: 'false'
    scan-paths: 'src,lib,components,pages'
    languages: 'typescript,javascript,python'
    exclude-patterns: |
      **/*.test.*
      **/*.spec.*
      **/test/**
      docs/**
    max-parallel-requests: 3
    environments: 'production'
```

### Polyglot Application
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
    scan-paths: 'frontend/src,backend/src,mobile/src,shared'
    languages: 'typescript,python,java,go'
    exclude-patterns: |
      **/node_modules/**
      **/dist/**
      **/build/**
      **/*.test.*
      **/*.spec.*
      **/test/**
      **/tests/**
      **/__pycache__/**
      **/target/**
      docs/**
    max-parallel-requests: 6
```

### High-Performance Configuration
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
    project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
    scan-paths: 'src'
    languages: 'typescript'
    max-parallel-requests: 15
  env:
    PARALLEL_FILE_PROCESSING: 'true'
    SCAN_TIMEOUT: '600000'  # 10 minutes
    API_TIMEOUT: '10000'    # 10 seconds
    MEMORY_LIMIT: '2GB'
```

This comprehensive configuration reference should help you optimize the Optimizely Feature Flag Sync Action for your specific use case and environment.
