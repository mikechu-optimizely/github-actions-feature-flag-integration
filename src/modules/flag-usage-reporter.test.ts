import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { FlagUsageReporter } from "./flag-usage-reporter.ts";
import { FlagUsage } from "./code-analysis.ts";

Deno.test("FlagUsageReporter generates comprehensive usage report", () => {
  const reporter = new FlagUsageReporter();
  const flagKeys = ["flag_a", "flag_b", "flag_c", "flag_d"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [
      { file: "src/main.ts", line: 10, context: "isEnabled('flag_a')" },
      { file: "src/utils.ts", line: 5, context: "const f = 'flag_a'" },
    ]],
    ["flag_b", [
      { file: "src/main.ts", line: 15, context: "isEnabled('flag_b')" },
    ]],
    ["flag_c", []],
    ["flag_d", []],
  ]);

  const report = reporter.generateUsageReport(flagKeys, flagUsages);

  assertEquals(report.totalFlags, 4);
  assertEquals(report.usedFlags, 2);
  assertEquals(report.unusedFlags, 2);
  assertEquals(report.unusedFlagKeys, ["flag_c", "flag_d"]);
  assertEquals(report.summary.usageRate, 50);

  // Check most used flags
  assertEquals(report.summary.mostUsedFlags[0].flag, "flag_a");
  assertEquals(report.summary.mostUsedFlags[0].count, 2);
  assertEquals(report.summary.mostUsedFlags[1].flag, "flag_b");
  assertEquals(report.summary.mostUsedFlags[1].count, 1);

  // Check flags by file
  assertEquals(report.summary.flagsByFile.get("src/main.ts"), [
    "flag_a",
    "flag_b",
  ]);
  assertEquals(report.summary.flagsByFile.get("src/utils.ts"), ["flag_a"]);

  assertExists(report.timestamp);
});

Deno.test("FlagUsageReporter generates delta report", () => {
  const reporter = new FlagUsageReporter();

  const currentUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [
      { file: "src/main.ts", line: 10, context: "isEnabled('flag_a')" },
      { file: "src/new.ts", line: 5, context: "const f = 'flag_a'" },
    ]],
    ["flag_b", [
      { file: "src/main.ts", line: 15, context: "isEnabled('flag_b')" },
    ]],
    ["flag_new", [
      { file: "src/feature.ts", line: 3, context: "isEnabled('flag_new')" },
    ]],
  ]);

  const previousUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [
      { file: "src/main.ts", line: 10, context: "isEnabled('flag_a')" },
    ]],
    ["flag_b", [
      { file: "src/main.ts", line: 15, context: "isEnabled('flag_b')" },
    ]],
    ["flag_old", [
      { file: "src/old.ts", line: 8, context: "isEnabled('flag_old')" },
    ]],
  ]);

  const report = reporter.generateDeltaReport(currentUsages, previousUsages);

  assertEquals(report.newFlags, ["flag_new"]);
  assertEquals(report.removedFlags, ["flag_old"]);

  // Check changed usages for flag_a
  const flagAChanges = report.changedUsages.get("flag_a")!;
  assertEquals(flagAChanges.added.length, 1);
  assertEquals(flagAChanges.added[0].file, "src/new.ts");
  assertEquals(flagAChanges.removed.length, 0);

  assertExists(report.timestamp);
});

Deno.test("FlagUsageReporter exports to JSON", () => {
  const reporter = new FlagUsageReporter();
  const flagKeys = ["flag_a"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [{
      file: "src/main.ts",
      line: 10,
      context: "isEnabled('flag_a')",
    }]],
  ]);

  const report = reporter.generateUsageReport(flagKeys, flagUsages);
  const json = reporter.exportToJson(report);

  const parsed = JSON.parse(json);
  assertEquals(parsed.totalFlags, 1);
  assertEquals(parsed.usedFlags, 1);
  assertEquals(parsed.flagUsages.flag_a.length, 1);
});

Deno.test("FlagUsageReporter exports to CSV", () => {
  const reporter = new FlagUsageReporter();
  const flagKeys = ["flag_a", "flag_b"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [{
      file: "src/main.ts",
      line: 10,
      context: "isEnabled('flag_a')",
    }]],
    ["flag_b", []],
  ]);

  const report = reporter.generateUsageReport(flagKeys, flagUsages);
  const csv = reporter.exportToCsv(report);

  const lines = csv.split("\n");
  assertEquals(lines[0], "Flag,File,Line,Context,Status");
  assertEquals(
    lines[1],
    'flag_a,"src/main.ts",10,"isEnabled(\'flag_a\')","USED"',
  );
  assertEquals(lines[2], 'flag_b,,,,"UNUSED"');
});

Deno.test("FlagUsageReporter generates summary", () => {
  const reporter = new FlagUsageReporter();
  const flagKeys = ["flag_a", "flag_b"];
  const flagUsages = new Map<string, FlagUsage[]>([
    ["flag_a", [{
      file: "src/main.ts",
      line: 10,
      context: "isEnabled('flag_a')",
    }]],
    ["flag_b", []],
  ]);

  const report = reporter.generateUsageReport(flagKeys, flagUsages);
  const summary = reporter.generateSummary(report);

  assertEquals(summary.includes("# Feature Flag Usage Report"), true);
  assertEquals(summary.includes("Total flags: 2"), true);
  assertEquals(summary.includes("Used flags: 1"), true);
  assertEquals(summary.includes("Unused flags: 1"), true);
  assertEquals(summary.includes("Usage rate: 50.0%"), true);
  assertEquals(summary.includes("flag_b"), true);
});
