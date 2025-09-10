# API Reference

## Overview

This document provides comprehensive API documentation for the Optimizely Feature Flag Sync Action, including details about Optimizely API integration patterns, rate limiting, error handling, and troubleshooting guidance.

## Table of Contents

- [Action API](#action-api)
- [Optimizely API Integration](#optimizely-api-integration)
- [Rate Limiting & Performance](#rate-limiting--performance)
- [Error Handling](#error-handling)
- [Authentication & Security](#authentication--security)
- [Data Models](#data-models)
- [API Responses](#api-responses)
- [Troubleshooting](#troubleshooting)

## Action API

### Inputs

The action accepts the following inputs via the GitHub Actions `with:` parameter:

#### Required Parameters

```yaml
optimizely-sdk-key: string
```
- **Description**: Your Optimizely SDK key for the target environment
- **Format**: SDK key string (usually starts with environment-specific prefix)
- **Example**: `${{ secrets.OPTIMIZELY_SDK_KEY }}`
- **Notes**: Different environments should use different SDK keys

```yaml
optimizely-token: string  
```
- **Description**: Optimizely API token with feature flag management permissions
- **Required Permissions**: `projects:read`, `feature_flags:read`, `feature_flags:write`
- **Example**: `${{ secrets.OPTIMIZELY_API_TOKEN }}`
- **Security**: Store as encrypted repository secret

```yaml
project-id: string
```
- **Description**: Your Optimizely project ID  
- **Format**: Numeric string (e.g., "12345678")
- **Example**: `${{ secrets.OPTIMIZELY_PROJECT_ID }}`
- **Location**: Found in Optimizely dashboard URL: `/v2/projects/PROJECT_ID/...`

#### Optional Parameters

```yaml
scan-paths: string
```
- **Description**: Comma-separated directories to scan for feature flags
- **Default**: `'src,lib'`
- **Format**: `'path1,path2,path3'`
- **Example**: `'src,components,services'`

```yaml  
languages: string
```
- **Description**: Programming languages to analyze
- **Default**: `'typescript,javascript'`  
- **Supported**: `javascript`, `typescript`, `python`, `java`, `csharp`, `go`, `php`
- **Example**: `'typescript,python,java'`

```yaml
exclude-patterns: string
```
- **Description**: Glob patterns to exclude from scanning
- **Default**: `'*.test.*,docs/**'`
- **Format**: Newline or comma-separated glob patterns
- **Example**:
  ```yaml
  exclude-patterns: |
    **/*.test.*
    **/*.spec.*
    **/node_modules/**
  ```

```yaml
dry-run: string
```
- **Description**: Preview changes without executing them
- **Default**: `'true'`
- **Values**: `'true'` | `'false'`
- **Example**: `'false'`

```yaml
operation: string  
```
- **Description**: Type of operation to perform
- **Default**: `'cleanup'`
- **Values**: `'cleanup'` | `'audit'`
- **Example**: `'audit'`

```yaml
max-parallel-requests: string
```
- **Description**: Maximum concurrent API requests
- **Default**: `'5'`
- **Range**: `'1'` to `'20'` (recommended: `'3'` to `'10'`)
- **Example**: `'8'`

### Outputs

The action provides the following outputs for use in subsequent workflow steps:

#### Summary Outputs

```yaml
flags-archived: string
```
- **Type**: Number (as string)
- **Description**: Count of feature flags archived in this execution
- **Usage**: `${{ steps.sync-step.outputs.flags-archived }}`

```yaml
flags-analyzed: string
```
- **Type**: Number (as string)  
- **Description**: Total number of flags analyzed
- **Usage**: `${{ steps.sync-step.outputs.flags-analyzed }}`

```yaml
flags-found-in-code: string
```
- **Type**: Number (as string)
- **Description**: Number of flags found actively used in codebase
- **Usage**: `${{ steps.sync-step.outputs.flags-found-in-code }}`

```yaml
flags-not-found: string
```
- **Type**: Number (as string)
- **Description**: Number of flags in Optimizely but not found in code
- **Usage**: `${{ steps.sync-step.outputs.flags-not-found }}`

#### Report Outputs

```yaml
audit-report: string
```
- **Type**: File path
- **Description**: Path to detailed JSON audit report
- **Format**: `reports/audit-report.json`
- **Contents**: Complete analysis data, API responses, flag details

```yaml
summary-report: string  
```
- **Type**: File path
- **Description**: Path to human-readable summary report
- **Format**: `reports/summary-report.md`
- **Contents**: Markdown summary suitable for PR comments

```yaml
errors-encountered: string
```
- **Type**: Number (as string)
- **Description**: Count of errors encountered during execution
- **Usage**: Use for conditional error handling steps

## Optimizely API Integration

### API Endpoints Used

The action integrates with several Optimizely Feature Experimentation API endpoints:

#### Projects API
```http
GET /v2/projects/{project_id}
```
- **Purpose**: Validate project access and retrieve project metadata
- **Authentication**: Bearer token
- **Response**: Project details, environments, settings

#### Feature Flags API
```http
GET /v2/flags?project_id={project_id}
```
- **Purpose**: Retrieve all feature flags for the project
- **Parameters**: 
  - `project_id`: Target project ID
  - `per_page`: Results per page (default: 25, max: 100)
  - `page`: Page number for pagination
- **Response**: Array of feature flag objects

```http
GET /v2/flags/{flag_id}
```
- **Purpose**: Get detailed information for specific flag
- **Parameters**: 
  - `flag_id`: Unique flag identifier
- **Response**: Complete flag configuration and metadata

```http
PATCH /v2/flags/{flag_id}
```
- **Purpose**: Archive (soft delete) a feature flag
- **Body**: `{"archived": true}`
- **Response**: Updated flag object with archived status

#### Environments API
```http
GET /v2/environments?project_id={project_id}
```
- **Purpose**: Retrieve all environments for flag status validation
- **Response**: Array of environment configurations

### API Request Patterns

#### Authentication
```typescript
headers: {
  'Authorization': `Bearer ${apiToken}`,
  'Content-Type': 'application/json'
}
```

#### Pagination Handling
```typescript
async function getAllFlags(projectId: string): Promise<Flag[]> {
  let allFlags: Flag[] = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(
      `/v2/flags?project_id=${projectId}&page=${page}&per_page=100`
    );
    
    const data = await response.json();
    allFlags.push(...data.flags);
    
    hasMore = data.flags.length === 100;
    page++;
  }
  
  return allFlags;
}
```

#### Batch Operations
```typescript
async function batchArchiveFlags(flagIds: string[]): Promise<void> {
  const batches = chunk(flagIds, 5); // Process 5 flags concurrently
  
  for (const batch of batches) {
    await Promise.all(
      batch.map(flagId => archiveFlag(flagId))
    );
    
    // Rate limiting delay
    await sleep(200); // 200ms between batches
  }
}
```

## Rate Limiting & Performance

### Optimizely API Rate Limits

**Standard Rate Limits:**
- **Requests per second**: 10 RPS per API token
- **Burst capacity**: Up to 100 requests in short bursts
- **Daily limits**: Varies by plan (typically 10,000-100,000 requests/day)

**Enterprise Rate Limits:**
- **Requests per second**: 50 RPS per API token  
- **Burst capacity**: Up to 500 requests in short bursts
- **Daily limits**: Typically 500,000+ requests/day

### Rate Limiting Strategy

The action implements sophisticated rate limiting to prevent API throttling:

#### Concurrent Request Control
```yaml
max-parallel-requests: '5'  # Default: Conservative approach
```

**Recommended Settings:**
- **Small projects** (<100 flags): `'8'` to `'10'`
- **Medium projects** (100-500 flags): `'5'` to `'8'`  
- **Large projects** (500+ flags): `'3'` to `'5'`
- **Enterprise**: `'10'` to `'15'` (with higher rate limits)

#### Adaptive Throttling

The action automatically adjusts request timing based on:
- API response times
- Rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Previous request failures
- Current queue depth

```typescript
interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  currentRps: number;
}

async function adaptiveDelay(rateLimitInfo: RateLimitInfo): Promise<void> {
  if (rateLimitInfo.remaining < 5) {
    // Aggressive throttling when nearing limits
    await sleep(1000);
  } else if (rateLimitInfo.currentRps > 8) {
    // Standard throttling
    await sleep(200);
  }
  // No delay if plenty of capacity
}
```

#### Performance Optimization

**File System Optimization:**
```yaml
env:
  PARALLEL_FILE_PROCESSING: 'true'  # Enable parallel file scanning
  SCAN_TIMEOUT: '300000'            # 5 minutes default
  MEMORY_LIMIT: '4GB'               # Memory limit for large repos
```

**API Optimization:**
```yaml
env:
  API_TIMEOUT: '30000'              # 30 second API timeout
  API_RETRY_COUNT: '3'              # Retry failed requests 3 times
  API_RETRY_DELAY: '1000'           # 1 second initial retry delay
```

### Performance Metrics

**Typical Performance:**
- **Small repo** (1k-10k files): 30-60 seconds
- **Medium repo** (10k-50k files): 1-3 minutes
- **Large repo** (50k-100k files): 3-5 minutes
- **Enterprise repo** (100k+ files): 5-10 minutes

**Performance Factors:**
- Number of files to scan
- Number of feature flags in project
- API response times
- Concurrent request limits
- Network latency

## Error Handling

### Error Categories

#### 1. Authentication Errors

**HTTP 401 Unauthorized:**
```json
{
  "error": "invalid_token",
  "error_description": "The access token provided is expired, revoked, or invalid"
}
```

**Resolution:**
- Verify API token is correct and not expired
- Check token has required permissions
- Regenerate token if necessary

**HTTP 403 Forbidden:**
```json
{
  "error": "insufficient_scope", 
  "error_description": "Token does not have required permissions"
}
```

**Resolution:**
- Ensure token has `projects:read`, `feature_flags:read`, `feature_flags:write`
- Verify project access permissions
- Contact Optimizely admin to grant permissions

#### 2. Rate Limiting Errors

**HTTP 429 Too Many Requests:**
```json
{
  "error": "rate_limit_exceeded",
  "message": "API rate limit exceeded",
  "retry_after": 60
}
```

**Automatic Handling:**
- Action automatically retries with exponential backoff
- Respects `Retry-After` header
- Reduces concurrent requests temporarily

**Manual Mitigation:**
```yaml
max-parallel-requests: '3'  # Reduce concurrent requests
env:
  API_RETRY_DELAY: '2000'   # Increase retry delay
```

#### 3. Resource Not Found Errors

**HTTP 404 Not Found:**
```json
{
  "error": "not_found",
  "message": "Project not found"
}
```

**Common Causes:**
- Incorrect project ID
- Project access permissions
- Flag deleted externally during execution

#### 4. Validation Errors

**HTTP 400 Bad Request:**
```json
{
  "error": "validation_error",
  "details": {
    "project_id": ["Project ID must be a valid integer"]
  }
}
```

**Resolution:**
- Validate all input parameters
- Check project ID format
- Verify flag IDs exist

#### 5. Server Errors

**HTTP 500 Internal Server Error:**
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

**Automatic Handling:**
- Retries with exponential backoff
- Circuit breaker prevents cascading failures
- Graceful degradation to read-only mode

### Error Recovery Strategies

#### Retry Logic
```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

async function withRetry<T>(
  operation: () => Promise<T>, 
  config: RetryConfig
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === config.maxRetries) break;
      
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempt),
        config.maxDelay
      );
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}
```

#### Circuit Breaker Pattern
```typescript
class CircuitBreaker {
  private failures = 0;
  private readonly threshold = 5;
  private readonly resetTimeout = 30000; // 30 seconds
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.failures >= this.threshold) {
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await operation();
      this.failures = 0; // Reset on success
      return result;
    } catch (error) {
      this.failures++;
      throw error;
    }
  }
}
```

### Error Reporting

#### Structured Error Logging
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "error",
  "operation": "archive_flag",
  "flag_id": "flag_123",
  "error": {
    "type": "rate_limit_exceeded", 
    "status": 429,
    "message": "API rate limit exceeded",
    "retry_after": 60
  },
  "context": {
    "attempt": 2,
    "max_retries": 3,
    "project_id": "12345"
  }
}
```

#### Error Aggregation
```typescript
interface ErrorSummary {
  totalErrors: number;
  errorsByType: Record<string, number>;
  criticalErrors: Error[];
  recoverableErrors: Error[];
}

function generateErrorReport(errors: Error[]): ErrorSummary {
  return {
    totalErrors: errors.length,
    errorsByType: countBy(errors, 'type'),
    criticalErrors: errors.filter(e => e.severity === 'critical'),
    recoverableErrors: errors.filter(e => e.severity === 'warning')
  };
}
```

## Authentication & Security

### API Token Management

#### Token Generation
1. **Navigate to Optimizely Dashboard**
   - Go to Settings → API Tokens
   - Click "Generate New Token"

2. **Configure Permissions**
   ```
   Required Permissions:
   - projects:read      (Read project information)
   - feature_flags:read (Read feature flag data)  
   - feature_flags:write (Archive unused flags)
   ```

3. **Store Securely**
   ```bash
   # Add to GitHub repository secrets
   OPTIMIZELY_API_TOKEN=your_generated_token
   ```

#### Token Validation
```typescript
async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/v2/user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return response.ok;
  } catch {
    return false;
  }
}
```

#### Permission Verification
```typescript
async function verifyPermissions(
  token: string, 
  projectId: string
): Promise<string[]> {
  const missingPermissions: string[] = [];
  
  // Test read project permission
  try {
    await fetch(`/v2/projects/${projectId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch {
    missingPermissions.push('projects:read');
  }
  
  // Test read flags permission  
  try {
    await fetch(`/v2/flags?project_id=${projectId}&per_page=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch {
    missingPermissions.push('feature_flags:read');
  }
  
  return missingPermissions;
}
```

### Security Best Practices

#### Data Sanitization
```typescript
function sanitizeForLogging(data: any): any {
  return {
    ...data,
    // Remove sensitive fields
    api_token: '[REDACTED]',
    authorization: '[REDACTED]',
    // Truncate long strings
    response_body: data.response_body?.length > 1000 
      ? data.response_body.substring(0, 1000) + '...'
      : data.response_body
  };
}
```

#### Secret Handling
```yaml
# ✅ Correct: Use secrets
optimizely-token: ${{ secrets.OPTIMIZELY_API_TOKEN }}

# ❌ Incorrect: Never hardcode
optimizely-token: 'abcd1234...'
```

#### Audit Trail Security
```typescript
interface AuditEvent {
  timestamp: string;
  actor: string;           // GitHub username
  operation: string;       // 'archive_flag', 'audit_flags'
  resource: string;        // flag_id or 'all_flags'
  result: 'success' | 'failure';
  ip_address?: string;     // If available
  user_agent?: string;     // If available
}
```

## Data Models

### Flag Object
```typescript
interface OptimizelyFlag {
  id: string;              // Unique flag identifier
  key: string;             // Flag key used in code
  name: string;            // Human-readable name
  description?: string;    // Optional description
  archived: boolean;       // Archive status
  created_time: string;    // ISO 8601 timestamp
  modified_time: string;   // ISO 8601 timestamp
  environments: {
    [key: string]: {
      enabled: boolean;
      rollout_id?: string;
      rollout_percentage?: number;
    }
  };
  variations: Array<{
    id: string;
    key: string;
    name: string;
    description?: string;
  }>;
}
```

### Project Object
```typescript
interface OptimizelyProject {
  id: string;              // Project ID
  name: string;            // Project name  
  status: 'active' | 'archived';
  created_time: string;
  environments: Environment[];
  settings: {
    include_jquery: boolean;
    ip_anonymization: boolean;
    ip_filter?: string;
  };
}
```

### Environment Object
```typescript
interface Environment {
  id: string;              // Environment ID
  key: string;             // Environment key
  name: string;            // Environment name
  description?: string;
  project_id: string;
}
```

### Sync Plan Object
```typescript
interface SyncPlan {
  operation: 'cleanup' | 'audit';
  dry_run: boolean;
  flags_to_archive: Array<{
    id: string;
    key: string;
    name: string;
    reason: string;        // Why it's being archived
    risk_level: 'low' | 'medium' | 'high';
  }>;
  flags_in_use: Array<{
    id: string;
    key: string;
    references: Array<{
      file: string;
      line: number;
      context: string;
    }>;
  }>;
  summary: {
    total_flags: number;
    flags_in_use: number;
    flags_to_archive: number;
    estimated_execution_time: number; // seconds
  };
}
```

### Audit Report Object
```typescript
interface AuditReport {
  execution_time: string;   // ISO 8601 timestamp
  project_id: string;
  operation: string;
  dry_run: boolean;
  configuration: {
    scan_paths: string[];
    languages: string[];
    exclude_patterns: string[];
    max_parallel_requests: number;
  };
  results: {
    flags_analyzed: number;
    flags_found_in_code: number;
    flags_not_found: number;
    flags_archived: number;
    errors_encountered: number;
  };
  flags: OptimizelyFlag[];
  errors: Array<{
    timestamp: string;
    type: string;
    message: string;
    flag_id?: string;
    context?: any;
  }>;
  performance: {
    total_execution_time: number;   // milliseconds
    api_request_time: number;       // milliseconds
    code_scan_time: number;         // milliseconds
    files_scanned: number;
    api_requests_made: number;
  };
}
```

## API Responses

### Successful Responses

#### Get All Flags Response
```json
{
  "flags": [
    {
      "id": "flag_123456",
      "key": "new_checkout_flow", 
      "name": "New Checkout Flow",
      "description": "A/B test for the new checkout process",
      "archived": false,
      "created_time": "2024-01-10T14:30:00Z",
      "modified_time": "2024-01-12T09:15:00Z",
      "environments": {
        "production": {
          "enabled": true,
          "rollout_percentage": 50
        },
        "staging": {
          "enabled": true, 
          "rollout_percentage": 100
        }
      },
      "variations": [
        {
          "id": "var_1",
          "key": "control",
          "name": "Control"
        },
        {
          "id": "var_2", 
          "key": "treatment",
          "name": "New Flow"
        }
      ]
    }
  ],
  "total_count": 1,
  "page": 1,
  "per_page": 25
}
```

#### Archive Flag Response
```json
{
  "id": "flag_123456",
  "key": "new_checkout_flow",
  "archived": true,
  "modified_time": "2024-01-15T10:30:00Z"
}
```

### Error Responses

#### Authentication Error
```json
{
  "error": "invalid_token",
  "error_description": "The access token provided is expired, revoked, malformed or invalid for other reasons.",
  "status": 401
}
```

#### Permission Error  
```json
{
  "error": "insufficient_scope",
  "error_description": "The token does not have the required scope for this operation.",
  "required_scopes": ["feature_flags:write"],
  "status": 403
}
```

#### Rate Limit Error
```json
{
  "error": "rate_limit_exceeded", 
  "message": "API rate limit has been exceeded.",
  "retry_after": 60,
  "limit": 10,
  "remaining": 0,
  "reset": 1642248000,
  "status": 429
}
```

#### Validation Error
```json
{
  "error": "validation_error",
  "message": "The request contains invalid parameters.",
  "details": {
    "project_id": [
      "Project ID is required",
      "Project ID must be a valid integer"
    ]
  },
  "status": 400
}
```

#### Resource Not Found
```json
{
  "error": "not_found",
  "message": "The requested resource could not be found.",
  "resource_type": "project",
  "resource_id": "12345",
  "status": 404
}
```

#### Server Error
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred. Please try again later.",
  "request_id": "req_abc123xyz",
  "status": 500
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "API token does not have required permissions"

**Problem**: Missing or insufficient API permissions

**Solutions**:
```yaml
# 1. Verify token permissions in Optimizely dashboard
# 2. Regenerate token with correct permissions:
#    - projects:read
#    - feature_flags:read  
#    - feature_flags:write
# 3. Update repository secret
```

#### 2. "Rate limit exceeded"

**Problem**: Too many API requests in short time

**Solutions**:
```yaml
# Reduce concurrent requests
max-parallel-requests: '3'

# Add retry delays
env:
  API_RETRY_DELAY: '2000'
  
# Split large operations across multiple workflow runs
```

#### 3. "Project not found"

**Problem**: Incorrect project ID or access permissions

**Solutions**:
```yaml
# 1. Verify project ID from Optimizely dashboard URL
# 2. Check project access permissions
# 3. Ensure API token has access to the project
```

#### 4. "Timeout errors"

**Problem**: Long execution times or slow API responses

**Solutions**:
```yaml
# Increase timeouts
env:
  API_TIMEOUT: '60000'      # 60 seconds
  SCAN_TIMEOUT: '900000'    # 15 minutes

# Optimize scanning scope
scan-paths: 'src'           # Limit to essential directories
exclude-patterns: '**/node_modules/**,**/dist/**'
```

#### 5. "False positives in flag detection"

**Problem**: Flags incorrectly identified as unused

**Solutions**:
```yaml
# Improve exclusion patterns
exclude-patterns: |
  **/*.test.*
  **/*.spec.*
  **/test/**
  docs/**
  **/config/**           # Configuration files
  **/*.json              # JSON files with flag references
  
# Use more specific scan paths
scan-paths: 'src/components,src/services'
```

#### 6. "Network connectivity issues"

**Problem**: Cannot reach Optimizely API

**Solutions**:
```yaml
# Add retry configuration
env:
  API_RETRY_COUNT: '5'
  API_RETRY_DELAY: '3000'
  
# Enable debug logging
env:
  DEBUG: 'true'
  VERBOSE_LOGGING: 'true'
```

### Debugging Tools

#### Enable Debug Mode
```yaml
- uses: optimizely/feature-flag-sync-action@v1
  with:
    # ... configuration
  env:
    DEBUG: 'true'
    VERBOSE_LOGGING: 'true'
    LOG_LEVEL: 'debug'
```

#### API Response Logging
```yaml
env:
  LOG_API_RESPONSES: 'true'    # Log all API responses
  LOG_API_REQUESTS: 'true'     # Log all API requests
```

#### Performance Profiling
```yaml
env:
  ENABLE_PROFILING: 'true'     # Enable performance profiling
  PROFILE_FILE_OPERATIONS: 'true'  # Profile file scanning
```

### Health Checks

#### Pre-execution Validation
```typescript
interface HealthCheck {
  api_connectivity: boolean;
  token_validity: boolean;
  project_access: boolean;
  rate_limit_status: {
    remaining: number;
    reset_time: number;
  };
}

async function performHealthCheck(): Promise<HealthCheck> {
  // Implementation details...
}
```

#### Post-execution Validation
```typescript
interface ExecutionValidation {
  flags_processed: number;
  api_errors: number;
  scan_coverage: number;      // Percentage of files scanned
  execution_time: number;     // Total time in milliseconds
  rate_limit_usage: number;   // Percentage of rate limit used
}
```

### Support Resources

#### Documentation Links
- [Optimizely API Documentation](https://docs.developers.optimizely.com/feature-experimentation/reference/introduction)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Action Configuration Reference](configuration.md)
- [User Guide](user-guide.md)

#### Community Support
- [GitHub Discussions](../../discussions)
- [GitHub Issues](../../issues)
- [Optimizely Developer Community](https://community.optimizely.com/)

#### Enterprise Support
- Optimizely Support Portal (for enterprise customers)
- Priority support channels
- Dedicated customer success managers

---

This API reference provides comprehensive information for integrating and troubleshooting the Optimizely Feature Flag Sync Action. For additional assistance, please refer to the community resources or create a GitHub issue with detailed information about your specific use case.
