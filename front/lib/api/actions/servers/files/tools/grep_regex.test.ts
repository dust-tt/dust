import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import {
  collectGrepMatches,
  compileGrepPattern,
  GREP_LINE_MAX_BYTES,
  GREP_PATTERN_MAX_CHARS,
  GREP_RESPONSE_CONTENT_BUDGET_BYTES,
} from "@app/lib/api/actions/servers/files/tools/grep_regex";
import { describe, expect, it } from "vitest";

describe("grep regex", () => {
  it("matches common expressions and inline case-insensitive expressions", () => {
    const regexResult = compileGrepPattern("(?i)^dust-[0-9]+$");
    expect(regexResult.isOk()).toBe(true);
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

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

  it("rejects an oversized line before receiving a newline", async () => {
    const regexResult = compileGrepPattern("dust");
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    const search = collectGrepMatches(
      Readable.from([Buffer.alloc(GREP_LINE_MAX_BYTES, "a"), Buffer.from("a")]),
      regexResult.value,
      {
        formatMatch: (line, lineNumber) => `${lineNumber}: ${line}`,
        maxMatches: 50,
      }
    );

    await expect(search).rejects.toThrow(
      `line 1: it exceeds ${GREP_LINE_MAX_BYTES} bytes`
    );
  });

  it("caps accumulated matches at the byte budget", async () => {
    const regexResult = compileGrepPattern("é");
    if (regexResult.isErr()) {
      throw regexResult.error;
    }

    const result = await collectGrepMatches(
      Readable.from([`${"é".repeat(GREP_RESPONSE_CONTENT_BUDGET_BYTES)}\n`]),
      regexResult.value,
      {
        formatMatch: (line, lineNumber) => `${lineNumber}: ${line}`,
        maxMatches: 50,
      }
    );

    const output = result.matches.join("\n");
    expect(result.capped).toBe(true);
    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(
      GREP_RESPONSE_CONTENT_BUDGET_BYTES
    );
    expect(output).not.toContain("�");
  });
});
