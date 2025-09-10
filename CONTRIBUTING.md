# Contributing to Feature Flag Synchronization Solution

Thank you for your interest in contributing to the Feature Flag Synchronization Solution! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a code of conduct adapted from the [Contributor Covenant](https://www.contributor-covenant.org/). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- [Deno 2.x](https://deno.com/) installed
- [Git](https://git-scm.com/) for version control
- A GitHub account
- Basic understanding of TypeScript and feature flag concepts

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/optimizely/feature-flag-sync-action.git
   cd feature-flag-sync-action
   ```

2. **Install Development Tools**
   ```bash
   # Verify Deno installation
   deno --version
   
   # Install recommended VS Code extensions
   # - Deno (denoland.vscode-deno)
   # - YAML (redhat.vscode-yaml)
   ```

3. **Run Tests**
   ```bash
   deno task test
   ```

4. **Lint and Format**
   ```bash
   deno task lint
   deno task fmt
   ```

## Development Process

### Branching Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical production fixes

### Workflow

1. **Create an Issue**: For bugs, features, or improvements
2. **Fork & Branch**: Create a feature branch from `develop`
3. **Develop**: Write code following our standards
4. **Test**: Ensure all tests pass and coverage is maintained
5. **Document**: Update documentation as needed
6. **Pull Request**: Submit PR against `develop` branch

### Branch Naming

- `feature/flag-sync-optimization`
- `bugfix/api-rate-limiting-fix`
- `docs/update-contributing-guide`

## Coding Standards

Please follow our [coding standards](docs/coding-standards.md) which include:

### TypeScript Guidelines

- Use TypeScript 5.x with strict mode enabled
- Prefer functional programming paradigms
- Use meaningful names for variables, functions, and classes
- Write JSDoc comments for public APIs

### Code Style

- Use 2 spaces for indentation
- Line length limit: 100 characters
- Use semicolons
- Use double quotes for strings
- Follow existing patterns in the codebase

### Example

```typescript
/**
 * Validates feature flag configuration.
 * @param config The configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateFlagConfig(config: FlagConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.apiToken) {
    errors.push("API token is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
```

## Testing

### Test Requirements

- Write tests for all new functionality
- Maintain >80% code coverage for critical modules
- Use descriptive test names
- Include both positive and negative test cases

### Test Structure

```typescript
import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

describe("FlagValidator", () => {
  it("should validate correct flag configuration", () => {
    const config = { apiToken: "valid-token", projectId: "123" };
    const result = validateFlagConfig(config);
    
    assertEquals(result.isValid, true);
    assertEquals(result.errors.length, 0);
  });

  it("should reject configuration without API token", () => {
    const config = { projectId: "123" };
    const result = validateFlagConfig(config);
    
    assertEquals(result.isValid, false);
    assertEquals(result.errors.includes("API token is required"), true);
  });
});
```

### Running Tests

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task test:coverage

# Run tests in watch mode
deno task test:watch

# Run specific test file
deno test src/modules/flag-validator.test.ts --allow-all
```

## Pull Request Process

### Before Submitting

1. **Update Documentation**: Ensure README, API docs, and inline comments are current
2. **Run Pre-commit Checks**: `deno task precommit`
3. **Test Coverage**: Verify tests pass and coverage is maintained
4. **Rebase**: Rebase your branch on the latest `develop`

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings or errors introduced
```

### Review Process

1. **Automated Checks**: CI/CD pipeline must pass
2. **Code Review**: At least one maintainer review required
3. **Testing**: All tests must pass
4. **Documentation**: Documentation must be updated for user-facing changes

## Issue Reporting

### Bug Reports

Use the bug report template and include:

- Clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Deno version, OS)
- Screenshots or logs if applicable

### Feature Requests

Use the feature request template and include:

- Clear description of the problem
- Proposed solution or feature
- Alternative solutions considered
- Additional context

### Issue Labels

- `bug`: Something isn't working
- `enhancement`: New features or improvements
- `documentation`: Documentation updates
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention needed

## Documentation

### Types of Documentation

1. **Code Documentation**: JSDoc comments in source code
2. **API Documentation**: Generated from JSDoc comments
3. **User Documentation**: README, setup guides, tutorials
4. **Developer Documentation**: Architecture, contributing guidelines

### Documentation Standards

- Write clear, concise documentation
- Include code examples
- Keep documentation up to date with code changes
- Use proper markdown formatting
- Include links to related sections

### Generating API Documentation

```bash
# Generate API documentation (when tooling is set up)
deno task docs:generate
```

## Community

### Getting Help

- **GitHub Discussions**: For questions and general discussion
- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check existing documentation first

### Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes for significant contributions
- GitHub contributor graphs

## Development Tips

### Performance Considerations

- Use async/await for I/O operations
- Implement proper error handling
- Consider memory usage for large codebases
- Use appropriate data structures

### Security Considerations

- Validate all inputs
- Sanitize data in logs
- Use secure defaults
- Follow principle of least privilege

### Debugging

```bash
# Enable debug logging
export LOG_LEVEL=debug
deno task start

# Run with specific permissions
deno run --allow-read --allow-env src/main.ts
```

## Release Process

1. **Version Bump**: Update version in relevant files
2. **Changelog**: Update CHANGELOG.md with new features and fixes
3. **Documentation**: Ensure all documentation is current
4. **Testing**: Run full test suite
5. **Tag**: Create git tag with version number
6. **Release**: Create GitHub release with notes

## Questions?

If you have questions about contributing, please:

1. Check existing documentation
2. Search existing issues and discussions
3. Create a new discussion or issue
4. Contact maintainers directly for sensitive matters

Thank you for contributing to making feature flag management better for everyone!

---

**Last Updated**: 2024  
**Version**: 1.0.0
