import { extname, globToRegExp, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/mod.ts";
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

  // Process files with enhanced parallel processing
  return await processFilesInParallel(files, flagKeys, config);
}

/**
 * Progress tracking interface for monitoring file processing.
 */
export interface ProgressTracker {
  totalFiles: number;
  processedFiles: number;
  currentBatch: number;
  totalBatches: number;
  startTime: number;
  flagsFound: number;
  filesWithFlags: number;
}

/**
 * Create a new progress tracker.
 * @param totalFiles Total number of files to process
 * @param totalBatches Total number of batches
 * @returns New progress tracker instance
 */
function createProgressTracker(totalFiles: number, totalBatches: number): ProgressTracker {
  return {
    totalFiles,
    processedFiles: 0,
    currentBatch: 0,
    totalBatches,
    startTime: Date.now(),
    flagsFound: 0,
    filesWithFlags: 0
  };
}

/**
 * Update progress tracker with batch results.
 * @param tracker Progress tracker to update
 * @param batchResults Results from processing a batch
 */
function updateProgress(tracker: ProgressTracker, batchResults: (Map<string, FlagUsage[]> | null)[]): void {
  tracker.currentBatch++;
  
  for (const batchResult of batchResults) {
    tracker.processedFiles++;
    
    if (batchResult) {
      let fileHasFlags = false;
      for (const [, usages] of batchResult.entries()) {
        if (usages.length > 0) {
          tracker.flagsFound += usages.length;
          fileHasFlags = true;
        }
      }
      if (fileHasFlags) {
        tracker.filesWithFlags++;
      }
    }
  }
}

/**
 * Print progress information.
 * @param tracker Progress tracker
 */
function printProgress(tracker: ProgressTracker): void {
  const elapsed = Date.now() - tracker.startTime;
  const rate = tracker.processedFiles / (elapsed / 1000);
  const percentage = (tracker.processedFiles / tracker.totalFiles * 100).toFixed(1);
  const estimatedTotal = elapsed / tracker.processedFiles * tracker.totalFiles;
  const remaining = Math.max(0, estimatedTotal - elapsed);
  
  console.log(
    `Progress: ${percentage}% (${tracker.processedFiles}/${tracker.totalFiles} files) | ` +
    `Batch ${tracker.currentBatch}/${tracker.totalBatches} | ` +
    `Rate: ${rate.toFixed(1)} files/sec | ` +
    `Flags found: ${tracker.flagsFound} in ${tracker.filesWithFlags} files | ` +
    `ETA: ${Math.round(remaining / 1000)}s`
  );
}

/**
 * Process files in parallel with optimized concurrency control and memory management.
 * @param files Array of file paths to process
 * @param flagKeys Array of flag keys to search for
 * @param config Code analysis configuration
 * @returns Map of flag key to array of usages
 */
export async function processFilesInParallel(
  files: string[],
  flagKeys: string[],
  config: CodeAnalysisConfig,
): Promise<Map<string, FlagUsage[]>> {
  const result = new Map<string, FlagUsage[]>();
  
  // Initialize result map
  for (const flag of flagKeys) {
    result.set(flag, []);
  }

  // Apply smart filtering if enabled
  const filteredFiles = applySmartFiltering(files, config);
  if (filteredFiles.length < files.length) {
    console.log(`Smart filtering reduced scope from ${files.length} to ${filteredFiles.length} files`);
  }

  // Calculate optimal batch size based on available memory and file count
  const batchSize = calculateOptimalBatchSize(filteredFiles.length, config.concurrencyLimit);
  const batches = chunkArray(filteredFiles, batchSize);
  
  // Initialize progress tracking
  const progress = createProgressTracker(filteredFiles.length, batches.length);
  
  console.log(`Processing ${filteredFiles.length} files in ${batches.length} batches of ~${batchSize} files each with concurrency limit ${config.concurrencyLimit}`);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Process each batch with controlled concurrency
    const semaphore = new Semaphore(config.concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(file => 
        semaphore.acquire(() => processFileForFlags(file, flagKeys))
      )
    );
    
    // Update progress tracking
    updateProgress(progress, batchResults);
    
    // Merge batch results into main result
    for (const batchResult of batchResults) {
      if (batchResult) {
        for (const [flag, usages] of batchResult.entries()) {
          result.get(flag)?.push(...usages);
        }
      }
    }
    
    // Print progress every few batches or for large batches
    if (batchIndex % 5 === 0 || batch.length > 100) {
      printProgress(progress);
    }
    
    // Force garbage collection between batches for large repositories
    if (batchIndex % 10 === 0 && typeof (globalThis as any).gc === 'function') {
      (globalThis as any).gc();
    }
  }
  
  // Final progress report
  printProgress(progress);
  
  const totalTime = Date.now() - progress.startTime;
  console.log(`\nCompleted processing ${filteredFiles.length} files in ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Found ${progress.flagsFound} flag references in ${progress.filesWithFlags} files`);
  
  return result;
}

/**
 * Calculate optimal batch size based on file count and concurrency limit.
 * @param totalFiles Total number of files to process
 * @param concurrencyLimit Maximum concurrent operations
 * @returns Optimal batch size
 */
function calculateOptimalBatchSize(totalFiles: number, concurrencyLimit: number): number {
  // For large codebases, process in smaller batches to manage memory
  if (totalFiles > 10000) {
    return Math.max(concurrencyLimit * 10, 100);
  } else if (totalFiles > 5000) {
    return Math.max(concurrencyLimit * 20, 200);
  } else if (totalFiles > 1000) {
    return Math.max(concurrencyLimit * 50, 500);
  }
  
  // For smaller codebases, process everything in one batch
  return totalFiles;
}

/**
 * Split array into chunks of specified size.
 * @param array Array to chunk
 * @param size Chunk size
 * @returns Array of chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process a single file for flag references with optimized memory usage.
 * @param file File path to process
 * @param flagKeys Array of flag keys to search for
 * @returns Map of flag key to array of usages for this file
 */
export async function processFileForFlags(
  file: string,
  flagKeys: string[]
): Promise<Map<string, FlagUsage[]> | null> {
  try {
    const content = await Deno.readTextFile(file);
    const lines = content.split("\n");
    const fileExtension = extname(file);
    const result = new Map<string, FlagUsage[]>();
    
    // Initialize result map for this file
    for (const flag of flagKeys) {
      result.set(flag, []);
    }
    
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
    
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not read file ${file}: ${message}`);
    return null;
  }
}

/**
 * File metadata for caching and indexing.
 */
interface FileMetadata {
  path: string;
  size: number;
  modifiedTime: number;
  hash?: string;
}

/**
 * File index cache for performance optimization.
 */
interface FileIndex {
  version: string;
  timestamp: number;
  files: FileMetadata[];
  flagUsages?: Map<string, FlagUsage[]>;
}

/**
 * File cache manager for large codebases.
 */
export class FileIndexCache {
  private cacheDir: string;
  private cacheFile: string;
  private index: FileIndex | null = null;

  constructor(workspaceRoot: string) {
    this.cacheDir = join(workspaceRoot, ".flag-sync-cache");
    this.cacheFile = join(this.cacheDir, "file-index.json");
  }

  /**
   * Initialize cache directory if it doesn't exist.
   */
  private async ensureCacheDir(): Promise<void> {
    try {
      await Deno.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, which is fine
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not create cache directory: ${message}`);
      }
    }
  }

  /**
   * Load existing file index from cache.
   */
  async loadIndex(): Promise<FileIndex | null> {
    try {
      if (await exists(this.cacheFile)) {
        const content = await Deno.readTextFile(this.cacheFile);
        const data = JSON.parse(content);
        
        // Convert Map from JSON
        if (data.flagUsages) {
          data.flagUsages = new Map(Object.entries(data.flagUsages));
        }
        
        this.index = data;
        return this.index;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not load file index cache: ${message}`);
    }
    return null;
  }

  /**
   * Save file index to cache.
   */
  async saveIndex(index: FileIndex): Promise<void> {
    try {
      await this.ensureCacheDir();
      
      // Convert Map to object for JSON serialization
      const serializable = {
        ...index,
        flagUsages: index.flagUsages ? Object.fromEntries(index.flagUsages) : undefined
      };
      
      await Deno.writeTextFile(this.cacheFile, JSON.stringify(serializable, null, 2));
      this.index = index;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not save file index cache: ${message}`);
    }
  }

  /**
   * Check if cached index is valid for given files.
   */
  async isIndexValid(files: string[]): Promise<boolean> {
    if (!this.index) {
      await this.loadIndex();
    }
    
    if (!this.index) {
      return false;
    }
    
    // Check if file count matches
    if (this.index.files.length !== files.length) {
      return false;
    }
    
    // Check if files have been modified since cache was created
    for (const filePath of files) {
      const cachedFile = this.index.files.find(f => f.path === filePath);
      if (!cachedFile) {
        return false;
      }
      
      try {
        const stat = await Deno.stat(filePath);
        if (stat.mtime && stat.mtime.getTime() !== cachedFile.modifiedTime) {
          return false;
        }
      } catch {
        // File might have been deleted
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get cached flag usages if available and valid.
   */
  async getCachedFlagUsages(files: string[]): Promise<Map<string, FlagUsage[]> | null> {
    if (await this.isIndexValid(files)) {
      return this.index?.flagUsages || null;
    }
    return null;
  }

  /**
   * Create file metadata for caching.
   */
  async createFileIndex(files: string[]): Promise<FileIndex> {
    const fileMetadata: FileMetadata[] = [];
    
    for (const filePath of files) {
      try {
        const stat = await Deno.stat(filePath);
        fileMetadata.push({
          path: filePath,
          size: stat.size,
          modifiedTime: stat.mtime?.getTime() || Date.now()
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not get stats for ${filePath}: ${message}`);
      }
    }
    
    return {
      version: "1.0.0",
      timestamp: Date.now(),
      files: fileMetadata
    };
  }

  /**
   * Update cache with flag usage results.
   */
  async updateCache(files: string[], flagUsages: Map<string, FlagUsage[]>): Promise<void> {
    const index = await this.createFileIndex(files);
    index.flagUsages = flagUsages;
    await this.saveIndex(index);
  }

  /**
   * Clear cache.
   */
  async clearCache(): Promise<void> {
    try {
      if (await exists(this.cacheFile)) {
        await Deno.remove(this.cacheFile);
      }
      this.index = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not clear cache: ${message}`);
    }
  }
}

/**
 * Enhanced file collection with smart filtering and indexing.
 * @param rootDir Root directory to scan
 * @param config Code analysis configuration
 * @returns Array of file paths with indexing metadata
 */
export async function collectSourceFilesWithIndexing(
  rootDir: string,
  config: CodeAnalysisConfig,
): Promise<string[]> {
  const cache = new FileIndexCache(rootDir);
  
  // Try to use cached file list first
  const existingIndex = await cache.loadIndex();
  if (existingIndex && await cache.isIndexValid(existingIndex.files.map(f => f.path))) {
    console.log(`Using cached file index with ${existingIndex.files.length} files`);
    return existingIndex.files.map(f => f.path);
  }
  
  console.log("Building new file index...");
  const files = await collectSourceFilesWithConfig(rootDir, config);
  
  // Cache the file list for future use
  await cache.updateCache(files, new Map());
  
  return files;
}

/**
 * Enhanced flag usage search with caching and indexing.
 * @param flagKeys Array of Optimizely flag keys
 * @param config Code analysis configuration
 * @returns Map of flag key to array of usages
 */
export async function findFlagUsagesWithCaching(
  flagKeys: string[],
  config: CodeAnalysisConfig,
): Promise<Map<string, FlagUsage[]>> {
  const cache = new FileIndexCache(config.workspaceRoot);
  const files = await collectSourceFilesWithIndexing(config.workspaceRoot, config);
  
  // Try to use cached results first
  const cachedResults = await cache.getCachedFlagUsages(files);
  if (cachedResults) {
    console.log("Using cached flag usage results");
    
    // Filter cached results to only include requested flags
    const result = new Map<string, FlagUsage[]>();
    for (const flag of flagKeys) {
      result.set(flag, cachedResults.get(flag) || []);
    }
    return result;
  }
  
  console.log("Computing new flag usage results...");
  const result = await processFilesInParallel(files, flagKeys, config);
  
  // Cache the results for future use
  await cache.updateCache(files, result);
  
  return result;
}

/**
 * Smart filtering to reduce scan scope for large repositories.
 * @param files Array of all files
 * @param config Code analysis configuration
 * @returns Filtered array of files likely to contain flag references
 */
export function applySmartFiltering(
  files: string[],
  config: CodeAnalysisConfig,
): string[] {
  // Priority file extensions (most likely to contain flag references)
  const highPriorityExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'];
  const mediumPriorityExtensions = ['.py', '.java', '.cs', '.go', '.php', '.rb', '.cpp', '.c'];
  const lowPriorityExtensions = ['.html', '.css', '.scss', '.less', '.sql'];
  
  // Categorize files by priority
  const highPriority: string[] = [];
  const mediumPriority: string[] = [];
  const lowPriority: string[] = [];
  
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    
    if (highPriorityExtensions.includes(ext)) {
      highPriority.push(file);
    } else if (mediumPriorityExtensions.includes(ext)) {
      mediumPriority.push(file);
    } else if (lowPriorityExtensions.includes(ext)) {
      lowPriority.push(file);
    }
  }
  
  // For very large codebases, prioritize high and medium priority files
  if (files.length > 50000) {
    console.log(`Large codebase detected (${files.length} files). Prioritizing high-value files.`);
    return [...highPriority, ...mediumPriority.slice(0, 10000)];
  } else if (files.length > 20000) {
    return [...highPriority, ...mediumPriority, ...lowPriority.slice(0, 5000)];
  }
  
  // For smaller codebases, scan everything
  return files;
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

/**
 * Language-specific patterns for flag reference extraction.
 */
export interface LanguagePatterns {
  [language: string]: {
    patterns: string[];
    fileExtensions: string[];
  };
}

/**
 * Default language patterns for feature flag extraction.
 */
export const DEFAULT_LANGUAGE_PATTERNS: LanguagePatterns = {
  typescript: {
    patterns: [
      "isEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "getFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "flag\\s*[=:]\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".ts", ".tsx"]
  },
  javascript: {
    patterns: [
      "isEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "getFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "flag\\s*[=:]\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".js", ".jsx", ".mjs", ".cjs"]
  },
  python: {
    patterns: [
      "is_enabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "get_flag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "flag\\s*=\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".py"]
  },
  java: {
    patterns: [
      "isEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "getFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "flag\\s*=\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".java"]
  },
  csharp: {
    patterns: [
      "IsEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "GetFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "flag\\s*=\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".cs"]
  },
  go: {
    patterns: [
      "IsEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "GetFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "flag\\s*:?=\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".go"]
  },
  php: {
    patterns: [
      "isEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "getFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
      "\\$flag\\s*=\\s*['\"]([^'\"]+)['\"],?",
      "['\"]([a-zA-Z0-9_-]+_flag)['\"],?",
      "['\"]([a-zA-Z0-9_-]*feature[a-zA-Z0-9_-]*)['\"],?"
    ],
    fileExtensions: [".php"]
  }
};

/**
 * Flag reference with metadata for validation and reporting.
 */
export interface FlagReference {
  flag: string;
  file: string;
  line: number;
  column?: number;
  context: string;
  confidence: number; // 0-1 confidence score
  pattern: string; // Pattern that matched
  language: string;
}

/**
 * Repository scan result.
 */
export interface ScanResult {
  totalFiles: number;
  processedFiles: number;
  flagReferences: FlagReference[];
  errors: string[];
  warnings: string[];
  processingTime: number;
  cacheUsed: boolean;
}

/**
 * Flag usage report.
 */
export interface FlagReport {
  summary: {
    totalFlags: number;
    usedFlags: number;
    unusedFlags: number;
    flagsWithIssues: number;
    totalReferences: number;
    filesScanned: number;
    processingTime: number;
  };
  usedFlags: {
    [flag: string]: {
      references: FlagReference[];
      confidence: number;
      files: string[];
      patterns: string[];
    };
  };
  unusedFlags: string[];
  flagsWithIssues: {
    [flag: string]: {
      issues: string[];
      references: FlagReference[];
    };
  };
  languageBreakdown: {
    [language: string]: {
      fileCount: number;
      flagCount: number;
    };
  };
  generatedAt: string;
  executionId: string;
}

/**
 * Recursively scan repository for source files and analyze feature flag usage.
 * This is the main entry point for repository analysis.
 * @param config Code analysis configuration
 * @param languagePatterns Optional custom language patterns
 * @returns Scan result with all flag references found
 */
export async function scanRepository(
  config: CodeAnalysisConfig,
  languagePatterns?: LanguagePatterns
): Promise<ScanResult> {
  const startTime = Date.now();
  const patterns = languagePatterns || DEFAULT_LANGUAGE_PATTERNS;
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log(`Starting repository scan of ${config.workspaceRoot}`);
  
  try {
    // Collect source files with enhanced indexing
    const files = await collectSourceFilesWithIndexing(config.workspaceRoot, config);
    console.log(`Found ${files.length} source files to analyze`);
    
    // Extract feature flags from all files
    const flagReferences = await extractFeatureFlags(files, patterns, config);
    console.log(`Extracted ${flagReferences.length} potential flag references`);
    
    const processingTime = Date.now() - startTime;
    
    const result: ScanResult = {
      totalFiles: files.length,
      processedFiles: files.length,
      flagReferences,
      errors,
      warnings,
      processingTime,
      cacheUsed: false // Could be enhanced to track cache usage
    };
    
    console.log(`Repository scan completed in ${(processingTime / 1000).toFixed(2)}s`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Repository scan failed: ${message}`);
    
    return {
      totalFiles: 0,
      processedFiles: 0,
      flagReferences: [],
      errors,
      warnings,
      processingTime: Date.now() - startTime,
      cacheUsed: false
    };
  }
}

/**
 * Extract feature flags from source files using configurable language patterns.
 * @param files Array of file paths to analyze
 * @param languagePatterns Language-specific extraction patterns
 * @param config Code analysis configuration
 * @returns Array of flag references found
 */
export async function extractFeatureFlags(
  files: string[],
  languagePatterns: LanguagePatterns,
  config: CodeAnalysisConfig
): Promise<FlagReference[]> {
  const flagReferences: FlagReference[] = [];
  
  // Process files with controlled concurrency
  const semaphore = new Semaphore(config.concurrencyLimit);
  const batches = chunkArray(files, 100); // Process in batches for memory efficiency
  
  console.log(`Extracting flags from ${files.length} files in ${batches.length} batches`);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    const batchResults = await Promise.all(
      batch.map(file => 
        semaphore.acquire(() => extractFlagsFromFile(file, languagePatterns))
      )
    );
    
    // Flatten batch results
    for (const result of batchResults) {
      if (result) {
        flagReferences.push(...result);
      }
    }
    
    // Progress reporting
    if (batchIndex % 10 === 0 || batch.length > 50) {
      const processed = (batchIndex + 1) * 100;
      const percentage = Math.min(100, (processed / files.length) * 100).toFixed(1);
      console.log(`Flag extraction progress: ${percentage}% (${Math.min(processed, files.length)}/${files.length} files)`);
    }
  }
  
  console.log(`Extracted ${flagReferences.length} flag references`);
  return flagReferences;
}

/**
 * Extract flags from a single file using language-specific patterns.
 * @param filePath Path to the file to analyze
 * @param languagePatterns Language-specific extraction patterns
 * @returns Array of flag references found in the file
 */
async function extractFlagsFromFile(
  filePath: string,
  languagePatterns: LanguagePatterns
): Promise<FlagReference[] | null> {
  try {
    const content = await Deno.readTextFile(filePath);
    const lines = content.split('\n');
    const fileExt = extname(filePath).toLowerCase();
    const flagReferences: FlagReference[] = [];
    
    // Determine language from file extension
    const language = getLanguageFromExtension(fileExt, languagePatterns);
    if (!language) {
      return null; // Skip unsupported file types
    }
    
    const patterns = languagePatterns[language]?.patterns || [];
    let inBlockComment = false;
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Skip comments
      const [isComment, nextBlock] = isCommentLine(line, inBlockComment, fileExt);
      inBlockComment = nextBlock;
      if (isComment) continue;
      
      // Apply each pattern to the line
      for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'gi');
        let match;
        
        while ((match = regex.exec(line)) !== null) {
          const flag = match[1]; // First capture group
          if (flag && flag.length > 2) { // Basic validation
            const confidence = calculateConfidence(flag, pattern, line, language);
            
            flagReferences.push({
              flag,
              file: filePath,
              line: lineIndex + 1,
              column: match.index,
              context: line.trim(),
              confidence,
              pattern,
              language
            });
          }
        }
      }
    }
    
    return flagReferences;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not extract flags from ${filePath}: ${message}`);
    return null;
  }
}

/**
 * Determine programming language from file extension.
 * @param extension File extension (e.g., '.ts', '.py')
 * @param languagePatterns Available language patterns
 * @returns Language identifier or null if not supported
 */
function getLanguageFromExtension(extension: string, languagePatterns: LanguagePatterns): string | null {
  for (const [language, config] of Object.entries(languagePatterns)) {
    if (config.fileExtensions.includes(extension)) {
      return language;
    }
  }
  return null;
}

/**
 * Calculate confidence score for a flag match.
 * @param flag The extracted flag name
 * @param pattern The pattern that matched
 * @param context The line context
 * @param language The programming language
 * @returns Confidence score between 0 and 1
 */
function calculateConfidence(flag: string, pattern: string, context: string, language: string): number {
  let confidence = 0.5; // Base confidence
  
  // Increase confidence for common flag patterns
  if (flag.includes('_flag') || flag.includes('feature_')) {
    confidence += 0.2;
  }
  
  // Increase confidence for function call patterns
  if (pattern.includes('isEnabled') || pattern.includes('getFlag')) {
    confidence += 0.3;
  }
  
  // Decrease confidence for very short or very long flag names
  if (flag.length < 3 || flag.length > 50) {
    confidence -= 0.2;
  }
  
  // Increase confidence for typical flag naming conventions
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(flag)) {
    confidence += 0.1;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Validate flag references for syntax and pattern correctness.
 * @param flagReferences Array of flag references to validate
 * @param knownFlags Optional array of known valid flags for validation
 * @returns Validation results with issues identified
 */
export function validateFlagReferences(
  flagReferences: FlagReference[],
  knownFlags?: string[]
): {
  validReferences: FlagReference[];
  invalidReferences: FlagReference[];
  issues: { [flag: string]: string[] };
} {
  const validReferences: FlagReference[] = [];
  const invalidReferences: FlagReference[] = [];
  const issues: { [flag: string]: string[] } = {};
  
  for (const reference of flagReferences) {
    const flagIssues: string[] = [];
    
    // Validate flag name syntax
    if (!isValidFlagName(reference.flag)) {
      flagIssues.push('Invalid flag name syntax');
    }
    
    // Check confidence threshold
    if (reference.confidence < 0.3) {
      flagIssues.push('Low confidence match');
    }
    
    // Validate against known flags if provided
    if (knownFlags && !knownFlags.includes(reference.flag)) {
      flagIssues.push('Flag not found in known flags list');
    }
    
    // Check for suspicious patterns
    if (reference.context.includes('console.log') || reference.context.includes('debug')) {
      flagIssues.push('Found in debug/logging context - may be false positive');
    }
    
    if (flagIssues.length > 0) {
      invalidReferences.push(reference);
      issues[reference.flag] = issues[reference.flag] || [];
      issues[reference.flag].push(...flagIssues);
    } else {
      validReferences.push(reference);
    }
  }
  
  return { validReferences, invalidReferences, issues };
}

/**
 * Validate if a flag name follows common naming conventions.
 * @param flagName Flag name to validate
 * @returns True if the flag name is valid
 */
function isValidFlagName(flagName: string): boolean {
  // Basic validation rules
  if (!flagName || flagName.length < 2 || flagName.length > 100) {
    return false;
  }
  
  // Should start with letter or underscore
  if (!/^[a-zA-Z_]/.test(flagName)) {
    return false;
  }
  
  // Should only contain alphanumeric, underscore, and dash
  if (!/^[a-zA-Z0-9_-]+$/.test(flagName)) {
    return false;
  }
  
  // Should not be a common false positive
  const falsePositives = ['test', 'config', 'value', 'data', 'key', 'name', 'id', 'type'];
  if (falsePositives.includes(flagName.toLowerCase())) {
    return false;
  }
  
  return true;
}

/**
 * Generate comprehensive flag usage report from scan results.
 * @param scanResult Repository scan results
 * @param knownFlags Array of known flags from Optimizely
 * @param executionId Unique identifier for this execution
 * @returns Comprehensive flag usage report
 */
export function generateFlagReport(
  scanResult: ScanResult,
  knownFlags: string[],
  executionId: string
): FlagReport {
  const startTime = Date.now();
  
  // Validate flag references
  const validation = validateFlagReferences(scanResult.flagReferences, knownFlags);
  
  // Group valid references by flag
  const usedFlags: { [flag: string]: { references: FlagReference[], confidence: number, files: string[], patterns: string[] } } = {};
  
  for (const ref of validation.validReferences) {
    if (!usedFlags[ref.flag]) {
      usedFlags[ref.flag] = {
        references: [],
        confidence: 0,
        files: [],
        patterns: []
      };
    }
    
    usedFlags[ref.flag].references.push(ref);
    usedFlags[ref.flag].confidence = Math.max(usedFlags[ref.flag].confidence, ref.confidence);
    
    if (!usedFlags[ref.flag].files.includes(ref.file)) {
      usedFlags[ref.flag].files.push(ref.file);
    }
    
    if (!usedFlags[ref.flag].patterns.includes(ref.pattern)) {
      usedFlags[ref.flag].patterns.push(ref.pattern);
    }
  }
  
  // Identify unused flags
  const usedFlagNames = Object.keys(usedFlags);
  const unusedFlags = knownFlags.filter(flag => !usedFlagNames.includes(flag));
  
  // Identify flags with issues
  const flagsWithIssues: { [flag: string]: { issues: string[], references: FlagReference[] } } = {};
  
  for (const [flag, issues] of Object.entries(validation.issues)) {
    flagsWithIssues[flag] = {
      issues: [...new Set(issues)], // Deduplicate issues
      references: validation.invalidReferences.filter(ref => ref.flag === flag)
    };
  }
  
  // Generate language breakdown
  const languageBreakdown: { [language: string]: { fileCount: number, flagCount: number } } = {};
  
  for (const ref of validation.validReferences) {
    if (!languageBreakdown[ref.language]) {
      languageBreakdown[ref.language] = { fileCount: 0, flagCount: 0 };
    }
    languageBreakdown[ref.language].flagCount++;
  }
  
  // Count unique files per language
  const filesByLanguage: { [language: string]: Set<string> } = {};
  for (const ref of validation.validReferences) {
    if (!filesByLanguage[ref.language]) {
      filesByLanguage[ref.language] = new Set();
    }
    filesByLanguage[ref.language].add(ref.file);
  }
  
  for (const [language, files] of Object.entries(filesByLanguage)) {
    languageBreakdown[language].fileCount = files.size;
  }
  
  const report: FlagReport = {
    summary: {
      totalFlags: knownFlags.length,
      usedFlags: usedFlagNames.length,
      unusedFlags: unusedFlags.length,
      flagsWithIssues: Object.keys(flagsWithIssues).length,
      totalReferences: validation.validReferences.length,
      filesScanned: scanResult.totalFiles,
      processingTime: scanResult.processingTime
    },
    usedFlags,
    unusedFlags,
    flagsWithIssues,
    languageBreakdown,
    generatedAt: new Date().toISOString(),
    executionId
  };
  
  const reportTime = Date.now() - startTime;
  console.log(`Flag report generated in ${reportTime}ms`);
  console.log(`Summary: ${report.summary.usedFlags}/${report.summary.totalFlags} flags used, ${report.summary.unusedFlags} unused, ${report.summary.flagsWithIssues} with issues`);
  
  return report;
}
