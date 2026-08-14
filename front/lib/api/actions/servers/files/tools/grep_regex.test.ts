import { performance } from "node:perf_hooks";
import {
  compileGrepPattern,
  GREP_LINE_MAX_CHARS,
  GREP_PATTERN_MAX_CHARS,
  validateGrepLine,
} from "@app/lib/api/actions/servers/files/tools/grep_regex";
import { describe, expect, it } from "vitest";

describe("grep regex", () => {
  it("matches common expressions and inline case-insensitive expressions", () => {
    const regexResult = compileGrepPattern("(?i)^dust-[0-9]+$");
    expect(regexResult.isOk()).toBe(true);
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    expect(validateGrepLine("DUST-42")).toBeNull();
    expect(regexResult.value.test("DUST-42")).toBe(true);
  });

  it("rejects unsupported and oversized patterns", () => {
    const unsupportedResult = compileGrepPattern("dust(?=ai)");
    expect(unsupportedResult.isErr()).toBe(true);
    if (unsupportedResult.isOk()) {
      throw new Error("Expected lookahead to be rejected.");
    }
    expect(unsupportedResult.error.message).toContain("unsupported syntax");

    const oversizedResult = compileGrepPattern(
      "a".repeat(GREP_PATTERN_MAX_CHARS + 1)
    );
    expect(oversizedResult.isErr()).toBe(true);
  });

  it("evaluates an adversarial expression in bounded time", () => {
    const regexResult = compileGrepPattern("(a+)+$");
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    const startedAtMs = performance.now();
    const matched = regexResult.value.test(`${"a".repeat(100_000)}!`);
    const durationMs = performance.now() - startedAtMs;

    expect(matched).toBe(false);
    expect(durationMs).toBeLessThan(1_000);
  });

  it("rejects lines above the strict matching bound", () => {
    const regexResult = compileGrepPattern("dust");
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    const lineError = validateGrepLine("a".repeat(GREP_LINE_MAX_CHARS + 1));
    expect(lineError?.message).toContain("longer than");
  });
});
