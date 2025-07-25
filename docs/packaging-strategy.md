# GitHub Action Packaging Strategy

## Overview

This document outlines the strategy for packaging the feature flag synchronization solution as a reusable GitHub Action for distribution to clients.

## Distribution Approach: Composite Action

### Why Composite Actions?

A **composite action** combines multiple workflow steps into a single reusable action. This approach is optimal for our feature flag synchronization solution because:

- **Simplicity**: Clients reference your action without managing multiple steps themselves
- **Flexibility**: Supports multiple operating systems and environments without Docker overhead
- **Performance**: Faster execution since no container build/pull is required
- **Transparency**: All steps are visible in the workflow run logs

### Action Structure

```yaml
name: 'Optimizely Feature Flag Sync'
description: 'Automatically sync feature flags between code and Optimizely environments'
branding:
  icon: 'flag'
  color: 'blue'

inputs:
  optimizely-sdk-key:
    description: 'Optimizely SDK key for environment'
    required: true
  optimizely-token:
    description: 'Optimizely API token'
    required: true
  project-id:
    description: 'Optimizely project ID'
    required: true
  scan-paths:
    description: 'Comma-separated paths to scan for feature flags'
    required: false
    default: 'src,lib'
  languages:
    description: 'Programming languages to scan (typescript,javascript,python,java)'
    required: false
    default: 'typescript,javascript'
  dry-run:
    description: 'Preview changes without executing them'
    required: false
    default: 'false'

outputs:
  flags-removed:
    description: 'Number of flags removed from code'
    value: ${{ steps.sync.outputs.flags-removed }}
  flags-archived:
    description: 'Number of flags archived in Optimizely'
    value: ${{ steps.sync.outputs.flags-archived }}
  audit-report:
    description: 'Path to audit report file'
    value: ${{ steps.sync.outputs.audit-report }}

runs:
  using: 'composite'
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install dependencies
      shell: bash
      run: |
        cd ${{ github.action_path }}
        npm ci --production
    
    - name: Run feature flag sync
      id: sync
      shell: bash
      env:
        OPTIMIZELY_SDK_KEY: ${{ inputs.optimizely-sdk-key }}
        OPTIMIZELY_TOKEN: ${{ inputs.optimizely-token }}
        PROJECT_ID: ${{ inputs.project-id }}
        SCAN_PATHS: ${{ inputs.scan-paths }}
        LANGUAGES: ${{ inputs.languages }}
        DRY_RUN: ${{ inputs.dry-run }}
      run: |
        cd ${{ github.action_path }}
        node dist/index.js
```

## Client Usage

### Basic Implementation

```yaml
name: Feature Flag Sync
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  sync-flags:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Sync Feature Flags
        uses: optimizely/feature-flag-sync-action@v1
        with:
          optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
          optimizely-token: ${{ secrets.OPTIMIZELY_TOKEN }}
          project-id: '12345'
          scan-paths: 'src,components,pages'
          languages: 'typescript,javascript'
          dry-run: ${{ github.event_name == 'pull_request' }}
```

### Advanced Configuration

```yaml
- name: Sync Feature Flags with Custom Settings
  uses: optimizely/feature-flag-sync-action@v1
  with:
    optimizely-sdk-key: ${{ secrets.OPTIMIZELY_SDK_KEY }}
    optimizely-token: ${{ secrets.OPTIMIZELY_TOKEN }}
    project-id: ${{ vars.OPTIMIZELY_PROJECT_ID }}
    scan-paths: 'src,lib,components,pages,utils'
    languages: 'typescript,javascript,python'
    dry-run: false
    exclude-patterns: '*.test.ts,*.spec.js'
    flag-prefix: 'my_app_'
```

## Repository Structure

```
optimizely-feature-flag-sync-action/
├── src/
│   ├── main.ts
│   ├── code-scanner/
│   │   ├── index.ts
│   │   ├── parsers/
│   │   │   ├── typescript.ts
│   │   │   ├── javascript.ts
│   │   │   ├── python.ts
│   │   │   └── java.ts
│   │   └── scanner.ts
│   ├── optimizely/
│   │   ├── client.ts
│   │   ├── flag-manager.ts
│   │   └── types.ts
│   ├── config/
│   │   ├── schema.ts
│   │   └── validator.ts
│   └── utils/
│       ├── logger.ts
│       └── audit.ts
├── dist/
│   └── index.js
├── examples/
│   ├── basic-workflow.yml
│   ├── advanced-config.yml
│   └── multi-environment.yml
├── docs/
│   ├── configuration.md
│   ├── supported-languages.md
│   └── troubleshooting.md
├── action.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Distribution Strategy

### GitHub Marketplace

1. **Public Repository**: Host the action in a public GitHub repository with semantic versioning tags
2. **Marketplace Listing**: Submit to GitHub Marketplace for discoverability
3. **Documentation**: Provide comprehensive setup guides and configuration examples
4. **Release Process**: Use GitHub releases with proper versioning (v1, v1.2.3) for client stability

### Version Management

- **Major versions** (v1, v2): Breaking changes to inputs/outputs or behavior
- **Minor versions** (v1.1, v1.2): New features, additional language support
- **Patch versions** (v1.1.1, v1.1.2): Bug fixes, security updates

### Security Considerations

- **Secrets Management**: Document proper use of GitHub Secrets for API tokens
- **Permissions**: Clearly define required repository permissions
- **Audit Trail**: Ensure all actions are logged and traceable
- **Rollback Capability**: Provide mechanisms to undo automated changes

## Testing Strategy

### Action Testing

- **Unit Tests**: Test individual components and parsers
- **Integration Tests**: Test with real Optimizely APIs (using test environments)
- **End-to-End Tests**: Test complete workflows in sample repositories
- **Multi-Language Tests**: Validate parsing across supported languages

### Client Validation

- **Sample Repositories**: Provide reference implementations
- **Documentation Examples**: Ensure all examples are tested and working
- **Version Compatibility**: Test with different GitHub Actions runner versions

## Support and Maintenance

### Documentation

- **Getting Started Guide**: Step-by-step setup instructions
- **Configuration Reference**: Complete input/output documentation
- **Troubleshooting Guide**: Common issues and solutions
- **Migration Guide**: Updates between major versions

### Community Support

- **Issue Templates**: Structured bug reports and feature requests
- **Contributing Guidelines**: How community members can contribute
- **Security Policy**: How to report security vulnerabilities
- **Release Notes**: Clear communication of changes and improvements

This packaging strategy ensures maximum adoption while maintaining the flexibility and reliability required for enterprise feature flag management.
