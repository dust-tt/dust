import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import { GREP_MATCHES_MAX } from "@app/lib/api/actions/servers/files/metadata";
import {
  collectGrepMatches,
  formatGrepFooter,
} from "@app/lib/api/actions/servers/files/tools/grep_match";
import { describe, expect, it } from "vitest";

async function* linesOf(lines: string[]): AsyncIterable<string> {
  for (const line of lines) {
    yield line;
  }
}

const OPTS = {
  maxMatches: GREP_MATCHES_MAX,
  maxBytes: FILE_OFFLOAD_TEXT_SIZE_BYTES,
};

describe("collectGrepMatches", () => {
  it("returns no matches for empty input", async () => {
    const r = await collectGrepMatches({
      lines: linesOf([]),
      regex: /anything/,
      ...OPTS,
    });

    expect(r.matches).toEqual([]);
    expect(r.matchCapped).toBe(false);
    expect(r.byteCapped).toBe(false);
  });

  it("returns no matches when nothing matches the pattern", async () => {
    const r = await collectGrepMatches({
      lines: linesOf(["alpha", "beta", "gamma"]),
      regex: /zeta/,
      ...OPTS,
    });

    expect(r.matches).toEqual([]);
    expect(r.matchCapped).toBe(false);
    expect(r.byteCapped).toBe(false);
  });

  it("returns matching lines with 1-based line numbers and no caps", async () => {
    const r = await collectGrepMatches({
      lines: linesOf(["alpha", "beta", "alpha again"]),
      regex: /alpha/,
      ...OPTS,
    });

    expect(r.matches).toEqual(["1: alpha", "3: alpha again"]);
    expect(r.matchCapped).toBe(false);
    expect(r.byteCapped).toBe(false);
  });

  it("caps the number of matches at maxMatches", async () => {
    const lines = Array.from({ length: GREP_MATCHES_MAX + 10 }, () => "hit");

    const r = await collectGrepMatches({
      lines: linesOf(lines),
      regex: /hit/,
      ...OPTS,
    });

    expect(r.matches).toHaveLength(GREP_MATCHES_MAX);
    expect(r.matchCapped).toBe(true);
    expect(r.byteCapped).toBe(false);
  });

  it("truncates a single oversized matching line to the byte budget", async () => {
    // ~80 KB single line — well over the 20 KB budget. This is the case that would otherwise dump a
    // huge one-line file into the model context.
    const hugeLine = "x".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES * 4);

    const r = await collectGrepMatches({
      lines: linesOf([hugeLine]),
      regex: /x/,
      ...OPTS,
    });

    expect(r.byteCapped).toBe(true);
    expect(r.matches).toHaveLength(1);
    expect(Buffer.byteLength(r.matches[0], "utf8")).toBeLessThanOrEqual(
      FILE_OFFLOAD_TEXT_SIZE_BYTES
    );
  });

  it("stops accumulating once the total byte budget is exceeded", async () => {
    const line = "y".repeat(1000); // ~1 KB each
    const lines = Array.from({ length: 100 }, () => line);

    const r = await collectGrepMatches({
      lines: linesOf(lines),
      regex: /y/,
      ...OPTS,
    });

    expect(r.byteCapped).toBe(true);
    expect(r.matches.length).toBeLessThan(100);
    expect(Buffer.byteLength(r.matches.join("\n"), "utf8")).toBeLessThanOrEqual(
      FILE_OFFLOAD_TEXT_SIZE_BYTES
    );
  });
});

describe("formatGrepFooter", () => {
  const FOOTER_OPTS = {
    maxMatches: GREP_MATCHES_MAX,
    maxBytes: FILE_OFFLOAD_TEXT_SIZE_BYTES,
    catToolName: "files__cat",
  };

  it("reports the match count with correct pluralization", () => {
    expect(
      formatGrepFooter({
        matchCount: 1,
        matchCapped: false,
        byteCapped: false,
        ...FOOTER_OPTS,
      })
    ).toBe("\n\n[1 match found]");

    expect(
      formatGrepFooter({
        matchCount: 3,
        matchCapped: false,
        byteCapped: false,
        ...FOOTER_OPTS,
      })
    ).toBe("\n\n[3 matches found]");
  });

  it("reports the match cap", () => {
    const footer = formatGrepFooter({
      matchCount: GREP_MATCHES_MAX,
      matchCapped: true,
      byteCapped: false,
      ...FOOTER_OPTS,
    });

    expect(footer).toContain(`Showing first ${GREP_MATCHES_MAX} matches`);
    expect(footer).toContain("files__cat");
  });

  it("reports the byte cap, preferring it over the match cap", () => {
    const footer = formatGrepFooter({
      matchCount: GREP_MATCHES_MAX,
      matchCapped: true,
      byteCapped: true,
      ...FOOTER_OPTS,
    });

    expect(footer).toContain(
      `truncated at ${FILE_OFFLOAD_TEXT_SIZE_BYTES / 1024}KB`
    );
    expect(footer).not.toContain("Showing first");
  });
});
