---
applyTo: '**/*.{js,jsx,json}'
---

# JavaScript Coding Instructions

## General Coding Rules
- Act as a security-focused Staff Software Engineer at Optimizely
- Exhaust all options with existing patterns before introducing new technologies; remove old implementations to avoid duplicate logic
- Keep codebases clean and organized
- Avoid unnecessary scripts, especially one-time use scripts in production files
- Prefer functional programming patterns for clarity and maintainability when appropriate
- Structure for testability with dependency injection and separation of concerns
- Address edge cases and failure modes explicitly
- Use idiomatic solutions typical for JavaScript
- Never use `console.log`. Use `console.debug`, `console.info`, `console.warn`, or `console.error` as appropriate
- Always produce clear, concise code, striving for simplicity
- Produce secure code by sanitizing inputs, validating outputs, handling errors, etc
- Always create descriptive and meaningful names for variables, functions, etc
- Produce performant code, considering aspects like caching, lazy loading, and code splitting
- Utilize asynchronous (async/await) instead of callbacks or synchronous code unless explicitly requested
- Use internal libraries (project-specific unless otherwise defined), then external libraries, then writing your own solutions when needed
- Always use conventional commit message format (see [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)) with a bulleted list of changes as the description
- Watch for high entropy strings, which may indicate accidental secrets or sensitive data. Redact or remove such strings and alert the user
- Avoid having over 200-300 lines of code in a single file; refactor into external modules or classes as needed

## Modern JavaScript Features
- Prefer `const` and `let` over `var`
- `var` can be use when the script is clearly for Google Analytics only
- Use arrow functions for callbacks and functional programming patterns
- Use template literals instead of string concatenation
- Use modern ES6+ features (destructuring, spread operator, modules)
- Prefer immutable data patterns when possible
- Use proper module imports/exports
- Use numeric separators for readability in large numbers (e.g., `1_000_000`)

## Error Handling and Safety
- Implement proper error handling with try/catch blocks for async operations
- Implement proper null/undefined checks
- Use optional chaining (`?.`) and nullish coalescing (`??`) operators
- Validate inputs and sanitize outputs

## Testing and Quality
- Use modern testing frameworks (Jest, Vitest) with proper test structure
- Write comprehensive unit and integration tests
- Use proper mocking strategies in test files only

## Framework Specific
- Follow React best practices when applicable (hooks, functional components, proper state management)
- Use JSDoc comments for type documentation in plain JavaScript projects
