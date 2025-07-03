import { extname, join } from "https://deno.land/std@0.224.0/path/mod.ts";

/**
 * Represents a usage of a feature flag in the codebase.
 */
export interface FlagUsage {
  file: string;
  line: number;
  context: string;
}

/**
 * Recursively collects all source files to scan, excluding test files and documentation.
 * @param rootDir Root directory to scan
 * @returns Array of file paths
 */
export async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(rootDir)) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory) {
      files.push(...(await collectSourceFiles(fullPath)));
    } else if (
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".md") &&
      !entry.name.endsWith(".spec.ts") &&
      !entry.name.endsWith(".test.js") &&
      !entry.name.endsWith(".spec.js") &&
      ![".md", ".json", ".lock"].includes(extname(entry.name))
    ) {
      files.push(fullPath);
    }
  }
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
  if (fileExtension === ".py") {
    return isPythonCommentLine(line, inBlockComment);
  } else {
    // Default to JavaScript/TypeScript for .ts, .js, .tsx, .jsx, etc.
    return isJsCommentLine(line, inBlockComment);
  }
}

/**
 * Searches the codebase for each Optimizely flag key, excluding comments, test files, and documentation.
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
              `DEBUG: Found feature_foo in main.ts at line ${
                i + 1
              }: ${line.trim()}`,
            );
          }
          result.get(flag)?.push({ file, line: i + 1, context: line.trim() });
        }
      }
    }
  }
  return result;
}
