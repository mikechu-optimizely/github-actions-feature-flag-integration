# Workflow Examples

This directory contains comprehensive workflow examples for the Optimizely Feature Flag Sync Action, covering various use cases, organizational patterns, and technical scenarios.

## Available Examples

### 🚀 [Basic Workflow](basic-workflow.yml)
**Perfect for**: Getting started, small teams, simple repositories

**Features**:
- Simple setup with minimal configuration
- Dry-run mode by default for safety
- Weekly scheduled cleanup
- Basic artifact reporting

**Use When**:
- First time setting up flag synchronization
- Small to medium-sized repositories
- Single environment or simple deployment process
- Learning the action's capabilities

---

### 🌍 [Multi-Environment Workflow](multi-environment-workflow.yml)
**Perfect for**: Teams with staging/production environments

**Features**:
- Separate staging and production handling
- Environment-specific configuration
- PR commenting integration
- Error handling and notifications
- Manual workflow dispatch options

**Use When**:
- Multiple deployment environments
- Need different behavior per environment
- Want PR-level flag change visibility
- Require production safety measures

---

### 🏢 [Monorepo Workflow](monorepo-workflow.yml)
**Perfect for**: Large organizations with multiple services

**Features**:
- Matrix strategy for different services/teams
- Service-specific configurations
- Team-specific flag prefixes
- Performance optimization for large codebases
- Aggregated reporting across services
- Selective service execution

**Use When**:
- Large monorepo with multiple services
- Different teams managing different parts
- Need service-specific flag analysis
- Performance optimization is critical
- Want team-specific reporting

---

### 💼 [Enterprise Workflow](enterprise-workflow.yml)
**Perfect for**: Enterprise organizations with strict compliance requirements

**Features**:
- Comprehensive security and compliance validation
- Manual approval gates for production changes
- Enterprise-grade audit trails (7-year retention)
- Automated compliance issue tracking
- Risk assessment and rollback capabilities
- Critical alert and escalation procedures

**Use When**:
- Strict compliance requirements (SOX, HIPAA, etc.)
- Need manual approval processes
- Require comprehensive audit trails
- Enterprise governance requirements
- Need executive summary reporting

---

### 🔧 [Language-Specific Workflows](language-specific-workflows.yml)
**Perfect for**: Projects focused on specific programming languages or frameworks

**Features**:
- Optimized configurations for each language
- Language-specific exclusion patterns
- Framework-specific scanning paths
- Custom pattern examples

**Languages Covered**:
- **Python** (Django, Flask)
- **Java** (Spring Boot)
- **C#** (.NET, .NET Core)
- **Go** (standard project structure)
- **PHP** (Laravel, Symfony)
- **React/Next.js** (frontend applications)
- **Vue.js** (frontend applications)
- **Angular** (frontend applications)
- **React Native** (mobile applications)
- **Full-Stack TypeScript** (Node.js + React)

**Use When**:
- Single-language projects
- Need language-specific optimization
- Framework-specific file structure
- Custom flag pattern detection

## How to Use These Examples

### 1. Choose Your Starting Point

Select the example that best matches your current setup:

- **New to the action?** Start with [Basic Workflow](basic-workflow.yml)
- **Have staging/production?** Use [Multi-Environment Workflow](multi-environment-workflow.yml)
- **Large monorepo?** Adapt [Monorepo Workflow](monorepo-workflow.yml)
- **Enterprise requirements?** Implement [Enterprise Workflow](enterprise-workflow.yml)
- **Specific language/framework?** Check [Language-Specific Workflows](language-specific-workflows.yml)

### 2. Copy and Customize

1. **Copy** the relevant workflow file to `.github/workflows/` in your repository
2. **Rename** it to something appropriate (e.g., `feature-flag-sync.yml`)
3. **Customize** the configuration for your specific needs:
   - Update `scan-paths` for your repository structure
   - Adjust `languages` for your tech stack
   - Modify `exclude-patterns` for your build artifacts
   - Configure `schedule` timing for your team's workflow

### 3. Set Up Repository Secrets

All workflows require these basic secrets:

```
OPTIMIZELY_SDK_KEY=your_sdk_key_here
OPTIMIZELY_API_TOKEN=your_api_token_here
OPTIMIZELY_PROJECT_ID=your_project_id_here
```

**For multi-environment setups**, also add:
```
OPTIMIZELY_SDK_KEY_STAGING=staging_sdk_key
OPTIMIZELY_SDK_KEY_PROD=production_sdk_key
```

### 4. Test Safely

1. **Start with dry-run mode** (default in all examples)
2. **Run manually** using `workflow_dispatch` to test
3. **Check the reports** in workflow artifacts
4. **Gradually enable** actual flag archiving

## Configuration Customization

### Common Customizations

#### Repository Structure
```yaml
# Adjust scan paths for your structure
scan-paths: 'src,lib,components,services'

# For monorepos
scan-paths: 'apps/frontend/src,apps/backend/src,packages/shared'

# For specific frameworks
scan-paths: 'src/main/java,src/main/resources'  # Java
scan-paths: 'app,src,lib'                        # PHP Laravel
```

#### Language Support
```yaml
# Single language
languages: 'typescript'

# Multiple languages
languages: 'typescript,python,java'

# Full-stack
languages: 'typescript,javascript,python'
```

#### Exclusion Patterns
```yaml
exclude-patterns: |
  # Test files
  **/*.test.*
  **/*.spec.*
  **/test/**
  
  # Build artifacts  
  **/node_modules/**
  **/dist/**
  **/build/**
  
  # Documentation
  docs/**
  **/*.md
```

#### Performance Tuning
```yaml
# For large repositories
max-parallel-requests: 3
env:
  SCAN_TIMEOUT: '600000'  # 10 minutes
  MEMORY_LIMIT: '4GB'

# For smaller repositories
max-parallel-requests: 10
env:
  SCAN_TIMEOUT: '300000'  # 5 minutes
```

### Advanced Customizations

#### Custom Flag Patterns
Create `.github/optimizely-sync.yml`:

```yaml
custom-patterns:
  typescript:
    - pattern: 'FeatureFlags\.([A-Z_]+)'
      flag-group: 1
    - pattern: 'useFeatureFlag\([\'"]([^\'\"]+)[\'"]\)'
      flag-group: 1
```

#### Environment-Specific Overrides
```yaml
environments:
  production:
    dry-run: false
    max-parallel-requests: 3
    exclude-patterns: ['**/*.test.*', '**/staging/**']
    
  staging:
    dry-run: true
    max-parallel-requests: 10
    operation: 'audit'
```

## Migration Between Examples

### From Basic to Multi-Environment

1. Add environment-specific secrets
2. Create GitHub environments (staging, production)
3. Add conditional logic based on branch/environment
4. Configure environment-specific exclusions

### From Single Repository to Monorepo

1. Implement matrix strategy
2. Define service-specific configurations
3. Add aggregated reporting
4. Configure team-specific flag prefixes

### From Standard to Enterprise

1. Add pre-flight security checks
2. Implement manual approval gates
3. Set up compliance reporting
4. Configure long-term artifact retention
5. Add automated compliance tracking

## Troubleshooting Examples

### Common Issues

#### Workflow Not Triggering
- Check branch names in `on.push.branches`
- Verify workflow file is in `.github/workflows/`
- Ensure YAML syntax is valid

#### Permission Errors
```yaml
# Add this if you get permission errors
permissions:
  contents: read
  issues: write  # For PR comments
  actions: read  # For workflow artifacts
```

#### Performance Issues
```yaml
# Reduce scope and increase timeout
scan-paths: 'src'  # Limit to essential directories
env:
  SCAN_TIMEOUT: '900000'  # 15 minutes
  MEMORY_LIMIT: '8GB'
```

#### Rate Limiting
```yaml
# Reduce concurrent requests
max-parallel-requests: 3

# Add delays
env:
  API_RETRY_DELAY: '2000'  # 2 seconds between retries
```

### Debug Mode

Add this to any workflow for troubleshooting:

```yaml
env:
  DEBUG: 'true'
  VERBOSE_LOGGING: 'true'
  LOG_LEVEL: 'debug'
```

## Best Practices

### 1. Start Simple
- Begin with the Basic Workflow
- Test thoroughly in dry-run mode
- Gradually add complexity

### 2. Safety First
- Always start with `dry-run: 'true'`
- Test with manual triggers before automation
- Set up proper exclusion patterns

### 3. Monitor and Iterate
- Review workflow artifacts regularly
- Adjust exclusion patterns based on false positives
- Tune performance settings based on execution time

### 4. Team Communication
- Use PR comments for team visibility
- Set up failure notifications
- Document your configuration choices

## Need Help?

- **Configuration Issues**: See [Configuration Reference](../configuration.md)
- **General Usage**: See [User Guide](../user-guide.md)
- **API Details**: See [API Reference](../api-reference.md)
- **Troubleshooting**: Check the [Troubleshooting Guide](../troubleshooting.md)

---

**Remember**: These examples are starting points. Customize them for your specific needs, repository structure, and organizational requirements.
