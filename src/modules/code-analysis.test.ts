import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { findFlagUsagesInCodebase } from "./code-analysis.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

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
    "ignore.test.ts": `
      // should not be scanned
      const t = 'feature_foo';
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
