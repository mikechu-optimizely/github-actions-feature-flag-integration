/**
 * Unit tests for validation utilities.
 */
import { assertThrows } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { validateApiPath } from "./validation.ts";

Deno.test("validateApiPath: accepts valid path", () => {
  validateApiPath("/flags");
  validateApiPath("/api/v2/feature");
});

Deno.test("validateApiPath: throws on empty string", () => {
  assertThrows(
    () => validateApiPath(""),
    Error,
    "API path must be a non-empty string starting with '/' character.",
  );
});

Deno.test("validateApiPath: throws if not starting with slash", () => {
  assertThrows(
    () => validateApiPath("flags"),
    Error,
    "API path must be a non-empty string starting with '/' character.",
  );
});

Deno.test("validateApiPath: throws if not a string", () => {
  // @ts-expect-error: Testing non-string input (undefined)
  assertThrows(() => validateApiPath(undefined), Error);
  // @ts-expect-error: Testing non-string input (number)
  assertThrows(() => validateApiPath(123), Error);
});
