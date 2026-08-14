import { performance } from "node:perf_hooks";
import {
  compileGrepPattern,
  GREP_LINE_MAX_CHARS,
  GREP_PATTERN_MAX_CHARS,
  testGrepLine,
} from "@app/lib/api/actions/servers/files/tools/grep_regex";
import { describe, expect, it } from "vitest";

describe("grep regex", () => {
  it("matches common expressions and inline case-insensitive expressions", () => {
    const regexResult = compileGrepPattern("(?i)^dust-[0-9]+$");
    expect(regexResult.isOk()).toBe(true);
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    const matchResult = testGrepLine({
      regex: regexResult.value,
      line: "DUST-42",
    });
    expect(matchResult.isOk()).toBe(true);
    if (matchResult.isErr()) {
      throw matchResult.error;
    }
    expect(matchResult.value).toBe(true);
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
    const matchResult = testGrepLine({
      regex: regexResult.value,
      line: `${"a".repeat(100_000)}!`,
    });
    const durationMs = performance.now() - startedAtMs;

    expect(matchResult.isOk()).toBe(true);
    expect(durationMs).toBeLessThan(1_000);
  });

  it("rejects lines above the strict matching bound", () => {
    const regexResult = compileGrepPattern("dust");
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    const matchResult = testGrepLine({
      regex: regexResult.value,
      line: "a".repeat(GREP_LINE_MAX_CHARS + 1),
    });

    expect(matchResult.isErr()).toBe(true);
    if (matchResult.isOk()) {
      throw new Error("Expected the oversized line to be rejected.");
    }
    expect(matchResult.error.message).toContain("longer than");
  });
});
