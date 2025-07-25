# API Documentation Guide

This document outlines how to maintain and generate API documentation for the Feature Flag Synchronization Solution.

## Overview

The project uses Deno's built-in documentation generation capabilities to create comprehensive API documentation from JSDoc comments in the source code.

## Documentation Standards

### JSDoc Comments

All public APIs must include JSDoc comments with the following format:

```typescript
/**
 * Brief description of the function/class/interface.
 * 
 * More detailed description if needed. Explain what the function does,
 * its purpose, and any important implementation details.
 * 
 * @param paramName Description of the parameter
 * @param options Configuration options
 * @param options.timeout Request timeout in milliseconds
 * @returns Description of what is returned
 * @throws {Error} When validation fails
 * @example
 * ```typescript
 * const result = await myFunction("example", { timeout: 5000 });
 * console.log(result);
 * ```
 */
export async function myFunction(
  paramName: string,
  options: { timeout: number }
): Promise<string> {
  // Implementation
}
```

### Required Documentation Elements

1. **Description**: Clear, concise explanation of what the code does
2. **Parameters**: All parameters with types and descriptions
3. **Returns**: What the function returns
4. **Throws**: Any exceptions that might be thrown
5. **Examples**: Code examples showing usage
6. **Since**: Version when the API was introduced (for new features)
7. **Deprecated**: If the API is deprecated, include replacement information

### Documentation Examples

#### Function Documentation
```typescript
/**
 * Validates an Optimizely API token format.
 * 
 * Performs basic format validation to ensure the token contains only
 * valid characters and meets minimum length requirements.
 * 
 * @param token The API token to validate
 * @returns True if the token format is valid, false otherwise
 * @example
 * ```typescript
 * const isValid = validateOptimizelyApiToken("abc123def456");
 * if (!isValid) {
 *   throw new Error("Invalid API token format");
 * }
 * ```
 */
export function validateOptimizelyApiToken(token: string): boolean {
  // Implementation
}
```

#### Class Documentation
```typescript
/**
 * Optimizely API client with rate limiting and error handling.
 * 
 * Provides methods to interact with the Optimizely Feature Experimentation
 * API while handling authentication, rate limiting, and retries automatically.
 * 
 * @example
 * ```typescript
 * const client = new OptimizelyClient("api-token", "project-id");
 * const flags = await client.getFeatureFlags();
 * ```
 */
export class OptimizelyClient {
  /**
   * Creates a new Optimizely API client.
   * 
   * @param apiToken Optimizely API token for authentication
   * @param projectId Optimizely project ID
   * @param options Additional configuration options
   */
  constructor(
    private apiToken: string,
    private projectId: string,
    private options: OptimizelyClientConfig = {}
  ) {
    // Implementation
  }

  /**
   * Fetches all feature flags for the configured project.
   * 
   * @returns Promise resolving to array of feature flags
   * @throws {ApiError} When API request fails
   */
  async getFeatureFlags(): Promise<FeatureFlag[]> {
    // Implementation
  }
}
```

#### Interface Documentation
```typescript
/**
 * Configuration options for the Optimizely API client.
 * 
 * @interface OptimizelyClientConfig
 */
export interface OptimizelyClientConfig {
  /** API request timeout in milliseconds (default: 30000) */
  timeout?: number;
  
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  
  /** Rate limit in requests per second (default: 5) */
  rateLimit?: number;
  
  /** Base URL for Optimizely API (default: https://api.optimizely.com/v2) */
  baseUrl?: string;
}
```

## Generating Documentation

### Available Commands

```bash
# Generate HTML documentation
deno task docs:generate

# Generate JSON documentation for programmatic use
deno task docs:json

# Generate documentation for specific files
deno doc src/modules/optimizely-client.ts

# Generate documentation with output to file
deno doc --html --name="Feature Flag Sync API" src/ --output=docs/api/
```

### HTML Documentation

The HTML documentation is generated using Deno's built-in `deno doc --html` command:

```bash
deno task docs:generate
```

This creates a complete HTML documentation site with:
- Module overview
- Function and class documentation
- Type definitions
- Cross-references between modules
- Search functionality

### JSON Documentation

For programmatic access to documentation:

```bash
deno task docs:json
```

This generates a JSON file containing all documentation metadata that can be used by:
- Custom documentation tools
- IDE integrations
- Automated documentation validation

## Documentation Workflow

### During Development

1. **Write JSDoc comments** as you develop new APIs
2. **Include examples** for complex functions
3. **Update documentation** when changing existing APIs
4. **Generate and review** documentation regularly

### Before Releasing

1. **Generate documentation**: Run `deno task docs:generate`
2. **Review documentation**: Check for completeness and accuracy
3. **Update version information**: Add `@since` tags for new APIs
4. **Commit documentation**: Include generated docs in version control

### Continuous Integration

The CI/CD pipeline includes documentation validation:

```yaml
- name: Validate Documentation
  run: |
    deno task docs:generate
    # Check that documentation was generated successfully
    test -d docs/api/ || exit 1
```

## Documentation Structure

### File Organization

```
docs/
├── api/                    # Generated HTML documentation
│   ├── index.html         # Documentation homepage
│   ├── modules/           # Module documentation
│   └── static/            # CSS, JS, and other assets
├── api.json               # Generated JSON documentation
└── api-documentation.md   # This guide
```

### Module Documentation

Each module should have:
- Module-level JSDoc comment explaining its purpose
- Public API documentation
- Usage examples
- Related modules cross-references

Example module header:
```typescript
/**
 * @fileoverview Optimizely API client module.
 * 
 * Provides functionality to interact with the Optimizely Feature Experimentation
 * API, including authentication, rate limiting, and error handling.
 * 
 * @module OptimizelyClient
 * @version 1.0.0
 * @author Feature Flag Sync Team
 */
```

## Best Practices

### Writing Good Documentation

1. **Be Clear and Concise**: Explain what, not how
2. **Include Examples**: Show real usage scenarios
3. **Document Edge Cases**: Explain error conditions
4. **Keep It Updated**: Documentation should match code
5. **Use Consistent Language**: Maintain terminology consistency

### Common Pitfalls

1. **Missing Parameter Descriptions**: Always document all parameters
2. **Outdated Examples**: Keep examples current with API changes
3. **Vague Descriptions**: Be specific about what functions do
4. **Missing Error Documentation**: Document when functions can throw

### Documentation Testing

Test your documentation by:
1. Running examples to ensure they work
2. Checking generated documentation for completeness
3. Having others review documentation for clarity
4. Using documentation to implement features (dogfooding)

## Tools and Utilities

### VS Code Extensions

- **Deno**: Provides JSDoc hover information
- **Auto Comment Blocks**: Generates JSDoc templates
- **Document This**: Automatically generates JSDoc comments

### Documentation Validation

Create a simple script to validate documentation completeness:

```typescript
// scripts/validate-docs.ts
import { walk } from "@std/fs";

for await (const entry of walk("src/", { exts: [".ts"] })) {
  if (entry.name.endsWith(".test.ts")) continue;
  
  const content = await Deno.readTextFile(entry.path);
  const exportMatches = content.match(/^export (function|class|interface)/gm);
  const docMatches = content.match(/\/\*\*[\s\S]*?\*\//g);
  
  if (exportMatches && (!docMatches || docMatches.length < exportMatches.length)) {
    console.warn(`Missing documentation in ${entry.path}`);
  }
}
```

## Maintenance

### Regular Tasks

- **Monthly**: Review and update documentation
- **Per Release**: Generate fresh documentation
- **When APIs Change**: Update affected documentation immediately

### Documentation Metrics

Track documentation quality with:
- Coverage of public APIs
- Example code validity
- User feedback on documentation clarity
- Documentation build success rate

## Integration with Development Tools

### IDE Integration

Modern IDEs can use the generated JSON documentation for:
- Auto-completion
- Hover information
- Signature help
- Navigation to definitions

### Documentation Hosting

Consider hosting documentation using:
- GitHub Pages (for public repositories)
- Internal documentation platforms
- Static site generators with API integration

---

For questions about API documentation, please refer to the [Contributing Guide](../CONTRIBUTING.md) or create an issue in the project repository.
