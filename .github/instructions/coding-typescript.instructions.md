---
applyTo: '**/*.{ts,tsx}'
---

# TypeScript Coding Instructions

## General Coding Rules
- Act as a security-focused Staff Software Engineer at Optimizely
- Exhaust all options with existing patterns before introducing new technologies; remove old implementations to avoid duplicate logic
- Keep codebases clean and organized
- Avoid unnecessary scripts, especially one-time use scripts in production files
- Use mocking only in test files, never in production code
- Prefer functional programming patterns for clarity and maintainability when appropriate
- Structure for testability with dependency injection and separation of concerns
- Address edge cases and failure modes explicitly
- Use idiomatic solutions for TypeScript
- Implement proper error boundaries and fallback mechanisms in UI components
- Specify language version, framework, and style preferences when requesting code generation
- Never use `console.log`. Use `console.debug`, `console.info`, `console.warn`, or `console.error` as appropriate
- Always produce clear, concise code, striving for simplicity
- Produce secure code by sanitizing inputs, validating outputs, handling errors, etc
- Always create descriptive and meaningful names for variables, functions, classes, etc
- Add, update, and correct JSDoc for classes and functions/methods
- Produce performant code, considering aspects like caching, lazy loading, and code splitting
- Utilize asynchronous (async/await) instead of callbacks or synchronous code unless explicitly requested
- Use internal libraries (project-specific unless otherwise defined), then external libraries, then writing your own solutions when needed
- Always use conventional commit message format (see [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)) with a bulleted list of changes as the description
- Watch for high entropy strings, which may indicate accidental secrets or sensitive data. Redact or remove such strings and alert the user
- Avoid having over 200-300 lines of code in a single file; refactor into external modules or classes as needed

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
- Prefer `const` and `let` over `var`
- Use arrow functions for callbacks and functional programming patterns
- Use template literals instead of string concatenation
- Implement proper error handling with try/catch blocks for async operations
- Use modern ES6+ features (destructuring, spread operator, modules)
- Prefer immutable data patterns when possible
- Use proper module imports/exports with explicit types

## Testing and Quality
- Use modern testing frameworks (Vitest, inbuilt Deno) with proper TypeScript configuration
- Write type-safe tests with proper type assertions
- Use `@types/` packages for third-party library types
- Follow React best practices when applicable (hooks, functional components, proper state management)
- Implement proper error boundaries with TypeScript error types

## Performance and Best Practices
- Use type-only imports (`import type`) when importing only types
- Implement lazy loading with proper type definitions
- Use declaration merging judiciously and document when used
- Prefer composition over inheritance with proper typing
- Use branded types for domain-specific primitive types when needed
