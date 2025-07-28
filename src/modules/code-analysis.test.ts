import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  collectSourceFilesWithConfig,
  findFlagUsagesInCodebase,
  findFlagUsagesWithConfig,
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
