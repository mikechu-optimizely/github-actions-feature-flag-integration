import { extname, globToRegExp, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { CodeAnalysisConfig } from "../types/config.ts";

/**
 * Represents a usage of a feature flag in the codebase.
 */
export interface FlagUsage {
  file: string;
  line: number;
  context: string;
}

/**
 * Default exclusion patterns for documentation and configuration files.
 * Note: Test files are included by default as they may contain legitimate feature flag usage.
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  // Documentation files
  "**/*.md",
  "**/docs/**",
  "**/doc/**",
  "**/documentation/**",
  "**/README*",
  "**/CHANGELOG*",
  "**/LICENSE*",
  "**/CONTRIBUTING*",
  "**/*.rst",
  "**/*.txt",

  // Configuration and build files
  "**/*.json",
  "**/*.yaml",
  "**/*.yml",
  "**/*.toml",
  "**/*.ini",
  "**/*.cfg",
  "**/*.config.*",
  "**/package.json",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/deno.lock",
  "**/tsconfig*.json",
  "**/jsconfig*.json",
  "**/.eslintrc*",
  "**/.prettierrc*",
  "**/webpack*.js",
  "**/vite*.js",
  "**/rollup*.js",
  "**/babel*.js",
  "**/jest*.js",
  "**/karma*.js",
  "**/gulpfile.js",
  "**/Gruntfile.js",
  "**/Makefile",
  "**/Dockerfile*",
  "**/.dockerignore",
  "**/.gitignore",
  "**/.gitattributes",
  "**/.env*",

  // Build and distribution directories
  "**/build/**",
  "**/dist/**",
  "**/out/**",
  "**/target/**",
  "**/bin/**",
  "**/obj/**",
  "**/public/**",
  "**/assets/**",
  "**/static/**",
  "**/coverage/**",
  "**/node_modules/**",
  "**/.git/**",
  "**/.svn/**",
  "**/.hg/**",
  "**/vendor/**",
  "**/third_party/**",
  "**/tmp/**",
  "**/temp/**",

  // IDE and editor files
  "**/.vscode/**",
  "**/.idea/**",
  "**/*.swp",
  "**/*.swo",
  "**/*~",
  "**/.DS_Store",
  "**/Thumbs.db",

  // Language-specific excludes
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.d.ts", // TypeScript declaration files
  "**/__pycache__/**",
  "**/*.pyc",
  "**/*.pyo",
  "**/*.class",
  "**/*.jar",
  "**/*.war",
  "**/*.exe",
  "**/*.dll",
  "**/*.so",
  "**/*.dylib",
  "**/*.a",
  "**/*.lib",
];

/**
 * Creates a customizable set of exclusion patterns based on configuration.
 * @param options Configuration options for exclusion patterns
 * @returns Combined array of exclusion patterns
 */
export function createExclusionPatterns(options: {
  includeTests?: boolean;
  includeDocs?: boolean;
  includeConfig?: boolean;
  includeBuild?: boolean;
  includeIde?: boolean;
  customPatterns?: string[];
} = {}): string[] {
  const patterns: string[] = [];

  // Always exclude some basic patterns for safety
  patterns.push(
    "**/.git/**",
    "**/node_modules/**",
    "**/vendor/**",
    "**/.DS_Store",
    "**/Thumbs.db",
  );

  if (!options.includeTests) {
    patterns.push(
      "**/*.test.*",
      "**/*.spec.*",
      "**/test/**",
      "**/tests/**",
      "**/__tests__/**",
      "**/__test__/**",
      "**/spec/**",
      "**/specs/**",
      "**/*.test",
      "**/*.spec",
    );
  }

  if (!options.includeDocs) {
    patterns.push(
      "**/*.md",
      "**/docs/**",
      "**/doc/**",
      "**/documentation/**",
      "**/README*",
      "**/CHANGELOG*",
      "**/LICENSE*",
      "**/CONTRIBUTING*",
      "**/*.rst",
      "**/*.txt",
    );
  }

  if (!options.includeConfig) {
    patterns.push(
      "**/*.json",
      "**/*.yaml",
      "**/*.yml",
      "**/*.toml",
      "**/*.ini",
      "**/*.cfg",
      "**/*.config.*",
      "**/package.json",
      "**/package-lock.json",
      "**/yarn.lock",
      "**/deno.lock",
      "**/tsconfig*.json",
      "**/jsconfig*.json",
      "**/.eslintrc*",
      "**/.prettierrc*",
      "**/webpack*.js",
      "**/vite*.js",
      "**/rollup*.js",
      "**/babel*.js",
      "**/jest*.js",
      "**/karma*.js",
      "**/gulpfile.js",
      "**/Gruntfile.js",
      "**/Makefile",
      "**/Dockerfile*",
      "**/.dockerignore",
      "**/.gitignore",
      "**/.gitattributes",
      "**/.env*",
    );
  }

  if (!options.includeBuild) {
    patterns.push(
      "**/build/**",
      "**/dist/**",
      "**/out/**",
      "**/target/**",
      "**/bin/**",
      "**/obj/**",
      "**/public/**",
      "**/assets/**",
      "**/static/**",
      "**/coverage/**",
      "**/.svn/**",
      "**/.hg/**",
      "**/third_party/**",
      "**/tmp/**",
      "**/temp/**",
      "**/*.min.js",
      "**/*.min.css",
      "**/*.map",
      "**/*.d.ts",
      "**/__pycache__/**",
      "**/*.pyc",
      "**/*.pyo",
      "**/*.class",
      "**/*.jar",
      "**/*.war",
      "**/*.exe",
      "**/*.dll",
      "**/*.so",
      "**/*.dylib",
      "**/*.a",
      "**/*.lib",
    );
  }

  if (!options.includeIde) {
    patterns.push(
      "**/.vscode/**",
      "**/.idea/**",
      "**/*.swp",
      "**/*.swo",
      "**/*~",
    );
  }

  if (options.customPatterns) {
    patterns.push(...options.customPatterns);
  }

  return patterns;
}

/**
 * Recursively collects all source files to scan, including test files but excluding documentation and configuration files.
 * @param rootDir Root directory to scan
 * @returns Array of file paths
 */
export async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const defaultConfig: CodeAnalysisConfig = {
    workspaceRoot: rootDir,
    excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
    languages: ["ts", "js", "tsx", "jsx", "py", "java", "cs", "go", "php"],
    concurrencyLimit: 10,
  };

  return await collectSourceFilesWithConfig(rootDir, defaultConfig);
}

/**
 * Checks if a file path matches any of the given glob patterns.
 * @param filePath File path to check
 * @param patterns Array of glob patterns
 * @returns True if the file matches any pattern
 */
function matchesPatterns(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regex = globToRegExp(pattern, { globstar: true });
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = filePath.replace(/\\/g, "/");
    return regex.test(normalizedPath);
  });
}

/**
 * Checks if a file should be included based on size constraints.
 * @param filePath File path to check
 * @param maxFileSize Maximum file size in bytes (optional)
 * @returns True if the file should be included
 */
async function shouldIncludeFileBySize(
  filePath: string,
  maxFileSize?: number,
): Promise<boolean> {
  if (!maxFileSize) return true;

  try {
    const fileInfo = await Deno.stat(filePath);
    return fileInfo.size <= maxFileSize;
  } catch {
    // If we can't get file stats, include the file
    return true;
  }
}

/**
 * Recursively collects source files with configurable patterns and exclusions.
 * @param rootDir Root directory to scan
 * @param config Code analysis configuration with patterns and exclusions
 * @returns Array of file paths that match the configuration
 */
export async function collectSourceFilesWithConfig(
  rootDir: string,
  config: CodeAnalysisConfig,
): Promise<string[]> {
  const files: string[] = [];

  async function scanDirectory(currentDir: string): Promise<void> {
    try {
      for await (const entry of Deno.readDir(currentDir)) {
        const fullPath = join(currentDir, entry.name);
        const relativePath = fullPath.substring(rootDir.length + 1);

        if (entry.isDirectory) {
          // Check if directory should be excluded
          if (!matchesPatterns(relativePath + "/", config.excludePatterns)) {
            await scanDirectory(fullPath);
          }
        } else {
          // Check exclusion patterns first
          if (matchesPatterns(relativePath, config.excludePatterns)) {
            continue;
          }

          // Check inclusion patterns if specified
          if (config.includePatterns && config.includePatterns.length > 0) {
            if (!matchesPatterns(relativePath, config.includePatterns)) {
              continue;
            }
          }

          // Check file size constraints
          if (!(await shouldIncludeFileBySize(fullPath, config.maxFileSize))) {
            continue;
          }

          files.push(fullPath);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not read directory ${currentDir}: ${message}`);
    }
  }

  await scanDirectory(rootDir);
  return files;
}

/**
 * Determines if a line is a comment in JavaScript/TypeScript.
 * @param line Line of code
 * @param inBlockComment Whether currently inside a block comment
 * @returns [isComment, inBlockComment]
 */
function isJsCommentLine(
  line: string,
  inBlockComment: boolean,
): [boolean, boolean] {
  const trimmed = line.trim();

  // If already in a block comment, check for end
  if (inBlockComment) {
    if (trimmed.includes("*/")) {
      // End of block comment, but may have code after */
      const after = trimmed.split("*/")[1];
      if (after && after.trim().length > 0 && !after.trim().startsWith("//")) {
        // There is code after the block comment ends
        return [false, false];
      }
      return [true, false];
    }
    return [true, true];
  }

  // Single-line comment
  if (trimmed.startsWith("//")) return [true, false];

  // Block comment start
  if (trimmed.startsWith("/*")) {
    if (trimmed.includes("*/")) {
      // Block comment starts and ends on same line
      const after = trimmed.split("*/")[1];
      if (after && after.trim().length > 0 && !after.trim().startsWith("//")) {
        return [false, false];
      }
      return [true, false];
    }
    return [true, true];
  }

  // Inline block comment (e.g. code /* comment */ code)
  if (trimmed.includes("/*") && trimmed.includes("*/")) {
    const before = trimmed.split("/*")[0];
    const after = trimmed.split("*/")[1];
    if (
      (before && before.trim().length > 0) ||
      (after && after.trim().length > 0 && !after.trim().startsWith("//"))
    ) {
      return [false, false];
    }
    return [true, false];
  }

  return [false, false];
}

/**
 * Determines if a line is a comment in Python.
 * @param line Line of code
 * @param inBlockComment Whether currently inside a docstring
 * @returns [isComment, inBlockComment]
 */
function isPythonCommentLine(
  line: string,
  inBlockComment: boolean,
): [boolean, boolean] {
  const trimmed = line.trim();

  // Python single-line comment
  if (trimmed.startsWith("#")) return [true, false];

  // Python docstring (triple quotes)
  const tripleSingle = "'''";
  const tripleDouble = '"""';

  if (inBlockComment) {
    if (trimmed.includes(tripleSingle) || trimmed.includes(tripleDouble)) {
      // End of docstring block
      const after = trimmed.split(tripleSingle).length > 1
        ? trimmed.split(tripleSingle)[1]
        : trimmed.split(tripleDouble)[1];
      if (after && after.trim().length > 0) {
        return [false, false];
      }
      return [true, false];
    }
    return [true, true];
  }

  // Python docstring start
  if (trimmed.startsWith(tripleSingle) || trimmed.startsWith(tripleDouble)) {
    // Start of docstring
    const singleCount = (trimmed.match(/'''/g) || []).length;
    const doubleCount = (trimmed.match(/"""/g) || []).length;
    if (singleCount === 2 || doubleCount === 2) {
      return [true, false]; // starts and ends on same line
    }
    return [true, true];
  }

  return [false, false];
}

/**
 * Determines if a line is a comment in Java or C#.
 * @param line Line of code
 * @param inBlockComment Whether currently inside a block comment
 * @returns [isComment, inBlockComment]
 */
function isJavaCSharpCommentLine(
  line: string,
  inBlockComment: boolean,
): [boolean, boolean] {
  // Java and C# use the same comment syntax as JavaScript/TypeScript
  return isJsCommentLine(line, inBlockComment);
}

/**
 * Determines if a line is a comment in Go.
 * @param line Line of code
 * @param inBlockComment Whether currently inside a block comment
 * @returns [isComment, inBlockComment]
 */
function isGoCommentLine(
  line: string,
  inBlockComment: boolean,
): [boolean, boolean] {
  // Go uses the same comment syntax as JavaScript/TypeScript
  return isJsCommentLine(line, inBlockComment);
}

/**
 * Determines if a line is a comment in PHP.
 * @param line Line of code
 * @param inBlockComment Whether currently inside a block comment
 * @returns [isComment, inBlockComment]
 */
function isPhpCommentLine(
  line: string,
  inBlockComment: boolean,
): [boolean, boolean] {
  const trimmed = line.trim();

  // If already in a block comment, check for end
  if (inBlockComment) {
    if (trimmed.includes("*/")) {
      // End of block comment, but may have code after */
      const after = trimmed.split("*/")[1];
      if (
        after && after.trim().length > 0 && !after.trim().startsWith("//") &&
        !after.trim().startsWith("#")
      ) {
        // There is code after the block comment ends
        return [false, false];
      }
      return [true, false];
    }
    return [true, true];
  }

  // PHP single-line comments (// or #)
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) return [true, false];

  // Block comment start
  if (trimmed.startsWith("/*")) {
    if (trimmed.includes("*/")) {
      // Block comment starts and ends on same line
      const after = trimmed.split("*/")[1];
      if (
        after && after.trim().length > 0 && !after.trim().startsWith("//") &&
        !after.trim().startsWith("#")
      ) {
        return [false, false];
      }
      return [true, false];
    }
    return [true, true];
  }

  // Inline block comment (e.g. code /* comment */ code)
  if (trimmed.includes("/*") && trimmed.includes("*/")) {
    const before = trimmed.split("/*")[0];
    const after = trimmed.split("*/")[1];
    if (
      (before && before.trim().length > 0) ||
      (after && after.trim().length > 0 && !after.trim().startsWith("//") &&
        !after.trim().startsWith("#"))
    ) {
      return [false, false];
    }
    return [true, false];
  }

  return [false, false];
}

/**
 * Determines if a line is a comment based on the file extension.
 * @param line Line of code
 * @param inBlockComment Whether currently inside a block comment
 * @param fileExtension File extension (e.g., ".ts", ".py")
 * @returns [isComment, inBlockComment]
 */
function isCommentLine(
  line: string,
  inBlockComment: boolean,
  fileExtension: string,
): [boolean, boolean] {
  switch (fileExtension.toLowerCase()) {
    case ".py":
      return isPythonCommentLine(line, inBlockComment);
    case ".java":
    case ".cs":
      return isJavaCSharpCommentLine(line, inBlockComment);
    case ".go":
      return isGoCommentLine(line, inBlockComment);
    case ".php":
      return isPhpCommentLine(line, inBlockComment);
    case ".ts":
    case ".js":
    case ".tsx":
    case ".jsx":
    case ".mjs":
    case ".cjs":
    default:
      // Default to JavaScript/TypeScript comment syntax
      return isJsCommentLine(line, inBlockComment);
  }
}

/**
 * Searches the codebase for each Optimizely flag key, excluding comments but including test files.
 * @param flagKeys Array of Optimizely flag keys
 * @param rootDir Root directory to scan (e.g., "src/")
 * @returns Map of flag key to array of usages
 */
export async function findFlagUsagesInCodebase(
  flagKeys: string[],
  rootDir: string = "src/",
): Promise<Map<string, FlagUsage[]>> {
  const files = await collectSourceFiles(rootDir);
  const result = new Map<string, FlagUsage[]>();
  for (const flag of flagKeys) {
    result.set(flag, []);
  }
  for (const file of files) {
    const content = await Deno.readTextFile(file);
    const lines = content.split("\n");
    const fileExtension = extname(file);
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const [isComment, nextBlock] = isCommentLine(
        line,
        inBlockComment,
        fileExtension,
      );
      inBlockComment = nextBlock;
      if (isComment) continue;
      for (const flag of flagKeys) {
        // Use word boundary to avoid partial matches
        const regex = new RegExp(
          `\\b${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
        );
        if (regex.test(line)) {
          if (flag === "feature_foo" && file.endsWith("main.ts")) {
            // Debug: log found usage
            console.debug(
              `DEBUG: Found feature_foo in main.ts at line ${i + 1}: ${line.trim()}`,
            );
          }
          result.get(flag)?.push({ file, line: i + 1, context: line.trim() });
        }
      }
    }
  }
  return result;
}

/**
 * Enhanced version of flag search with configurable patterns and performance optimization.
 * @param flagKeys Array of Optimizely flag keys
 * @param config Code analysis configuration
 * @returns Map of flag key to array of usages
 */
export async function findFlagUsagesWithConfig(
  flagKeys: string[],
  config: CodeAnalysisConfig,
): Promise<Map<string, FlagUsage[]>> {
  const files = await collectSourceFilesWithConfig(
    config.workspaceRoot,
    config,
  );
  const result = new Map<string, FlagUsage[]>();

  // Initialize result map
  for (const flag of flagKeys) {
    result.set(flag, []);
  }

  // Process files with concurrency limit
  const semaphore = new Semaphore(config.concurrencyLimit);
  const promises = files.map((file) => {
    return semaphore.acquire(async () => {
      try {
        const content = await Deno.readTextFile(file);
        const lines = content.split("\n");
        const fileExtension = extname(file);
        let inBlockComment = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const [isComment, nextBlock] = isCommentLine(
            line,
            inBlockComment,
            fileExtension,
          );
          inBlockComment = nextBlock;
          if (isComment) continue;

          for (const flag of flagKeys) {
            // Use word boundary to avoid partial matches
            const regex = new RegExp(
              `\\b${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
            );
            if (regex.test(line)) {
              result.get(flag)?.push({
                file,
                line: i + 1,
                context: line.trim(),
              });
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not read file ${file}: ${message}`);
      }
    });
  });

  await Promise.all(promises);
  return result;
}

/**
 * Simple semaphore implementation for controlling concurrency.
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tryAcquire = () => {
        if (this.permits > 0) {
          this.permits--;
          fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              this.permits++;
              if (this.waitQueue.length > 0) {
                const next = this.waitQueue.shift()!;
                next();
              }
            });
        } else {
          this.waitQueue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
}
