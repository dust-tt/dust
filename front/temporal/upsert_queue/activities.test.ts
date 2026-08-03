import { cleanUtf8Content } from "@app/temporal/upsert_queue/activities";
import { describe, expect, it } from "vitest";

describe("cleanUtf8Content", () => {
  it("returns plain strings unchanged", () => {
    expect(cleanUtf8Content("hello world")).toBe("hello world");
    expect(cleanUtf8Content("")).toBe("");
    expect(cleanUtf8Content('{"key": "value"}')).toBe('{"key": "value"}');
  });

  it("strips null bytes", () => {
    expect(cleanUtf8Content("hello\0world")).toBe("helloworld");
    expect(cleanUtf8Content("\0\0\0")).toBe("");
    expect(cleanUtf8Content('{"key": "val\0ue"}')).toBe('{"key": "value"}');
  });

  it("returns early when no escaped surrogate sequences are present", () => {
    // \\uABCD is the 6-char ASCII escape for a non-surrogate code point — left untouched.
    expect(cleanUtf8Content("\\uABCD")).toBe("\\uABCD");
    expect(cleanUtf8Content("\\u003F")).toBe("\\u003F");
  });

  it("cleans escaped lone surrogates even with no actual surrogate code point present", () => {
    // This is the real-world case: cleanUtf8Content runs on JSON-serialized text, where a
    // lone surrogate appears as the escaped form \\uXXXX (ASCII), not an actual code point.
    // The early-exit guard must trigger on the escaped form, otherwise cleaning is skipped.
    expect(cleanUtf8Content("\\uD800")).toBe("\\u003F");
    expect(cleanUtf8Content("\\uDC00")).toBe("\\u003F");

    // Valid surrogate pair in escaped form — preserved.
    expect(cleanUtf8Content("\\uD83D\\uDE00")).toBe("\\uD83D\\uDE00");
  });

  it("cleans a split emoji where the low surrogate was left lone", () => {
    // A spoon emoji 🥄 (U+1F944 = 🥄) whose high surrogate got HTML-entity-encoded
    // (&#xD83E;) while the low surrogate \uDD44 was left as a lone surrogate. Once serialized,
    // \\uDD44 must be replaced so core's serde_json does not reject the body.
    expect(cleanUtf8Content('"&#xD83E;\\uDD44"')).toBe('"&#xD83E;\\u003F"');
  });

  it("replaces lone high surrogates in escaped form", () => {
    expect(cleanUtf8Content("\\uD800")).toBe("\\u003F");
    expect(cleanUtf8Content("\\uDBFF")).toBe("\\u003F");

    // \\uD800\\uDC00 is a valid surrogate pair in escaped form — preserved.
    expect(cleanUtf8Content("\\uD800\\uDC00")).toBe("\\uD800\\uDC00");
  });

  it("replaces lone low surrogates in escaped form", () => {
    // \\uDC00 alone (no preceding high surrogate) is invalid — replaced.
    expect(cleanUtf8Content("\\uDC00")).toBe("\\u003F");
    expect(cleanUtf8Content("\\uDFFF")).toBe("\\u003F");

    // \\uD83D\\uDE00 valid pair — preserved.
    expect(cleanUtf8Content("\\uD83D\\uDE00")).toBe("\\uD83D\\uDE00");
  });

  it("strips null bytes before the surrogate path runs", () => {
    expect(cleanUtf8Content("\0\\uD800\0")).toBe("\\u003F");
  });
});
