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

  it("returns early when no actual surrogate code points are present", () => {
    // \\uD800 here is the 6-char ASCII sequence \uD800, not an actual surrogate code point.
    // The early-exit regex sees no surrogates → returns unchanged.
    expect(cleanUtf8Content("\\uD800")).toBe("\\uD800");
    expect(cleanUtf8Content("\\uDC00")).toBe("\\uDC00");
  });

  it("replaces lone high surrogates in escaped form when actual surrogates trigger processing", () => {
    // \uD800 (actual code point U+D800) triggers the early-exit guard.
    // The following \\uD800 is the 6-char escaped form — lone, so it gets replaced.
    expect(cleanUtf8Content("\uD800\\uD800")).toBe("\uD800\\u003F");
    expect(cleanUtf8Content("\uD800\\uDBFF")).toBe("\uD800\\u003F");

    // \\uD800\\uDC00 is a valid surrogate pair in escaped form — preserved.
    expect(cleanUtf8Content("\uD800\\uD800\\uDC00")).toBe(
      "\uD800\\uD800\\uDC00"
    );
  });

  it("replaces lone low surrogates in escaped form when actual surrogates trigger processing", () => {
    // \\uDC00 alone (no preceding high surrogate) is invalid — replaced.
    expect(cleanUtf8Content("\uD800\\uDC00")).toBe("\uD800\\u003F");
    expect(cleanUtf8Content("\uD800\\uDFFF")).toBe("\uD800\\u003F");

    // \\uD800\\uDC00 valid pair — preserved.
    expect(cleanUtf8Content("\uD800\\uD83D\\uDE00")).toBe(
      "\uD800\\uD83D\\uDE00"
    );
  });

  it("strips null bytes independently of the surrogate path", () => {
    // Null bytes are stripped first; the remaining string has no actual surrogates → early exit.
    expect(cleanUtf8Content("\0\\uD800\0")).toBe("\\uD800");
  });
});
