import { dirname, join } from "@std/path";
import { exists } from "@std/fs";

/**
 * Enhanced pattern definition with metadata.
 */
export interface PatternDefinition {
  name: string;
  pattern: string;
  description: string;
  confidence: number;
  enabled?: boolean;
  tags?: string[];
  namingConvention?: string; // Reference to naming convention used
}

/**
 * Custom naming convention definition.
 */
export interface NamingConvention {
  name: string;
  prefix?: string;
  suffix?: string;
  pattern: string;
  description: string;
  examples: string[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    allowedCharacters?: string;
    forbiddenPatterns?: string[];
  };
}

/**
 * Enhanced language configuration with extended metadata.
 */
export interface EnhancedLanguageConfig {
  name: string;
  patterns: PatternDefinition[];
  excludePatterns?: PatternDefinition[];
  fileExtensions: string[];
  commentPatterns: {
    singleLine: string;
    singleLineAlt?: string;
    blockStart: string;
    blockEnd: string;
    blockStartAlt?: string;
    blockEndAlt?: string;
  };
  customSettings?: {
    [key: string]: unknown;
  };
}

/**
 * Enhanced language patterns with extended functionality.
 */
export interface EnhancedLanguagePatterns {
  [language: string]: EnhancedLanguageConfig;
}

/**
 * Pattern configuration file structure.
 */
export interface PatternConfigFile {
  version: string;
  description: string;
  organizationId?: string;
  organizationName?: string;
  extends?: string[];
  customNamingConventions?: {
    [key: string]: string;
  };
  languages: EnhancedLanguagePatterns;
  defaultPatterns?: {
    genericPatterns: PatternDefinition[];
  };
  validationRules?: {
    minFlagLength?: number;
    maxFlagLength?: number;
    allowedCharacters?: string;
    requiredPrefixes?: string[];
    forbiddenPatterns?: string[];
  };
  contextualRules?: {
    highConfidenceFiles?: string[];
    lowConfidenceFiles?: string[];
  };
  metadata: {
    createdBy: string;
    createdAt: string;
    version: string;
    lastUpdated?: string;
    updatedBy?: string;
  };
}

/**
 * Pattern loading options.
 */
export interface PatternLoadOptions {
  configPath?: string;
  organizationConfigPath?: string;
  enableCustomPatterns?: boolean;
  validatePatterns?: boolean;
  mergeStrategy?: "replace" | "merge" | "extend";
}

/**
 * Pattern validation result.
 */
export interface PatternValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  patterns: {
    total: number;
    valid: number;
    invalid: number;
  };
}

/**
 * Pattern configuration manager for loading, merging, and validating language-specific patterns.
 */
export class PatternConfigurationManager {
  private loadedConfigs: Map<string, PatternConfigFile> = new Map();
  private cachedPatterns: EnhancedLanguagePatterns | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTimeout = 300000; // 5 minutes

  constructor(private workspaceRoot: string) {}

  /**
   * Load pattern configuration from files.
   * @param options Pattern loading options
   * @returns Enhanced language patterns
   */
  async loadPatterns(options: PatternLoadOptions = {}): Promise<EnhancedLanguagePatterns> {
    // Check cache validity
    if (this.cachedPatterns && (Date.now() - this.cacheTimestamp) < this.cacheTimeout) {
      return this.cachedPatterns;
    }

    // Load default patterns from config directory
    const defaultConfigPath = options.configPath ||
      join(this.workspaceRoot, "config", "patterns", "default-patterns.json");
    const defaultConfig = await this.loadConfigFile(defaultConfigPath);
    if (!defaultConfig) {
      throw new Error(`Failed to load default pattern configuration from ${defaultConfigPath}`);
    }

    let mergedPatterns = { ...defaultConfig.languages };

    // Load patterns from .github/optimizely/ directory if available
    const optimizelyPatternsDir = join(this.workspaceRoot, ".github", "optimizely");
    const optimizelyPatterns = await this.loadOptimizelyPatterns(optimizelyPatternsDir);

    if (optimizelyPatterns && Object.keys(optimizelyPatterns).length > 0) {
      console.log(`Loading Optimizely patterns from ${optimizelyPatternsDir}`);
      mergedPatterns = this.mergeLanguagePatterns(mergedPatterns, optimizelyPatterns);
    } else {
      console.log("No Optimizely patterns found, using default patterns only");
    }

    // Validate patterns if requested
    if (options.validatePatterns) {
      const validationResult = this.validatePatterns(mergedPatterns);
      if (!validationResult.isValid) {
        console.warn(`Pattern validation found issues: ${validationResult.errors.join(", ")}`);
      }
    }

    // Cache results
    this.cachedPatterns = mergedPatterns;
    this.cacheTimestamp = Date.now();

    return mergedPatterns;
  }

  /**
   * Load a specific pattern configuration file.
   * @param configPath Path to the configuration file
   * @returns Pattern configuration or null if failed
   */
  private async loadConfigFile(configPath: string): Promise<PatternConfigFile | null> {
    try {
      if (!await exists(configPath)) {
        console.warn(`Pattern configuration file not found: ${configPath}`);
        return null;
      }

      const content = await Deno.readTextFile(configPath);
      const config: PatternConfigFile = JSON.parse(content);

      // Validate config structure
      if (!this.isValidConfigStructure(config)) {
        console.error(`Invalid configuration structure in ${configPath}`);
        return null;
      }

      this.loadedConfigs.set(configPath, config);
      return config;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to load pattern configuration from ${configPath}: ${message}`);
      return null;
    }
  }

  /**
   * Load Optimizely patterns from .github/optimizely/ directory.
   * @param optimizelyDir Path to .github/optimizely directory
   * @returns Enhanced language patterns or null
   */
  private async loadOptimizelyPatterns(
    optimizelyDir: string,
  ): Promise<EnhancedLanguagePatterns | null> {
    try {
      if (!await exists(optimizelyDir)) {
        return null;
      }

      const optimizelyPatterns: EnhancedLanguagePatterns = {};
      let filesLoaded = 0;

      for await (const entry of Deno.readDir(optimizelyDir)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const filePath = join(optimizelyDir, entry.name);
          const config = await this.loadConfigFile(filePath);
          if (config && config.languages) {
            console.log(`Loaded Optimizely pattern file: ${entry.name}`);

            // Merge language patterns from this file
            for (const [language, languageConfig] of Object.entries(config.languages)) {
              if (optimizelyPatterns[language]) {
                // Extend existing language patterns
                optimizelyPatterns[language] = {
                  ...optimizelyPatterns[language],
                  patterns: [
                    ...optimizelyPatterns[language].patterns,
                    ...languageConfig.patterns,
                  ],
                  excludePatterns: [
                    ...(optimizelyPatterns[language].excludePatterns || []),
                    ...(languageConfig.excludePatterns || []),
                  ],
                };
              } else {
                // Add new language
                optimizelyPatterns[language] = languageConfig;
              }
            }

            filesLoaded++;
          }
        }
      }

      console.log(
        `Loaded ${filesLoaded} Optimizely pattern files with ${
          Object.keys(optimizelyPatterns).length
        } languages`,
      );
      return Object.keys(optimizelyPatterns).length > 0 ? optimizelyPatterns : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load Optimizely patterns from ${optimizelyDir}: ${message}`);
      return null;
    }
  }

  /**
   * Load custom patterns from user-defined files.
   * @returns Custom language patterns or null
   */
  private async loadCustomPatterns(): Promise<EnhancedLanguagePatterns | null> {
    const customPatternDir = join(this.workspaceRoot, "config", "patterns", "custom");

    try {
      if (!await exists(customPatternDir)) {
        return null;
      }

      const customPatterns: EnhancedLanguagePatterns = {};

      for await (const entry of Deno.readDir(customPatternDir)) {
        if (entry.isFile && entry.name.endsWith(".json")) {
          const customConfig = await this.loadConfigFile(join(customPatternDir, entry.name));
          if (customConfig) {
            Object.assign(customPatterns, customConfig.languages);
          }
        }
      }

      return Object.keys(customPatterns).length > 0 ? customPatterns : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load custom patterns: ${message}`);
      return null;
    }
  }

  /**
   * Merge two pattern configurations.
   * @param baseConfig Base configuration
   * @param overrideConfig Override configuration
   * @param strategy Merge strategy
   * @returns Merged language patterns
   */
  private mergePatternConfigurations(
    baseConfig: PatternConfigFile,
    overrideConfig: PatternConfigFile,
    strategy: "replace" | "merge" | "extend",
  ): EnhancedLanguagePatterns {
    const baseLanguages = { ...baseConfig.languages };
    const overrideLanguages = overrideConfig.languages;

    switch (strategy) {
      case "replace":
        return overrideLanguages;

      case "merge":
        return this.mergeLanguagePatterns(baseLanguages, overrideLanguages);

      case "extend":
      default:
        return this.extendLanguagePatterns(baseLanguages, overrideLanguages);
    }
  }

  /**
   * Merge language patterns by replacing existing languages completely.
   * @param base Base language patterns
   * @param override Override language patterns
   * @returns Merged language patterns
   */
  private mergeLanguagePatterns(
    base: EnhancedLanguagePatterns,
    override: EnhancedLanguagePatterns,
  ): EnhancedLanguagePatterns {
    const merged = { ...base };

    for (const [language, config] of Object.entries(override)) {
      merged[language] = config;
    }

    return merged;
  }

  /**
   * Extend language patterns by merging patterns within each language.
   * @param base Base language patterns
   * @param override Override language patterns
   * @returns Extended language patterns
   */
  private extendLanguagePatterns(
    base: EnhancedLanguagePatterns,
    override: EnhancedLanguagePatterns,
  ): EnhancedLanguagePatterns {
    const extended = { ...base };

    for (const [language, overrideConfig] of Object.entries(override)) {
      if (extended[language]) {
        // Merge patterns for existing language
        extended[language] = {
          ...extended[language],
          name: overrideConfig.name || extended[language].name,
          patterns: [
            ...extended[language].patterns,
            ...overrideConfig.patterns,
          ],
          excludePatterns: [
            ...(extended[language].excludePatterns || []),
            ...(overrideConfig.excludePatterns || []),
          ],
          fileExtensions: [
            ...new Set([
              ...extended[language].fileExtensions,
              ...overrideConfig.fileExtensions,
            ]),
          ],
          commentPatterns: {
            ...extended[language].commentPatterns,
            ...overrideConfig.commentPatterns,
          },
          customSettings: {
            ...extended[language].customSettings,
            ...overrideConfig.customSettings,
          },
        };
      } else {
        // Add new language
        extended[language] = overrideConfig;
      }
    }

    return extended;
  }

  /**
   * Validate pattern configuration structure.
   * @param config Configuration to validate
   * @returns True if valid structure
   */
  private isValidConfigStructure(config: unknown): config is PatternConfigFile {
    if (!config || typeof config !== "object") return false;

    const c = config as Record<string, unknown>;

    return (
      typeof c.version === "string" &&
      typeof c.description === "string" &&
      typeof c.languages === "object" &&
      c.languages !== null &&
      typeof c.metadata === "object" &&
      c.metadata !== null
    );
  }

  /**
   * Validate patterns for syntax and completeness.
   * @param patterns Language patterns to validate
   * @returns Validation result
   */
  validatePatterns(patterns: EnhancedLanguagePatterns): PatternValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalPatterns = 0;
    let validPatterns = 0;
    let invalidPatterns = 0;

    for (const [language, config] of Object.entries(patterns)) {
      // Validate language configuration
      if (!config.name || !config.patterns || !config.fileExtensions) {
        errors.push(`Language ${language} missing required fields`);
        continue;
      }

      // Validate patterns
      for (const pattern of config.patterns) {
        totalPatterns++;

        if (!pattern.name || !pattern.pattern || typeof pattern.confidence !== "number") {
          errors.push(`Pattern in ${language} missing required fields`);
          invalidPatterns++;
          continue;
        }

        // Validate regex pattern
        try {
          new RegExp(pattern.pattern);
          validPatterns++;
        } catch {
          errors.push(`Invalid regex pattern in ${language}: ${pattern.pattern}`);
          invalidPatterns++;
        }

        // Validate confidence range
        if (pattern.confidence < 0 || pattern.confidence > 1) {
          warnings.push(`Confidence out of range for pattern ${pattern.name} in ${language}`);
        }
      }

      // Validate file extensions
      if (config.fileExtensions.length === 0) {
        warnings.push(`Language ${language} has no file extensions defined`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      patterns: {
        total: totalPatterns,
        valid: validPatterns,
        invalid: invalidPatterns,
      },
    };
  }

  /**
   * Get pattern configuration for a specific language.
   * @param language Language identifier
   * @param patterns Language patterns
   * @returns Language configuration or null
   */
  getLanguageConfig(
    language: string,
    patterns: EnhancedLanguagePatterns,
  ): EnhancedLanguageConfig | null {
    return patterns[language] || null;
  }

  /**
   * Get all file extensions supported by current patterns.
   * @param patterns Language patterns
   * @returns Array of file extensions
   */
  getSupportedExtensions(patterns: EnhancedLanguagePatterns): string[] {
    const extensions = new Set<string>();

    for (const config of Object.values(patterns)) {
      config.fileExtensions.forEach((ext) => extensions.add(ext));
    }

    return Array.from(extensions);
  }

  /**
   * Test a pattern against a sample text.
   * @param pattern Pattern definition
   * @param sampleText Text to test against
   * @returns Test result with matches
   */
  testPattern(pattern: PatternDefinition, sampleText: string): {
    matches: RegExpMatchArray[];
    success: boolean;
    error?: string;
  } {
    try {
      const regex = new RegExp(pattern.pattern, "gi");
      const matches: RegExpMatchArray[] = [];
      let match;

      while ((match = regex.exec(sampleText)) !== null) {
        matches.push(match);
        // Prevent infinite loop on zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }

      return { matches, success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { matches: [], success: false, error: message };
    }
  }

  /**
   * Create a new pattern configuration file template.
   * @param organizationId Organization identifier
   * @param organizationName Organization name
   * @returns Pattern configuration template
   */
  createPatternTemplate(organizationId: string, organizationName: string): PatternConfigFile {
    const now = new Date().toISOString();

    return {
      version: "1.0.0",
      description: `Custom patterns for ${organizationName}`,
      organizationId,
      organizationName,
      extends: ["default-patterns.json"],
      customNamingConventions: {
        flagPrefix: "ff_",
        featurePrefix: "feature_",
        experimentPrefix: "exp_",
      },
      languages: {
        typescript: {
          name: `TypeScript (${organizationName})`,
          patterns: [
            {
              name: "custom_flag_method",
              pattern: "CustomFlags\\.isEnabled\\s*\\(['\"]([^'\"]+)['\"]\\)",
              description: "Custom flag method calls",
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
        createdBy: "pattern-config-manager",
        createdAt: now,
        version: "1.0.0",
      },
    };
  }

  /**
   * Save pattern configuration to file.
   * @param config Pattern configuration
   * @param filePath File path to save to
   */
  async savePatternConfig(config: PatternConfigFile, filePath: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      await Deno.mkdir(dir, { recursive: true });

      // Save configuration
      const content = JSON.stringify(config, null, 2);
      await Deno.writeTextFile(filePath, content);

      console.log(`Pattern configuration saved to ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save pattern configuration: ${message}`);
    }
  }

  /**
   * Clear pattern cache.
   */
  clearCache(): void {
    this.cachedPatterns = null;
    this.cacheTimestamp = 0;
    this.loadedConfigs.clear();
  }

  /**
   * Get loaded configuration files.
   * @returns Map of loaded configurations
   */
  getLoadedConfigs(): Map<string, PatternConfigFile> {
    return new Map(this.loadedConfigs);
  }

  /**
   * Generate patterns based on custom naming conventions.
   * @param namingConventions Map of naming convention name to convention definition
   * @param language Target language for pattern generation
   * @returns Array of generated patterns
   */
  generatePatternsFromNamingConventions(
    namingConventions: Map<string, NamingConvention>,
    language: string,
  ): PatternDefinition[] {
    const generatedPatterns: PatternDefinition[] = [];

    for (const [conventionName, convention] of namingConventions) {
      // Generate basic string literal pattern
      const stringPattern = this.createStringLiteralPattern(convention, language);
      if (stringPattern) {
        generatedPatterns.push({
          name: `${conventionName}_string_literal`,
          pattern: stringPattern,
          description: `String literals matching ${convention.name} convention`,
          confidence: 0.7,
          namingConvention: conventionName,
          tags: ["naming-convention", "generated"],
        });
      }

      // Generate function call patterns
      const functionPatterns = this.createFunctionCallPatterns(convention, language);
      generatedPatterns.push(...functionPatterns);

      // Generate variable assignment patterns
      const assignmentPatterns = this.createAssignmentPatterns(convention, language);
      generatedPatterns.push(...assignmentPatterns);
    }

    return generatedPatterns;
  }

  /**
   * Create string literal pattern for a naming convention.
   * @param convention Naming convention
   * @param language Target language
   * @returns Generated pattern string or null
   */
  private createStringLiteralPattern(
    convention: NamingConvention,
    language: string,
  ): string | null {
    try {
      // Start with the base pattern from the convention
      let pattern = convention.pattern;

      // If convention has specific prefix/suffix, incorporate them
      if (convention.prefix) {
        pattern = `${this.escapeRegex(convention.prefix)}${pattern.replace(/^\^?/, "")}`;
      }

      if (convention.suffix) {
        pattern = `${pattern.replace(/\$?$/, "")}${this.escapeRegex(convention.suffix)}`;
      }

      // Wrap in string literal quotes based on language
      const quotePattern = this.getQuotePattern(language);
      return `${quotePattern}(${pattern})${quotePattern},?`;
    } catch {
      return null;
    }
  }

  /**
   * Create function call patterns for a naming convention.
   * @param convention Naming convention
   * @param language Target language
   * @returns Array of generated patterns
   */
  private createFunctionCallPatterns(
    convention: NamingConvention,
    language: string,
  ): PatternDefinition[] {
    const patterns: PatternDefinition[] = [];
    const quotePattern = this.getQuotePattern(language);
    const basePattern = convention.pattern;

    // Common flag function names by language
    const functionNames = this.getFlagFunctionNames(language);

    for (const funcName of functionNames) {
      patterns.push({
        name: `${convention.name}_${funcName.toLowerCase()}_call`,
        pattern: `${funcName}\\s*\\(${quotePattern}(${basePattern})${quotePattern}\\)`,
        description: `${funcName}() calls with ${convention.name} naming convention`,
        confidence: 0.9,
        namingConvention: convention.name,
        tags: ["function-call", "naming-convention", "generated"],
      });
    }

    return patterns;
  }

  /**
   * Create variable assignment patterns for a naming convention.
   * @param convention Naming convention
   * @param language Target language
   * @returns Array of generated patterns
   */
  private createAssignmentPatterns(
    convention: NamingConvention,
    language: string,
  ): PatternDefinition[] {
    const patterns: PatternDefinition[] = [];
    const quotePattern = this.getQuotePattern(language);
    const basePattern = convention.pattern;
    const assignmentOp = this.getAssignmentOperator(language);

    // Variable assignment pattern
    patterns.push({
      name: `${convention.name}_assignment`,
      pattern:
        `(flag|feature|experiment)\\s*${assignmentOp}\\s*${quotePattern}(${basePattern})${quotePattern},?`,
      description: `Variable assignments with ${convention.name} naming convention`,
      confidence: 0.6,
      namingConvention: convention.name,
      tags: ["assignment", "naming-convention", "generated"],
    });

    return patterns;
  }

  /**
   * Get quote pattern for string literals in a language.
   * @param language Programming language
   * @returns Quote pattern regex
   */
  private getQuotePattern(language: string): string {
    switch (language.toLowerCase()) {
      case "python":
        return "['\"]"; // Python allows both single and double quotes
      case "javascript":
      case "typescript":
      case "php":
        return "['\"]"; // Allow both quote types
      default:
        return "['\"]"; // Default to both
    }
  }

  /**
   * Get common flag function names for a language.
   * @param language Programming language
   * @returns Array of function names
   */
  private getFlagFunctionNames(language: string): string[] {
    switch (language.toLowerCase()) {
      case "javascript":
      case "typescript":
        return ["isEnabled", "getFlag", "getFeatureFlag", "isFeatureEnabled"];
      case "python":
        return ["is_enabled", "get_flag", "get_feature_flag", "is_feature_enabled"];
      case "java":
      case "csharp":
        return ["isEnabled", "getFlag", "getFeatureFlag", "IsEnabled", "GetFlag"];
      case "go":
        return ["IsEnabled", "GetFlag", "GetFeatureFlag", "IsFeatureEnabled"];
      case "php":
        return ["isEnabled", "getFlag", "getFeatureFlag", "isFeatureEnabled"];
      default:
        return ["isEnabled", "getFlag"];
    }
  }

  /**
   * Get assignment operator pattern for a language.
   * @param language Programming language
   * @returns Assignment operator regex
   */
  private getAssignmentOperator(language: string): string {
    switch (language.toLowerCase()) {
      case "go":
        return "[:=]?="; // Go supports both = and :=
      case "javascript":
      case "typescript":
        return "[=:]"; // Support both assignment and object property
      default:
        return "="; // Standard assignment
    }
  }

  /**
   * Escape special regex characters.
   * @param str String to escape
   * @returns Escaped string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Create naming convention from examples.
   * @param examples Array of example flag names
   * @param conventionName Name for the convention
   * @returns Generated naming convention
   */
  createNamingConventionFromExamples(examples: string[], conventionName: string): NamingConvention {
    if (examples.length === 0) {
      throw new Error("At least one example is required");
    }

    // Analyze examples to find common patterns
    const analysis = this.analyzeExamples(examples);

    return {
      name: conventionName,
      prefix: analysis.commonPrefix,
      suffix: analysis.commonSuffix,
      pattern: analysis.pattern,
      description: `Generated from ${examples.length} examples`,
      examples: examples.slice(0, 10), // Keep first 10 examples
      validation: {
        minLength: Math.min(...examples.map((e) => e.length)),
        maxLength: Math.max(...examples.map((e) => e.length)),
        allowedCharacters: analysis.allowedCharacters,
      },
    };
  }

  /**
   * Analyze examples to extract common patterns.
   * @param examples Array of example strings
   * @returns Analysis result
   */
  private analyzeExamples(examples: string[]): {
    commonPrefix: string;
    commonSuffix: string;
    pattern: string;
    allowedCharacters: string;
  } {
    // Find common prefix
    let commonPrefix = "";
    if (examples.length > 1) {
      const firstExample = examples[0];
      for (let i = 0; i < firstExample.length; i++) {
        const char = firstExample[i];
        if (examples.every((ex) => ex[i] === char)) {
          commonPrefix += char;
        } else {
          break;
        }
      }
    }

    // Find common suffix
    let commonSuffix = "";
    if (examples.length > 1 && commonPrefix !== examples[0]) {
      const firstExample = examples[0];
      for (let i = firstExample.length - 1; i >= commonPrefix.length; i--) {
        const char = firstExample[i];
        if (examples.every((ex) => ex[ex.length - (firstExample.length - i)] === char)) {
          commonSuffix = char + commonSuffix;
        } else {
          break;
        }
      }
    }

    // Generate character set from all examples
    const allChars = new Set(examples.join(""));
    const sortedChars = Array.from(allChars).sort();

    // Create character class pattern
    let allowedCharacters = "^[";
    for (const char of sortedChars) {
      if (/[a-zA-Z0-9]/.test(char)) {
        allowedCharacters += char;
      } else {
        allowedCharacters += "\\" + char;
      }
    }
    allowedCharacters += "]+$";

    // Generate flexible pattern
    let pattern = "";
    if (commonPrefix) {
      pattern += this.escapeRegex(commonPrefix);
    }
    pattern += "[a-zA-Z0-9_-]+";
    if (commonSuffix) {
      pattern += this.escapeRegex(commonSuffix);
    }

    return {
      commonPrefix,
      commonSuffix,
      pattern,
      allowedCharacters,
    };
  }
}

/**
 * Create a pattern configuration manager instance.
 * @param workspaceRoot Workspace root directory
 * @returns Pattern configuration manager instance
 */
export function createPatternConfigManager(workspaceRoot: string): PatternConfigurationManager {
  return new PatternConfigurationManager(workspaceRoot);
}
