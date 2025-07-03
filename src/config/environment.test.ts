import {
  assertEnvApiAvailable,
  loadEnvironmentVariables,
} from "./environment.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.204.0/testing/asserts.ts";

Deno.test("loadEnvironmentVariables returns all variables when present", () => {
  const envVars = {
    OPTIMIZELY_API_TOKEN: "token",
    OPTIMIZELY_PROJECT_ID: "proj",
    GITHUB_TOKEN: "gh",
    ENVIRONMENT: "dev",
    OPERATION: "sync",
    DRY_RUN: "true",
  };
  for (const [k, v] of Object.entries(envVars)) {
    Deno.env.set(k, v);
  }
  const result = loadEnvironmentVariables();
  assertEquals(result, {
    OPTIMIZELY_API_TOKEN: "token",
    OPTIMIZELY_PROJECT_ID: "proj",
    GITHUB_TOKEN: "gh",
    ENVIRONMENT: "dev",
    OPERATION: "sync",
    DRY_RUN: true,
  });
});

Deno.test("loadEnvironmentVariables returns DRY_RUN as false when set to 'false'", () => {
  Deno.env.set("OPTIMIZELY_API_TOKEN", "token");
  Deno.env.set("OPTIMIZELY_PROJECT_ID", "proj");
  Deno.env.set("GITHUB_TOKEN", "gh");
  Deno.env.set("ENVIRONMENT", "dev");
  Deno.env.set("OPERATION", "sync");
  Deno.env.set("DRY_RUN", "false");
  const result = loadEnvironmentVariables();
  assertEquals(result.DRY_RUN, false);
});

Deno.test("loadEnvironmentVariables ignores extra environment variables", () => {
  Deno.env.set("OPTIMIZELY_API_TOKEN", "token");
  Deno.env.set("OPTIMIZELY_PROJECT_ID", "proj");
  Deno.env.set("GITHUB_TOKEN", "gh");
  Deno.env.set("ENVIRONMENT", "dev");
  Deno.env.set("OPERATION", "sync");
  Deno.env.set("DRY_RUN", "true");
  Deno.env.set("EXTRA_VAR", "should_be_ignored");
  const result = loadEnvironmentVariables();
  assertEquals(result.OPTIMIZELY_API_TOKEN, "token");
  assertEquals(result.ENVIRONMENT, "dev");
  assertEquals(result.DRY_RUN, true);
});

Deno.test("loadEnvironmentVariables throws if missing required variable", () => {
  Deno.env.delete("OPTIMIZELY_API_TOKEN");
  Deno.env.set("OPTIMIZELY_PROJECT_ID", "proj");
  Deno.env.set("GITHUB_TOKEN", "gh");
  Deno.env.set("ENVIRONMENT", "dev");
  Deno.env.set("OPERATION", "sync");
  Deno.env.set("DRY_RUN", "true");
  assertThrows(
    () => loadEnvironmentVariables(),
    Error,
    "Missing required environment variables: OPTIMIZELY_API_TOKEN",
  );
});

Deno.test("assertEnvApiAvailable does not throw in Deno", () => {
  assertEnvApiAvailable();
});
