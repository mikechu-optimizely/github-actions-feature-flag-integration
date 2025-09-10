# User Guide: Optimizely Feature Flag Sync Action

## Overview

The Optimizely Feature Flag Sync Action automates the cleanup of unused feature flags in your codebase by comparing your code references with your Optimizely Feature Experimentation project configuration. This guide provides comprehensive information on how to implement, configure, and optimize the action for your specific use cases.

## Table of Contents

- [Getting Started](#getting-started)
- [Workflow Patterns](#workflow-patterns)
- [Best Practices](#best-practices)
- [Common Scenarios](#common-scenarios)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)
- [Migration and Adoption](#migration-and-adoption)

## Getting Started

### Prerequisites

Before using the action, ensure you have:

1. **Optimizely Account**: Access to Optimizely Feature Experimentation
2. **API Permissions**: API token with flag management permissions
3. **Repository Access**: Admin or write access to your GitHub repository
4. **Project Setup**: Feature flags already configured in your Optimizely project

### Basic Setup

1. **Generate API Token**
   ```
   Navigate to: Optimizely Dashboard > Settings > API Tokens
   Required permissions: projects:read, feature_flags:read, feature_flags:write
   ```

2. **Add Repository Secrets**
   ```
   OPTIMIZELY_API_TOKEN=your_api_token
   OPTIMIZELY_PROJECT_ID=your_project_id
   OPTIMIZELY_SDK_KEY=your_sdk_key
   ```

3. **Create Workflow File**
   ```yaml
   # .github/workflows/feature-flag-sync.yml
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
         - uses: optimizely/feature-flag-sync-action@v1
           with:
             optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
             optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
             project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
   ```

## Workflow Patterns

### 1. Continuous Integration Pattern

**Use Case**: Validate flag changes on every code change

```yaml
name: CI Flag Validation

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  validate-flags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Flag Usage
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          operation: 'audit'  # Only audit, don't archive
          dry-run: 'true'
```

**Benefits**:
- Early detection of flag inconsistencies
- PR-level feedback on flag usage
- No accidental flag archiving during development

### 2. Scheduled Cleanup Pattern

**Use Case**: Regular maintenance of feature flag hygiene

```yaml
name: Weekly Flag Cleanup

on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9 AM
  workflow_dispatch:     # Allow manual execution

jobs:
  cleanup-flags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Clean Up Unused Flags
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          operation: 'cleanup'
          dry-run: 'false'  # Actual cleanup
          
      - name: Notify Team
        if: always()
        run: |
          echo "Flag cleanup completed. Check artifacts for details."
```

**Benefits**:
- Regular maintenance without manual intervention  
- Configurable timing based on team workflows
- Comprehensive reporting for team visibility

### 3. Multi-Environment Pattern

**Use Case**: Different behavior for production vs staging environments

```yaml
name: Multi-Environment Flag Sync

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  production-sync:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Production Flag Sync
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY_PROD }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          dry-run: 'false'
          exclude-patterns: '*.test.*,**/__tests__/**'

  staging-validation:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Staging Flag Validation
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY_STAGING }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          operation: 'audit'
          dry-run: 'true'
```

**Benefits**:
- Safe validation in staging environments
- Production-grade cleanup only on main branch
- Environment-specific configuration

### 4. Feature Branch Integration Pattern

**Use Case**: Validate flag usage during feature development

```yaml
name: Feature Branch Flag Check

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  flag-impact-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for comparison
          
      - name: Analyze Flag Changes
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
          optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}
          project-id: ${{ secrets.OPTIMIZELY_PROJECT_ID }}
          operation: 'audit'
          scan-paths: 'src,lib,components'
          
      - name: PR Comment with Flag Summary
        uses: actions/github-script@v7
        if: always()
        with:
          script: |
            // The action automatically generates PR comments
            // This step can add custom logic if needed
            console.log('Flag analysis completed for PR');
```

**Benefits**:
- PR-specific flag impact analysis
- Early detection of flag additions/removals
- Team visibility into flag usage changes

## Best Practices

### 1. Safety First

#### Always Start with Dry Run
```yaml
- name: Safe Flag Sync (Recommended)
  uses: optimizely/feature-flag-sync-action@v1
  with:
    dry-run: 'true'  # Preview changes first
    # ... other config
```

#### Use Staged Rollout
1. **Week 1**: Audit-only mode to understand current state
2. **Week 2**: Dry-run cleanup to preview changes
3. **Week 3**: Enable actual cleanup with manual review
4. **Week 4+**: Fully automated cleanup

### 2. Configuration Management

#### Environment-Specific Configuration
```yaml
# Use different configurations for different environments
production:
  dry-run: 'false'
  max-parallel-requests: 3  # Conservative for production
  exclude-patterns: '*.test.*,docs/**'

staging:
  dry-run: 'true'
  max-parallel-requests: 10  # More aggressive for testing
  operation: 'audit'
```

#### Language-Specific Patterns
```yaml
# Tailor to your technology stack
javascript-heavy:
  languages: 'javascript,typescript'
  scan-paths: 'src,components,pages,utils'
  exclude-patterns: '**/*.test.js,**/*.spec.ts,jest.config.js'

polyglot:
  languages: 'typescript,python,java,go'
  scan-paths: 'frontend/src,backend/src,services'
  exclude-patterns: '**/test/**,**/*_test.*,**/tests/**'
```

### 3. Team Workflow Integration

#### Code Review Integration
```yaml
- name: Flag Change Review
  if: github.event_name == 'pull_request'
  uses: optimizely/feature-flag-sync-action@v1
  with:
    operation: 'audit'
    # Generate detailed reports for code review
```

#### Notification Patterns
```yaml
- name: Team Notification
  if: failure()
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: 'Flag Sync Issue - Manual Review Required',
        body: `Flag synchronization encountered issues. Please review.`,
        labels: ['flag-sync', 'maintenance']
      });
```

## Common Scenarios

### Scenario 1: Large Monorepo

**Challenge**: Performance with 100k+ lines of code across multiple services

**Solution**:
```yaml
- name: Optimized Large Repo Sync
  uses: optimizely/feature-flag-sync-action@v1
  with:
    scan-paths: 'services/*/src,shared/components'
    exclude-patterns: |
      **/node_modules/**,
      **/dist/**,
      **/build/**,
      **/*.test.*,
      **/test/**,
      **/tests/**,
      docs/**
    max-parallel-requests: 8
    languages: 'typescript,javascript'
```

**Key Optimizations**:
- Specific scan paths to avoid unnecessary directories
- Comprehensive exclusion patterns
- Balanced parallel request limits
- Language filtering to improve performance

### Scenario 2: Multi-Team Organization

**Challenge**: Different teams with different flag naming conventions

**Solution**:
```yaml
# Team-specific workflow
- name: Frontend Team Flag Sync
  uses: optimizely/feature-flag-sync-action@v1
  with:
    scan-paths: 'frontend/src,shared/ui'
    languages: 'typescript,javascript'
    exclude-patterns: 'backend/**,**/*.test.*'
    flag-prefix: 'frontend_'  # If using prefixes

- name: Backend Team Flag Sync
  uses: optimizely/feature-flag-sync-action@v1
  with:
    scan-paths: 'backend/src,shared/api'
    languages: 'typescript,python'
    exclude-patterns: 'frontend/**,**/*.test.*'
    flag-prefix: 'backend_'
```

### Scenario 3: Legacy Code Migration

**Challenge**: Migrating from old feature flag system to Optimizely

**Solution**:
```yaml
- name: Migration-Aware Flag Sync
  uses: optimizely/feature-flag-sync-action@v1
  with:
    operation: 'audit'  # Audit-only during migration
    scan-paths: 'src'
    exclude-patterns: |
      **/legacy/**,
      **/old-flags/**,
      **/*.deprecated.*
    languages: 'typescript,javascript'
```

**Migration Strategy**:
1. **Phase 1**: Audit-only to understand current state
2. **Phase 2**: Gradual migration with manual review
3. **Phase 3**: Full automation after migration complete

### Scenario 4: Compliance and Governance

**Challenge**: Regulatory requirements for flag lifecycle management

**Solution**:
```yaml
- name: Compliance-Focused Flag Management
  uses: optimizely/feature-flag-sync-action@v1
  with:
    operation: 'audit'
    dry-run: 'true'
    # Always generate reports for compliance
    
- name: Upload Compliance Report
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: compliance-flag-report-${{ github.run_number }}
    path: reports/
    retention-days: 2555  # 7 years retention
```

**Compliance Features**:
- Comprehensive audit trails
- Immutable reporting artifacts
- Long-term retention policies
- Manual approval workflows

## Advanced Configuration

### Custom Exclusion Patterns

```yaml
# Comprehensive exclusion patterns
exclude-patterns: |
  # Test files
  **/*.test.*,
  **/*.spec.*,
  **/test/**,
  **/tests/**,
  **/__tests__/**,
  
  # Documentation
  docs/**,
  **/*.md,
  
  # Build artifacts
  **/dist/**,
  **/build/**,
  **/node_modules/**,
  
  # Configuration files
  **/*.config.*,
  **/.*rc.*,
  
  # Legacy or deprecated code
  **/legacy/**,
  **/*.deprecated.*
```

### Performance Tuning

```yaml
# Performance optimization configuration
max-parallel-requests: 10    # Adjust based on API limits
languages: 'typescript'      # Limit to relevant languages
scan-paths: 'src,lib'        # Specific paths only
```

### Error Handling

```yaml
- name: Flag Sync with Error Handling
  uses: optimizely/feature-flag-sync-action@v1
  with:
    # ... configuration
  continue-on-error: true  # Don't fail the entire workflow

- name: Handle Sync Errors
  if: failure()
  run: |
    echo "Flag sync failed, creating issue for manual review"
    # Custom error handling logic
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Permission Errors
**Error**: `API token does not have required permissions`

**Solution**:
- Verify API token has `feature_flags:write` permissions
- Check project access permissions
- Regenerate API token if necessary

#### 2. Rate Limiting
**Error**: `API rate limit exceeded`

**Solution**:
```yaml
with:
  max-parallel-requests: 3  # Reduce concurrent requests
```

#### 3. False Positives
**Error**: `Flag incorrectly identified as unused`

**Solution**:
```yaml
with:
  exclude-patterns: |
    **/config/**,
    **/*.json,
    # Add patterns for dynamic flag usage
```

#### 4. Large Repository Performance
**Error**: `Workflow timeout or slow execution`

**Solution**:
```yaml
- name: Optimized Scanning
  with:
    scan-paths: 'src,components'  # Limit scan scope
    languages: 'typescript'       # Filter languages
    exclude-patterns: '**/node_modules/**,**/dist/**'
```

### Debug Mode

Enable verbose logging for troubleshooting:

```yaml
- name: Debug Flag Sync
  uses: optimizely/feature-flag-sync-action@v1
  with:
    # ... configuration
  env:
    DEBUG: 'true'
    VERBOSE_LOGGING: 'true'
```

## Migration and Adoption

### Gradual Adoption Strategy

#### Phase 1: Assessment (Week 1-2)
```yaml
# Audit-only to understand current state
with:
  operation: 'audit'
  dry-run: 'true'
```

#### Phase 2: Testing (Week 3-4)
```yaml
# Enable dry-run cleanup
with:
  operation: 'cleanup'
  dry-run: 'true'
```

#### Phase 3: Controlled Rollout (Week 5-6)
```yaml
# Limited cleanup with manual review
with:
  operation: 'cleanup'
  dry-run: 'false'
  max-parallel-requests: 2
```

#### Phase 4: Full Automation (Week 7+)
```yaml
# Full automation with monitoring
with:
  operation: 'cleanup'
  dry-run: 'false'
```

### Team Training

1. **Developer Education**: Understanding flag lifecycle
2. **Workflow Integration**: Incorporating into development process
3. **Monitoring Setup**: Tracking flag health metrics
4. **Incident Response**: Handling flag-related issues

### Success Metrics

Track these metrics to measure adoption success:

- **Flag Debt Reduction**: Number of unused flags archived
- **Development Velocity**: Reduced manual flag management overhead
- **Code Quality**: Improved flag usage consistency
- **Team Productivity**: Less time spent on flag maintenance

## Conclusion

The Optimizely Feature Flag Sync Action provides powerful automation for feature flag lifecycle management. By following the patterns and practices outlined in this guide, you can implement a robust, safe, and efficient flag cleanup process that scales with your organization's needs.

Remember to:
- Start with audit-only mode to understand your current state
- Use dry-run mode extensively during initial setup
- Implement comprehensive exclusion patterns
- Monitor and iterate on your configuration
- Maintain team awareness of flag management practices

For additional support, see the [troubleshooting guide](troubleshooting.md) and [configuration reference](configuration.md).
