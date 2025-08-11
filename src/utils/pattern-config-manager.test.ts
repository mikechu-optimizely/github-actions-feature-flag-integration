import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

import {
  createPatternConfigManager,
  type NamingConvention,
  type PatternConfigFile,
  PatternConfigurationManager,
  type PatternDefinition,
} from "./pattern-config-manager.ts";

// Test utilities
const TEST_DIR = "/tmp/pattern-config-test";
const OPTIMIZELY_DIR = join(TEST_DIR, ".github", "optimizely");
const CONFIG_DIR = join(TEST_DIR, "config", "patterns");

async function setupPatternTestEnvironment() {
  await ensureDir(OPTIMIZELY_DIR);
  await ensureDir(CONFIG_DIR);
}

async function cleanupPatternTestEnvironment() {
  try {
    await Deno.remove(TEST_DIR, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function createDefaultPatternsFile() {
  const defaultPatterns: PatternConfigFile = {
    version: "1.0.0",
    description: "Test default patterns",
    languages: {
      typescript: {
        name: "TypeScript",
        patterns: [
          {
            name: "test_pattern",
            pattern: "isEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
            description: "Test pattern",
            confidence: 0.9,
          },
        ],
        fileExtensions: [".ts", ".tsx"],
        commentPatterns: {
          singleLine: "//",
          blockStart: "/*",
          blockEnd: "*/",
        },
      },
    },
    metadata: {
      createdBy: "test",
      createdAt: "2024-01-01T00:00:00Z",
      version: "1.0.0",
    },
  };

  const filePath = join(CONFIG_DIR, "default-patterns.json");
  await Deno.writeTextFile(filePath, JSON.stringify(defaultPatterns, null, 2));
  return filePath;
}

async function createOptimizelyPatternsFile(filename = "patterns.json") {
  const optimizelyPatterns: PatternConfigFile = {
    version: "1.0.0",
    description: "Test Optimizely patterns",
    languages: {
      typescript: {
        name: "TypeScript (Optimizely)",
        patterns: [
          {
            name: "optimizely_pattern",
            pattern: "optimizely\\.isFeatureEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
            description: "Optimizely pattern",
            confidence: 0.95,
            tags: ["optimizely"],
          },
        ],
        fileExtensions: [".ts", ".tsx"],
        commentPatterns: {
          singleLine: "//",
          blockStart: "/*",
          blockEnd: "*/",
        },
      },
    },
    metadata: {
      createdBy: "test",
      createdAt: "2024-01-01T00:00:00Z",
      version: "1.0.0",
    },
  };

  const filePath = join(OPTIMIZELY_DIR, filename);
  await Deno.writeTextFile(filePath, JSON.stringify(optimizelyPatterns, null, 2));
  return filePath;
}

Deno.test({
  name: "PatternConfigurationManager - Constructor",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      const manager = new PatternConfigurationManager(TEST_DIR);
      assertExists(manager);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Load default patterns only",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns();

      assertExists(patterns.typescript);
      assertEquals(patterns.typescript.name, "TypeScript");
      assertEquals(patterns.typescript.patterns.length, 1);
      assertEquals(patterns.typescript.patterns[0].name, "test_pattern");
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Load with Optimizely patterns",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();
      await createOptimizelyPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns();

      assertExists(patterns.typescript);
      assertEquals(patterns.typescript.name, "TypeScript (Optimizely)");
      assertEquals(patterns.typescript.patterns.length, 1); // Only Optimizely (replaces default)

      // Should have only the Optimizely pattern (replaces default config)
      const patternNames = patterns.typescript.patterns.map((p) => p.name);
      assertEquals(patternNames.includes("optimizely_pattern"), true);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Load multiple Optimizely files",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();
      await createOptimizelyPatternsFile("patterns1.json");

      // Create second Optimizely file
      const patterns2: PatternConfigFile = {
        version: "1.0.0",
        description: "Second patterns file",
        languages: {
          javascript: {
            name: "JavaScript",
            patterns: [
              {
                name: "js_pattern",
                pattern: "getFlag\\s*\\(['\"]([^'\"]+)['\"]\\)",
                description: "JS pattern",
                confidence: 0.8,
              },
            ],
            fileExtensions: [".js"],
            commentPatterns: {
              singleLine: "//",
              blockStart: "/*",
              blockEnd: "*/",
            },
          },
        },
        metadata: {
          createdBy: "test",
          createdAt: "2024-01-01T00:00:00Z",
          version: "1.0.0",
        },
      };

      await Deno.writeTextFile(
        join(OPTIMIZELY_DIR, "patterns2.json"),
        JSON.stringify(patterns2, null, 2),
      );

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns();

      // Should have both TypeScript and JavaScript patterns
      assertExists(patterns.typescript);
      assertExists(patterns.javascript);
      assertEquals(patterns.javascript.patterns[0].name, "js_pattern");
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Cache functionality",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);

      // First load
      const patterns1 = await manager.loadPatterns();

      // Second load should use cache
      const patterns2 = await manager.loadPatterns();

      // Should be the same reference (cached)
      assertEquals(patterns1, patterns2);

      // Clear cache and load again
      manager.clearCache();
      const patterns3 = await manager.loadPatterns();

      // Should be different reference but same content
      assertEquals(patterns1.typescript.name, patterns3.typescript.name);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Pattern validation",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns({ validatePatterns: true });

      assertExists(patterns.typescript);

      // Test validation method directly
      const validationResult = manager.validatePatterns(patterns);
      assertEquals(validationResult.isValid, true);
      assertEquals(validationResult.patterns.total, 1);
      assertEquals(validationResult.patterns.valid, 1);
      assertEquals(validationResult.patterns.invalid, 0);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Invalid patterns",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      // Create patterns with invalid regex
      const invalidPatterns: PatternConfigFile = {
        version: "1.0.0",
        description: "Invalid patterns",
        languages: {
          typescript: {
            name: "TypeScript",
            patterns: [
              {
                name: "invalid_pattern",
                pattern: "[invalid_regex",
                description: "Invalid regex",
                confidence: 0.9,
              },
            ],
            fileExtensions: [".ts"],
            commentPatterns: {
              singleLine: "//",
              blockStart: "/*",
              blockEnd: "*/",
            },
          },
        },
        metadata: {
          createdBy: "test",
          createdAt: "2024-01-01T00:00:00Z",
          version: "1.0.0",
        },
      };

      await Deno.writeTextFile(
        join(CONFIG_DIR, "default-patterns.json"),
        JSON.stringify(invalidPatterns, null, 2),
      );

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns({ validatePatterns: true });

      const validationResult = manager.validatePatterns(patterns);
      assertEquals(validationResult.isValid, false);
      assertEquals(validationResult.patterns.invalid, 1);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Test pattern matching",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns();

      const testPattern = patterns.typescript.patterns[0];
      const sampleText = 'if (isEnabled("my_flag")) { console.log("enabled"); }';

      const result = manager.testPattern(testPattern, sampleText);
      assertEquals(result.success, true);
      assertEquals(result.matches.length, 1);
      assertEquals(result.matches[0][1], "my_flag");
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Get language config",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns();

      const tsConfig = manager.getLanguageConfig("typescript", patterns);
      assertExists(tsConfig);
      assertEquals(tsConfig.name, "TypeScript");

      const nonExistent = manager.getLanguageConfig("nonexistent", patterns);
      assertEquals(nonExistent, null);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Get supported extensions",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      const patterns = await manager.loadPatterns();

      const extensions = manager.getSupportedExtensions(patterns);
      assertEquals(extensions.includes(".ts"), true);
      assertEquals(extensions.includes(".tsx"), true);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Create naming convention from examples",
  fn() {
    const manager = new PatternConfigurationManager(TEST_DIR);

    const examples = ["feature_login", "feature_checkout", "feature_analytics"];
    const convention = manager.createNamingConventionFromExamples(examples, "feature_flags");

    assertEquals(convention.name, "feature_flags");
    assertEquals(convention.prefix, "feature_");
    assertEquals(convention.examples.length, 3);
    assertExists(convention.pattern);
    assertExists(convention.validation);
  },
});

Deno.test({
  name: "PatternConfigurationManager - Generate patterns from naming conventions",
  fn() {
    const manager = new PatternConfigurationManager(TEST_DIR);

    const convention: NamingConvention = {
      name: "test_convention",
      prefix: "ff_",
      pattern: "[a-zA-Z0-9_-]+",
      description: "Test convention",
      examples: ["ff_login", "ff_checkout"],
    };

    const conventions = new Map([["test_convention", convention]]);
    const patterns = manager.generatePatternsFromNamingConventions(conventions, "typescript");

    assertEquals(patterns.length > 0, true);
    assertEquals(patterns.some((p) => p.namingConvention === "test_convention"), true);
  },
});

Deno.test({
  name: "PatternConfigurationManager - Create pattern template",
  fn() {
    const manager = new PatternConfigurationManager(TEST_DIR);

    const template = manager.createPatternTemplate("test-org", "Test Organization");

    assertEquals(template.organizationId, "test-org");
    assertEquals(template.organizationName, "Test Organization");
    assertExists(template.languages.typescript);
    assertEquals(template.version, "1.0.0");
  },
});

Deno.test({
  name: "PatternConfigurationManager - Save pattern config",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      const manager = new PatternConfigurationManager(TEST_DIR);
      const template = manager.createPatternTemplate("test-org", "Test Organization");

      const savePath = join(TEST_DIR, "test-patterns.json");
      await manager.savePatternConfig(template, savePath);

      // Verify file was created and is valid JSON
      const savedContent = await Deno.readTextFile(savePath);
      const parsed = JSON.parse(savedContent);
      assertEquals(parsed.organizationId, "test-org");
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Error handling for missing default config",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      const manager = new PatternConfigurationManager(TEST_DIR);

      await assertRejects(
        async () => await manager.loadPatterns(),
        Error,
        "Failed to load default pattern configuration",
      );
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - createPatternConfigManager factory",
  fn() {
    const manager = createPatternConfigManager(TEST_DIR);
    assertExists(manager);
    assertEquals(manager instanceof PatternConfigurationManager, true);
  },
});

Deno.test({
  name: "PatternConfigurationManager - Load loaded configs",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      await createDefaultPatternsFile();
      await createOptimizelyPatternsFile();

      const manager = new PatternConfigurationManager(TEST_DIR);
      await manager.loadPatterns();

      const loadedConfigs = manager.getLoadedConfigs();
      assertEquals(loadedConfigs.size > 0, true);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Pattern with invalid structure",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      // Create config with invalid structure (missing required fields)
      const invalidConfig = {
        version: "1.0.0",
        // Missing description, languages, metadata
      };

      await Deno.writeTextFile(
        join(CONFIG_DIR, "default-patterns.json"),
        JSON.stringify(invalidConfig, null, 2),
      );

      const manager = new PatternConfigurationManager(TEST_DIR);

      await assertRejects(
        async () => await manager.loadPatterns(),
        Error,
        "Failed to load default pattern configuration",
      );
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Empty naming convention examples",
  fn() {
    const manager = new PatternConfigurationManager(TEST_DIR);

    try {
      manager.createNamingConventionFromExamples([], "test");
      throw new Error("Expected method to throw");
    } catch (error) {
      assertEquals(error instanceof Error, true);
      assertEquals((error as Error).message, "At least one example is required");
    }
  },
});

Deno.test({
  name: "PatternConfigurationManager - Test invalid pattern regex",
  async fn() {
    await setupPatternTestEnvironment();
    try {
      const manager = new PatternConfigurationManager(TEST_DIR);

      const invalidPattern: PatternDefinition = {
        name: "invalid",
        pattern: "[invalid",
        description: "Invalid regex",
        confidence: 0.5,
      };

      const result = manager.testPattern(invalidPattern, "test text");
      assertEquals(result.success, false);
      assertExists(result.error);
    } finally {
      await cleanupPatternTestEnvironment();
    }
  },
});
