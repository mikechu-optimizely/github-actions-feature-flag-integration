import { AuditEvent, AuditEventType, AuditReporter } from "./audit-reporter.ts";
import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";

function createEvent(
  type: AuditEventType,
  message = "msg",
  details?: Record<string, unknown>,
): AuditEvent {
  return {
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
  };
}

Deno.test("AuditReporter logs events in memory and to console", () => {
  const reporter = new AuditReporter("reports/test-audit.log");
  const event = createEvent("flag_created", "Flag created", { key: "flag1" });
  reporter.log(event);
  assertEquals(reporter.getSummary().total, 1);
  assertEquals(
    (reporter.getSummary().byType as Record<string, number>)["flag_created"],
    1,
  );
});

Deno.test("AuditReporter flush writes events to file and clears memory", async () => {
  const reporter = new AuditReporter("reports/test-audit.log");
  const event = createEvent("flag_archived", "Flag archived", { key: "flag2" });
  reporter.log(event);
  await reporter.flush();
  // File should exist and contain the event
  const content = await Deno.readTextFile("reports/test-audit.log");
  assert(content.includes("flag_archived"));
  // Memory should be cleared
  assertEquals(reporter.getSummary().total, 0);
  // Clean up
  await Deno.remove("reports/test-audit.log");
});

Deno.test("AuditReporter generateSummaryReport writes summary JSON", async () => {
  const reporter = new AuditReporter("reports/test-audit.log");
  reporter.log(createEvent("flag_in_use", "Flag in use", { key: "flag3" }));
  reporter.log(createEvent("flag_unused", "Flag unused", { key: "flag4" }));
  await reporter.generateSummaryReport("reports/test-summary.json");
  const summary = JSON.parse(
    await Deno.readTextFile("reports/test-summary.json"),
  );
  assertEquals(summary.total, 2);
  assertEquals(summary.byType.flag_in_use, 1);
  assertEquals(summary.byType.flag_unused, 1);
  // Clean up
  await Deno.remove("reports/test-summary.json");
});

Deno.test("AuditReporter #ensureLogDir creates directory if missing", async () => {
  const reporter = new AuditReporter("reports/subdir/test.log");
  reporter.log(createEvent("info", "Info event"));
  await reporter.flush();
  const content = await Deno.readTextFile("reports/subdir/test.log");
  assertMatch(content, /Info event/);
  // Clean up
  await Deno.remove("reports/subdir/test.log");
  await Deno.remove("reports/subdir");
});
