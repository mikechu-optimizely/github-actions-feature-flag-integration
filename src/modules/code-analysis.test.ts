import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  collectSourceFilesWithConfig,
  DEFAULT_LANGUAGE_PATTERNS,
  extractFeatureFlags,
  findFlagUsagesInCodebase,
  findFlagUsagesWithConfig,
  scanRepository,
} from "./code-analysis.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { CodeAnalysisConfig } from "../types/config.ts";

/**
 * Helper to create a temporary directory with test files.
 */
async function withTempFiles(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
) {
  const dir = await Deno.makeTempDir();
  try {
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(dir, name);
      await Deno.mkdir(join(dir, ...name.split("/").slice(0, -1)), {
        recursive: true,
      });
      await Deno.writeTextFile(filePath, content);
    }
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("findFlagUsagesInCodebase finds usages and ignores comments", async () => {
  const files = {
    "main.ts": `
      // This is a comment with flag: feature_foo
      const used = isEnabled('feature_foo');
      /* Block comment with feature_bar */
      const unused = false;
      /* multi
         line comment with feature_baz
      */
      if (isEnabled("feature_bar")) {
        // feature_bar in comment
      }
    `,
    "helper.ts": `
      // feature_foo in comment
      export const FLAG = 'feature_baz';
      if (isEnabled('feature_baz')) {
        doSomething();
      }
    `,
    "helper.test.ts": `
      // Test file - now included in search
      const testFlag = 'feature_test';
    `,
    "README.md": `feature_foo should not be found here`,
  };
  const flagKeys = ["feature_foo", "feature_bar", "feature_baz"];
  await withTempFiles(files, async (dir) => {
    const result = await findFlagUsagesInCodebase(flagKeys, dir);
    // Debug output for actual result
    console.debug("DEBUG: feature_foo result:", result.get("feature_foo"));
    console.debug("DEBUG: feature_bar result:", result.get("feature_bar"));
    console.debug("DEBUG: feature_baz result:", result.get("feature_baz"));
    // feature_foo: only one real usage (not in comment)
    assertEquals(result.get("feature_foo")?.length, 1);
    assertEquals(result.get("feature_foo")?.[0].file.endsWith("main.ts"), true);
    // feature_bar: only one real usage (not in comment)
    assertEquals(result.get("feature_bar")?.length, 1);
    assertEquals(result.get("feature_bar")?.[0].file.endsWith("main.ts"), true);
    // feature_baz: two usages in helper.ts (string literal and function call)
    assertEquals(result.get("feature_baz")?.length, 2);
    assertEquals(
      result.get("feature_baz")?.every((u) => u.file.endsWith("helper.ts")),
      true,
    );
  });
});

Deno.test("scanRepository performs comprehensive repository analysis", async () => {
  const files = {
    "src/main.ts": `
      // This is a comment with flag: feature_foo
      const used = isEnabled('feature_foo');
      if (getFlag('feature_bar')) {
        doSomething();
      }
    `,
    "src/helper.py": `
      # Python comment with feature_baz
      if is_enabled('feature_baz'):
          pass
    `,
    "src/utils.js": `
      const flag = 'feature_test';
      if (isEnabled(flag)) {
        console.log('enabled');
      }
    `,
  };

  const config: CodeAnalysisConfig = {
    workspaceRoot: "/tmp",
    excludePatterns: ["**/*.md", "**/node_modules/**"],
    languages: ["typescript", "javascript", "python"],
    concurrencyLimit: 5,
    maxFileSize: 1024 * 1024,
  };

  await withTempFiles(files, async (dir) => {
    const scanResult = await scanRepository({
      ...config,
      workspaceRoot: dir,
    });

    // Should successfully scan all files
    assertEquals(scanResult.totalFiles, 3);
    assertEquals(scanResult.processedFiles, 3);
    assertEquals(scanResult.errors.length, 0);

    // Should find flag references
    assert(scanResult.flagReferences.length > 0);

    // Should have processing time
    assert(scanResult.processingTime > 0);
  });
});

Deno.test("extractFeatureFlags finds flags using language patterns", async () => {
  const files = {
    "main.ts": `
      const enabled = isEnabled('typescript_flag');
      if (getFlag('another_feature')) {
        doSomething();
      }
    `,
    "script.py": `
      if is_enabled('python_flag'):
          pass
    `,
  };

  const config: CodeAnalysisConfig = {
    workspaceRoot: "/tmp",
    excludePatterns: [],
    languages: ["typescript", "python"],
    concurrencyLimit: 5,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [
      join(dir, "main.ts"),
      join(dir, "script.py"),
    ];

    const { DEFAULT_LANGUAGE_PATTERNS } = await import("./code-analysis.ts");

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      config,
    );

    // Should find multiple flag references
    assert(flagReferences.length >= 3);

    // Should have proper metadata
    for (const ref of flagReferences) {
      assert(ref.flag.length > 0);
      assert(ref.line > 0);
      assert(ref.confidence >= 0 && ref.confidence <= 1);
      assert(ref.language.length > 0);
    }
  });
});

Deno.test("validateFlagReferences identifies valid and invalid references", async () => {
  const { validateFlagReferences } = await import("./code-analysis.ts");

  const flagReferences = [
    {
      flag: "valid_feature_flag",
      file: "test.ts",
      line: 1,
      context: "isEnabled('valid_feature_flag')",
      confidence: 0.8,
      pattern: "isEnabled",
      language: "typescript",
    },
    {
      flag: "x", // Too short
      file: "test.ts",
      line: 2,
      context: "isEnabled('x')",
      confidence: 0.2, // Low confidence
      pattern: "isEnabled",
      language: "typescript",
    },
    {
      flag: "unknown_flag",
      file: "test.ts",
      line: 3,
      context: "isEnabled('unknown_flag')",
      confidence: 0.9,
      pattern: "isEnabled",
      language: "typescript",
    },
  ];

  const knownFlags = ["valid_feature_flag", "another_known_flag"];

  const validation = validateFlagReferences(flagReferences, knownFlags);

  // Should identify valid references
  assertEquals(validation.validReferences.length, 1);
  assertEquals(validation.validReferences[0].flag, "valid_feature_flag");

  // Should identify invalid references
  assertEquals(validation.invalidReferences.length, 2);

  // Should have issues
  assert(Object.keys(validation.issues).length > 0);
});

Deno.test("generateFlagReport creates comprehensive usage report", async () => {
  const { generateFlagReport } = await import("./code-analysis.ts");

  const scanResult = {
    totalFiles: 10,
    processedFiles: 10,
    flagReferences: [
      {
        flag: "used_flag",
        file: "test1.ts",
        line: 1,
        context: "isEnabled('used_flag')",
        confidence: 0.9,
        pattern: "isEnabled",
        language: "typescript",
      },
      {
        flag: "used_flag",
        file: "test2.ts",
        line: 5,
        context: "getFlag('used_flag')",
        confidence: 0.8,
        pattern: "getFlag",
        language: "typescript",
      },
    ],
    errors: [],
    warnings: [],
    processingTime: 1000,
    cacheUsed: false,
  };

  const knownFlags = ["used_flag", "unused_flag", "another_unused_flag"];
  const executionId = "test-execution-123";

  const report = generateFlagReport(scanResult, knownFlags, executionId);

  // Summary should be accurate
  assertEquals(report.summary.totalFlags, 3);
  assertEquals(report.summary.usedFlags, 1);
  assertEquals(report.summary.unusedFlags, 2);
  assertEquals(report.summary.totalReferences, 2);
  assertEquals(report.summary.filesScanned, 10);

  // Used flags should be detailed
  assert("used_flag" in report.usedFlags);
  assertEquals(report.usedFlags["used_flag"].references.length, 2);
  assertEquals(report.usedFlags["used_flag"].files.length, 2);
  assertEquals(report.usedFlags["used_flag"].confidence, 0.9);

  // Unused flags should be listed
  assertEquals(report.unusedFlags.length, 2);
  assert(report.unusedFlags.includes("unused_flag"));
  assert(report.unusedFlags.includes("another_unused_flag"));

  // Report metadata should be present
  assertEquals(report.executionId, executionId);
  assert(report.generatedAt.length > 0);
});

Deno.test("findFlagUsagesInCodebase returns empty for unused flags", async () => {
  const files = {
    "main.ts": `const nothing = true;`,
  };
  const flagKeys = ["unused_flag"];
  await withTempFiles(files, async (dir) => {
    const result = await findFlagUsagesInCodebase(flagKeys, dir);
    assertEquals(result.get("unused_flag"), []);
  });
});

Deno.test("findFlagUsagesInCodebase handles multiple files and nested dirs", async () => {
  const files = {
    "a/b/c.ts": `if (isEnabled('flag_x')) {}`,
    "d/e/f.ts": `if (isEnabled('flag_y')) {}`,
  };
  const flagKeys = ["flag_x", "flag_y"];
  await withTempFiles(files, async (dir) => {
    const result = await findFlagUsagesInCodebase(flagKeys, dir);
    assertEquals(result.get("flag_x")?.[0].file.endsWith("c.ts"), true);
    assertEquals(result.get("flag_y")?.[0].file.endsWith("f.ts"), true);
  });
});

Deno.test("findFlagUsagesInCodebase handles python-style # comments", async () => {
  const files = {
    "script.py": `
      # This is a comment with feature_foo
      used = is_enabled('feature_foo')
      # feature_bar in comment
      if is_enabled('feature_bar'):
          pass
      '''
      feature_baz in docstring
      '''
      if is_enabled('feature_baz'):
          pass
    `,
  };
  const flagKeys = ["feature_foo", "feature_bar", "feature_baz"];
  await withTempFiles(files, async (dir) => {
    const result = await findFlagUsagesInCodebase(flagKeys, dir);
    // feature_foo: only one real usage (not in comment)
    assertEquals(result.get("feature_foo")?.length, 1);
    assertEquals(
      result.get("feature_foo")?.[0].file.endsWith("script.py"),
      true,
    );
    // feature_bar: only one real usage (not in comment)
    assertEquals(result.get("feature_bar")?.length, 1);
    assertEquals(
      result.get("feature_bar")?.[0].file.endsWith("script.py"),
      true,
    );
    // feature_baz: only one real usage (not in docstring)
    assertEquals(result.get("feature_baz")?.length, 1);
    assertEquals(
      result.get("feature_baz")?.[0].file.endsWith("script.py"),
      true,
    );
  });
});

Deno.test("findFlagUsagesInCodebase correctly identifies flag usage context", async () => {
  const files = {
    "main.ts": `
      // This is a comment with flag: feature_foo
      const used = isEnabled('feature_foo');
      /* Block comment with feature_bar */
      const unused = false;
      /* multi
         line comment with feature_baz
      */
      if (isEnabled("feature_bar")) {
        // feature_bar in comment
      }
    `,
    "helper.ts": `
      // feature_foo in comment
      export const FLAG = 'feature_baz';
      if (isEnabled('feature_baz')) {
        doSomething();
      }
    `,
  };
  const flagKeys = ["feature_foo", "feature_bar", "feature_baz"];
  await withTempFiles(files, async (dir) => {
    const result = await findFlagUsagesInCodebase(flagKeys, dir);
    // feature_foo: only one real usage (not in comment)
    assertEquals(result.get("feature_foo")?.length, 1);
    assertEquals(result.get("feature_foo")?.[0].file.endsWith("main.ts"), true);
    // feature_bar: one real usage (found in double quotes)
    assertEquals(result.get("feature_bar")?.length, 1);
    assertEquals(result.get("feature_bar")?.[0].file.endsWith("main.ts"), true);
    // feature_baz: two usages, one is a declaration, one is a usage
    assertEquals(result.get("feature_baz")?.length, 2);
    assertEquals(
      result.get("feature_baz")?.some((u) =>
        u.file.endsWith("helper.ts") &&
        u.context.includes("isEnabled('feature_baz')")
      ),
      true,
    );
  });
});

Deno.test("collectSourceFilesWithConfig respects exclude patterns", async () => {
  const files = {
    "src/main.ts": "const code = true;",
    "src/utils.ts": "const helper = true;",
    "tests/main.test.ts": "const test = true;",
    "docs/README.md": "# Documentation",
    "node_modules/package/index.js": "module.exports = {};",
    "dist/bundle.js": "var bundle = {};",
  };

  const config: CodeAnalysisConfig = {
    workspaceRoot: "/tmp",
    excludePatterns: ["**/*.test.ts", "**/node_modules/**", "**/dist/**", "**/*.md"],
    languages: ["typescript", "javascript"],
    concurrencyLimit: 5,
    maxFileSize: 1024 * 1024,
  };

  await withTempFiles(files, async (dir) => {
    const result = await collectSourceFilesWithConfig(dir, {
      ...config,
      workspaceRoot: dir,
    });

    // Should include main.ts and utils.ts
    assertEquals(result.filter((f) => f.endsWith("main.ts")).length, 1);
    assertEquals(result.filter((f) => f.endsWith("utils.ts")).length, 1);

    // Should exclude test files, docs, node_modules, and dist
    assertEquals(result.filter((f) => f.includes("test")).length, 0);
    assertEquals(result.filter((f) => f.includes("node_modules")).length, 0);
    assertEquals(result.filter((f) => f.includes("dist")).length, 0);
    assertEquals(result.filter((f) => f.endsWith(".md")).length, 0);
  });
});

Deno.test("collectSourceFilesWithConfig respects include patterns", async () => {
  const files = {
    "src/main.ts": "const code = true;",
    "src/utils.js": "const helper = true;",
    "src/data.json": '{ "key": "value" }',
    "src/styles.css": "body { margin: 0; }",
  };

  const config: CodeAnalysisConfig = {
    workspaceRoot: "/tmp",
    excludePatterns: [],
    includePatterns: ["**/*.ts", "**/*.js"], // Only TypeScript and JavaScript files
    languages: ["typescript", "javascript"],
    concurrencyLimit: 5,
    maxFileSize: 1024 * 1024,
  };

  await withTempFiles(files, async (dir) => {
    const result = await collectSourceFilesWithConfig(dir, {
      ...config,
      workspaceRoot: dir,
    });

    // Should include .ts and .js files
    assertEquals(result.filter((f) => f.endsWith("main.ts")).length, 1);
    assertEquals(result.filter((f) => f.endsWith("utils.js")).length, 1);

    // Should exclude .json and .css files
    assertEquals(result.filter((f) => f.endsWith(".json")).length, 0);
    assertEquals(result.filter((f) => f.endsWith(".css")).length, 0);
  });
});

Deno.test("findFlagUsagesWithConfig uses configurable patterns", async () => {
  const files = {
    "src/main.ts": `
      const used = isEnabled('feature_foo');
      if (isEnabled('feature_bar')) {
        doSomething();
      }
    `,
    "tests/main.test.ts": `
      // This should be excluded
      const test = isEnabled('feature_foo');
    `,
    "docs/README.md": `
      This mentions feature_foo but should be excluded
    `,
  };

  const config: CodeAnalysisConfig = {
    workspaceRoot: "/tmp",
    excludePatterns: ["**/*.test.ts", "**/*.md", "**/tests/**", "**/docs/**"],
    languages: ["typescript"],
    concurrencyLimit: 2,
    maxFileSize: 1024 * 1024,
  };

  const flagKeys = ["feature_foo", "feature_bar"];
  await withTempFiles(files, async (dir) => {
    const result = await findFlagUsagesWithConfig(flagKeys, {
      ...config,
      workspaceRoot: dir,
    });

    // Should find flags in main.ts but not in excluded files
    assertEquals(result.get("feature_foo")?.length, 1);
    assertEquals(result.get("feature_bar")?.length, 1);

    // All usages should be from main.ts (not test files or docs)
    const allUsages = [
      ...(result.get("feature_foo") || []),
      ...(result.get("feature_bar") || []),
    ];

    for (const usage of allUsages) {
      assertStringIncludes(usage.file, "main.ts");
    }
  });
});

Deno.test("findFlagUsagesWithConfig handles concurrency limits", async () => {
  const files: Record<string, string> = {};

  // Create multiple files to test concurrency
  for (let i = 0; i < 10; i++) {
    files[`file${i}.ts`] = `
      const flag${i} = isEnabled('test_flag');
      if (isEnabled('test_flag')) {
        console.log('Flag ${i} is enabled');
      }
    `;
  }

  const config: CodeAnalysisConfig = {
    workspaceRoot: "/tmp",
    excludePatterns: [],
    languages: ["typescript"],
    concurrencyLimit: 3, // Limit to 3 concurrent operations
    maxFileSize: 1024 * 1024,
  };

  const flagKeys = ["test_flag"];
  await withTempFiles(files, async (dir) => {
    const startTime = Date.now();
    const result = await findFlagUsagesWithConfig(flagKeys, {
      ...config,
      workspaceRoot: dir,
    });
    const endTime = Date.now();

    // Should find the flag in all files (2 usages per file = 20 total)
    assertEquals(result.get("test_flag")?.length, 20);

    // Test completed within reasonable time (concurrency should help)
    const duration = endTime - startTime;
    console.debug(`Concurrent processing took ${duration}ms`);

    // Verify that all usages have proper context
    const usages = result.get("test_flag") || [];
    for (const usage of usages) {
      assertStringIncludes(usage.context, "test_flag");
    }
  });
});

// Multi-language support tests
Deno.test("JavaScript flag detection patterns work correctly", async () => {
  const files = {
    "script.js": `
      // Comment with js_feature_flag
      const enabled = isEnabled('js_feature_flag');
      if (getFlag('another_js_flag')) {
        console.log('enabled');
      }
      const flagName = 'string_literal_flag';
      /* Block comment with blocked_flag */
      const config = {
        flag: 'config_flag',
        enabled: getFlag('method_call_flag')
      };
    `,
    "module.mjs": `
      export const feature = isEnabled('module_flag');
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [
      join(dir, "script.js"),
      join(dir, "module.mjs"),
    ];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["javascript"],
        concurrencyLimit: 5,
      },
    );

    // Should find multiple flag references but exclude comments
    assert(flagReferences.length >= 5);

    // Check specific flags are found
    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("js_feature_flag"));
    assert(flagNames.includes("another_js_flag"));
    assert(flagNames.includes("string_literal_flag"));
    assert(flagNames.includes("config_flag"));
    assert(flagNames.includes("method_call_flag"));
    assert(flagNames.includes("module_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("blocked_flag"));

    // All should be JavaScript language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "javascript");
    }
  });
});

Deno.test("TypeScript flag detection patterns work correctly", async () => {
  const files = {
    "component.tsx": `
      interface FeatureFlags {
        typescript_flag: boolean;
      }
      // Comment with ts_feature_flag
      const enabled: boolean = isEnabled('ts_feature_flag');
      if (getFlag('typed_flag')) {
        render();
      }
      /* Block comment with blocked_ts_flag */
      const feature = 'literal_ts_flag';
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [join(dir, "component.tsx")];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["typescript"],
        concurrencyLimit: 5,
      },
    );

    // Should find flag references but exclude comments
    assert(flagReferences.length >= 3);

    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("ts_feature_flag"));
    assert(flagNames.includes("typed_flag"));
    assert(flagNames.includes("literal_ts_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("blocked_ts_flag"));

    // All should be TypeScript language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "typescript");
    }
  });
});

Deno.test("Python flag detection patterns work correctly", async () => {
  const files = {
    "feature_service.py": `
      # Comment with py_feature_flag
      enabled = is_enabled('py_feature_flag')
      if get_flag('python_flag'):
          pass
      """
      Docstring with docstring_flag
      """
      flag_name = 'literal_python_flag'
      config = {
          'flag': 'dict_python_flag'
      }
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [join(dir, "feature_service.py")];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["python"],
        concurrencyLimit: 5,
      },
    );

    // Should find flag references but exclude comments and docstrings
    assert(flagReferences.length >= 3);

    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("py_feature_flag"));
    assert(flagNames.includes("python_flag"));
    assert(flagNames.includes("literal_python_flag"));
    assert(flagNames.includes("dict_python_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("docstring_flag"));

    // All should be Python language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "python");
    }
  });
});

Deno.test("Java flag detection patterns work correctly", async () => {
  const files = {
    "FeatureService.java": `
      public class FeatureService {
          // Comment with java_feature_flag
          public boolean checkFeature() {
              return isEnabled("java_feature_flag");
          }
          
          /* Block comment with blocked_java_flag */
          private String flagName = "literal_java_flag";
          
          public void processFlags() {
              if (getFlag("method_java_flag")) {
                  System.out.println("Feature enabled");
              }
          }
      }
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [join(dir, "FeatureService.java")];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["java"],
        concurrencyLimit: 5,
      },
    );

    // Should find flag references but exclude comments
    assert(flagReferences.length >= 3);

    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("java_feature_flag"));
    assert(flagNames.includes("literal_java_flag"));
    assert(flagNames.includes("method_java_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("blocked_java_flag"));

    // All should be Java language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "java");
    }
  });
});

Deno.test("C# flag detection patterns work correctly", async () => {
  const files = {
    "FeatureService.cs": `
      public class FeatureService
      {
          // Comment with csharp_feature_flag
          public bool CheckFeature()
          {
              return IsEnabled("csharp_feature_flag");
          }
          
          /* Block comment with blocked_csharp_flag */
          private string flagName = "literal_csharp_flag";
          
          public void ProcessFlags()
          {
              if (GetFlag("method_csharp_flag"))
              {
                  Console.WriteLine("Feature enabled");
              }
          }
      }
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [join(dir, "FeatureService.cs")];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["csharp"],
        concurrencyLimit: 5,
      },
    );

    // Should find flag references but exclude comments
    assert(flagReferences.length >= 3);

    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("csharp_feature_flag"));
    assert(flagNames.includes("literal_csharp_flag"));
    assert(flagNames.includes("method_csharp_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("blocked_csharp_flag"));

    // All should be C# language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "csharp");
    }
  });
});

Deno.test("Go flag detection patterns work correctly", async () => {
  const files = {
    "feature_service.go": `
      package main
      
      import "fmt"
      
      func checkFeature() bool {
          // Comment with go_feature_flag
          return IsEnabled("go_feature_flag")
      }
      
      /* Block comment with blocked_go_flag */
      var flagName string = "literal_go_flag"
      
      func processFlags() {
          if GetFlag("method_go_flag") {
              fmt.Println("Feature enabled")
          }
          flag := "assignment_go_flag"
          _ = flag
      }
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [join(dir, "feature_service.go")];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["go"],
        concurrencyLimit: 5,
      },
    );

    // Should find flag references but exclude comments
    assert(flagReferences.length >= 4);

    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("go_feature_flag"));
    assert(flagNames.includes("literal_go_flag"));
    assert(flagNames.includes("method_go_flag"));
    assert(flagNames.includes("assignment_go_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("blocked_go_flag"));

    // All should be Go language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "go");
    }
  });
});

Deno.test("PHP flag detection patterns work correctly", async () => {
  const files = {
    "FeatureService.php": `
      <?php
      class FeatureService {
          // Comment with php_feature_flag
          public function checkFeature() {
              return isEnabled("php_feature_flag");
          }
          
          /* Block comment with blocked_php_flag */
          private $flagName = "literal_php_flag";
          
          public function processFlags() {
              if (getFlag("method_php_flag")) {
                  echo "Feature enabled";
              }
              # Hash comment with hash_php_flag
              $flag = "assignment_php_flag";
          }
      }
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [join(dir, "FeatureService.php")];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["php"],
        concurrencyLimit: 5,
      },
    );

    // Should find flag references but exclude comments
    assert(flagReferences.length >= 4);

    const flagNames = flagReferences.map((ref) => ref.flag);
    assert(flagNames.includes("php_feature_flag"));
    assert(flagNames.includes("literal_php_flag"));
    assert(flagNames.includes("method_php_flag"));
    assert(flagNames.includes("assignment_php_flag"));

    // Should not include commented flags
    assert(!flagNames.includes("blocked_php_flag"));
    assert(!flagNames.includes("hash_php_flag"));

    // All should be PHP language
    for (const ref of flagReferences) {
      assertEquals(ref.language, "php");
    }
  });
});

Deno.test("Multi-language comment handling works correctly", async () => {
  const files = {
    "mixed.js": `
      // Single line comment with flag_in_js_comment
      const flag1 = 'real_js_flag';
      /* Block comment with flag_in_js_block_comment */
    `,
    "mixed.py": `
      # Single line comment with flag_in_py_comment
      flag2 = 'real_py_flag'
      """
      Docstring with flag_in_py_docstring
      """
    `,
    "mixed.java": `
      // Single line comment with flag_in_java_comment
      String flag3 = "real_java_flag";
      /* Block comment with flag_in_java_block_comment */
    `,
    "mixed.php": `
      // Single line comment with flag_in_php_comment
      $flag4 = "real_php_flag";
      /* Block comment with flag_in_php_block_comment */
      # Hash comment with flag_in_php_hash_comment
    `,
  };

  await withTempFiles(files, async (dir) => {
    const filePaths = [
      join(dir, "mixed.js"),
      join(dir, "mixed.py"),
      join(dir, "mixed.java"),
      join(dir, "mixed.php"),
    ];

    const flagReferences = await extractFeatureFlags(
      filePaths,
      DEFAULT_LANGUAGE_PATTERNS,
      {
        workspaceRoot: dir,
        excludePatterns: [],
        languages: ["javascript", "python", "java", "php"],
        concurrencyLimit: 5,
      },
    );

    const flagNames = flagReferences.map((ref) => ref.flag);

    // Should find real flags
    assert(flagNames.includes("real_js_flag"));
    assert(flagNames.includes("real_py_flag"));
    assert(flagNames.includes("real_java_flag"));
    assert(flagNames.includes("real_php_flag"));

    // Should NOT find commented flags
    assert(!flagNames.includes("flag_in_js_comment"));
    assert(!flagNames.includes("flag_in_js_block_comment"));
    assert(!flagNames.includes("flag_in_py_comment"));
    assert(!flagNames.includes("flag_in_py_docstring"));
    assert(!flagNames.includes("flag_in_java_comment"));
    assert(!flagNames.includes("flag_in_java_block_comment"));
    assert(!flagNames.includes("flag_in_php_comment"));
    assert(!flagNames.includes("flag_in_php_block_comment"));
    assert(!flagNames.includes("flag_in_php_hash_comment"));

    // Verify languages are correctly identified
    const jsFlagRef = flagReferences.find((ref) => ref.flag === "real_js_flag");
    assertEquals(jsFlagRef?.language, "javascript");

    const pyFlagRef = flagReferences.find((ref) => ref.flag === "real_py_flag");
    assertEquals(pyFlagRef?.language, "python");

    const javaFlagRef = flagReferences.find((ref) => ref.flag === "real_java_flag");
    assertEquals(javaFlagRef?.language, "java");

    const phpFlagRef = flagReferences.find((ref) => ref.flag === "real_php_flag");
    assertEquals(phpFlagRef?.language, "php");
  });
});
