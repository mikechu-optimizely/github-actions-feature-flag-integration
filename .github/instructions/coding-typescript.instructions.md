---
applyTo: '**/*.{ts,tsx}'
---

# TypeScript Coding Instructions

## General Coding Rules
- Act as a security-focused Staff Software Engineer at Optimizely
- Use TypeScript 5.x for all code to ensure type safety and maintainability
- Follow Test Driven Development (TDD) practices: write tests before implementation code
- Exhaust all options with existing patterns before introducing new technologies; remove old implementations to avoid duplicate logic
- Keep codebases clean and organized
- Avoid unnecessary scripts, especially one-time use scripts in production files
- Use mocking only in test files, never in production code
- Prefer functional programming patterns for clarity and maintainability when appropriate; use immutable data structures and avoid side effects
- Structure for testability with dependency injection and separation of concerns
- Address edge cases and failure modes explicitly
- Use idiomatic solutions for TypeScript
- Implement proper error boundaries and fallback mechanisms in UI components
- Specify language version, framework, and style preferences when requesting code generation
- Never use `console.log`. Use `console.debug`, `console.info`, `console.warn`, or `console.error` as appropriate
- Always produce clear, concise code, striving for simplicity
- Produce secure code by sanitizing inputs, validating outputs, handling errors, etc; validate all external inputs to avoid injection vulnerabilities
- Always create descriptive and meaningful names for variables, functions, classes, etc
- Add, update, and correct JSDoc for classes and functions/methods
- Produce performant code, considering aspects like caching, lazy loading, and code splitting
- Utilize asynchronous (async/await) instead of callbacks or synchronous code unless explicitly requested
- Use internal libraries (project-specific unless otherwise defined), then external libraries, then writing your own solutions when needed
- Before commit, run `deno task precommit` to ensure code quality and consistency
- Write failing tests before implementing features or fixing bugs (TDD approach)
- Always use conventional commit message format (see [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)) with a bulleted list of changes as the description
- Watch for high entropy strings, which may indicate accidental secrets or sensitive data. Redact or remove such strings and alert the user
- Avoid having over 200-300 lines of code in a single file; refactor into external modules or classes as needed
- Protect secrets and avoid logging sensitive data

## Type System and Safety
- Use strict TypeScript configuration (`strict: true` in tsconfig.json)
- Avoid `any` type; use `unknown` when type is truly unknown
- Prefer explicit type annotations for function parameters and return values
- Use proper TypeScript types and interfaces; define custom types when needed
- `type` is preferred for defining types, while `interface` is preferred for defining object shapes
- Implement proper null/undefined checks with optional chaining (`?.`) and nullish coalescing (`??`)
- Use type guards and discriminated unions for runtime type safety
- Leverage utility types (`Partial<T>`, `Pick<T>`, `Omit<T>`, etc.) for type transformations
- Use `const assertions` for immutable data structures
- Implement proper generic types for reusable components and functions

## Modern TypeScript Features
- Use template literal types for string manipulation at type level
- Implement mapped types for type transformations
- Use conditional types for complex type logic when appropriate
- Use numeric separators for readability in large numbers (e.g., `1_000_000`)

## Code Organization
- Organize code into modules based on functionality
- Use path aliases and Deno's import maps where feasible to simplify import paths
- Prefer small, pure functions with clear input/output mappings
- Prefer `const` and `let` over `var`
- Use arrow functions for callbacks and functional programming patterns
- Use template literals instead of string concatenation
- Implement proper error handling with try/catch blocks for async operations; employ try-catch statements judiciously to manage exceptions
- Use modern ES6+ features (destructuring, spread operator, modules)
- Prefer immutable data patterns when possible
- Use proper module imports/exports with explicit types

## Naming Conventions
- **Variables**: Use camelCase for variables, functions, and method names
- **Classes & Interfaces**: Use PascalCase for classes and interfaces
- **Constants**: Use UPPER_SNAKE_CASE for const values, especially for configuration variables
- **Enums**: Use PascalCase, and for enum values, use UPPER_SNAKE_CASE

## Test Driven Development (TDD)
- Follow the Red-Green-Refactor cycle for all new features and bug fixes
- **Red**: Write a failing test that describes the desired behavior
- **Green**: Write minimal implementation code to make the test pass
- **Refactor**: Clean up code while keeping tests green
- Write unit tests for all pure functions and business logic
- Write integration tests for modules that interact with external systems
- Write end-to-end tests for critical user flows
- Use descriptive test names that explain the behavior being tested
- Arrange-Act-Assert pattern for test structure
- Mock external dependencies to isolate units under test
- Ensure tests are deterministic and do not depend on external state
- Run tests continuously during development to maintain fast feedback loops

## Testing and Quality
- Use Deno's built-in test framework for all tests
- Write tests first (TDD) to drive design and ensure comprehensive coverage
- Achieve >90% code coverage for critical modules, >80% for all modules
- Co-locate test files alongside the modules they test, following the `*.test.ts` pattern
- Use modern testing frameworks (Vitest, inbuilt Deno) with proper TypeScript configuration
- Write type-safe tests with proper type assertions
- Test both happy path and edge cases, including error conditions
- Use `@types/` packages for third-party library types
- Follow React best practices when applicable (hooks, functional components, proper state management)
- Implement proper error boundaries with TypeScript error types
- Use consistent formatting with the project's lint and format rules to ensure consistent code style
- Run `deno task test` before committing to ensure all tests pass

## Comments and Documentation
- Ensure code comments are descriptive and concise
- Use JSDoc-style comments for functions, methods, and classes:
  ```typescript
  /**
   * Adds two numbers
   * @param a {number} The first number
   * @param b {number} The second number
   * @returns {number} The sum of a and b
   */
  function add(a: number, b: number): number {
    return a + b;
  }
  ```

## Performance and Best Practices
- Use type-only imports (`import type`) when importing only types
- Implement lazy loading with proper type definitions
- Use declaration merging judiciously and document when used
- Prefer composition over inheritance with proper typing
- Use branded types for domain-specific primitive types when needed
