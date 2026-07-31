import { readTextFilePage } from "@app/lib/api/files/text_file_pagination";
import assert from "assert";
import { Readable } from "stream";
import { describe, expect, it } from "vitest";

function streamOf(...chunks: string[]): Readable {
  return Readable.from(chunks.map((c) => Buffer.from(c, "utf8")));
}

describe("readTextFilePage", () => {
  it("handles newlines split across stream chunks", async () => {
    const content = "abc\ndef\n";
    const page = await readTextFilePage(streamOf("ab", "c\nde", "f\n"), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes: Buffer.byteLength(content, "utf8"),
      maxLines: 100,
      budgetBytes: 1_000,
    });

    expect(page.parts).toEqual(["1: abc", "2: def"]);
    expect(page.hasMore).toBe(false);
    expect(page.endedMidLine).toBeNull();
    expect(page.nextByteOffset).toBeNull();
  });

  it("returns a byte cursor pointing after both CRLF bytes at a line-boundary stop", async () => {
    const content = "alpha\r\nbeta\r\n";
    const fileSizeBytes = Buffer.byteLength(content, "utf8");
    const first = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes,
      maxLines: 1,
      budgetBytes: 1_000,
    });

    expect(first.parts).toEqual(["1: alpha"]);
    // "alpha\r\n" is 7 bytes: the cursor must sit on the first byte of "beta".
    expect(first.nextByteOffset).toBe(7);

    const second = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: 7,
      fileSizeBytes,
      maxLines: 100,
      budgetBytes: 1_000,
    });
    expect(second.parts).toEqual(["2: beta"]);
    expect(second.startedMidLine).toBe(false);
  });

  it("returns a byte cursor when the next line does not fit the remaining budget", async () => {
    const content = "aaa\n" + "b".repeat(50) + "\n";
    const fileSizeBytes = Buffer.byteLength(content, "utf8");
    const first = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes,
      maxLines: 100,
      budgetBytes: 20,
    });

    expect(first.parts).toEqual(["1: aaa"]);
    expect(first.stopReason).toBe("budget");
    expect(first.endedMidLine).toBeNull();
    // The cursor sits on the first byte of the unemitted line 2.
    expect(first.nextByteOffset).toBe(4);

    const second = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: 4,
      fileSizeBytes,
      maxLines: 100,
      budgetBytes: 1_000,
    });
    expect(second.parts).toEqual([`2: ${"b".repeat(50)}`]);
    expect(second.startedMidLine).toBe(false);
    expect(second.nextByteOffset).toBeNull();
  });

  it("emits a first line that exactly fills the budget without a continuation", async () => {
    // "1: " (3 bytes) + 97 content bytes exactly fills a 100-byte budget. The join
    // separator only exists between parts, so this line fits and no continuation must be
    // produced (charging the separator unconditionally would yield byte_offset=EOF, which
    // the handlers reject).
    const line = "X".repeat(97);
    const page = await readTextFilePage(streamOf(line), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes: 97,
      maxLines: 100,
      budgetBytes: 100,
    });

    expect(page.parts).toEqual([`1: ${line}`]);
    expect(page.endedMidLine).toBeNull();
    expect(page.hasMore).toBe(false);
    expect(page.nextByteOffset).toBeNull();
  });

  it("emits an exact-budget line with a trailing newline without an empty continuation", async () => {
    const line = "X".repeat(97);
    const page = await readTextFilePage(streamOf(line + "\n"), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes: 98,
      maxLines: 100,
      budgetBytes: 100,
    });

    expect(page.parts).toEqual([`1: ${line}`]);
    expect(page.endedMidLine).toBeNull();
    expect(page.hasMore).toBe(false);
    expect(page.nextByteOffset).toBeNull();
  });

  it("treats CRLF as a line boundary and strips the carriage return", async () => {
    const content = "alpha\r\nbeta\r\n";
    const page = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes: Buffer.byteLength(content, "utf8"),
      maxLines: 100,
      budgetBytes: 1_000,
    });

    expect(page.parts).toEqual(["1: alpha", "2: beta"]);
    expect(page.hasMore).toBe(false);
  });

  it("resumes at a byte_offset spanning chunk boundaries", async () => {
    const line = "0123456789".repeat(10);
    const content = line + "\n";
    const fileSizeBytes = Buffer.byteLength(content, "utf8");

    const first = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes,
      maxLines: 100,
      budgetBytes: 40,
    });
    assert(first.endedMidLine);
    // Mid-line and line-boundary stops share the same continuation cursor.
    expect(first.nextByteOffset).toBe(first.endedMidLine.pos);

    // Resume with the skipped prefix split across odd-sized chunks.
    const second = await readTextFilePage(
      streamOf(content.slice(0, 7), content.slice(7, 41), content.slice(41)),
      {
        startLine: 1,
        byteOffset: first.endedMidLine.pos,
        fileSizeBytes,
        maxLines: 100,
        budgetBytes: 1_000,
      }
    );
    expect(second.parts).toEqual([
      `1 (cont.): ${line.slice(first.endedMidLine.pos)}`,
    ]);
    expect(second.startedMidLine).toBe(true);
    expect(second.hasMore).toBe(false);
  });

  it("counts newlines in the skipped prefix to keep line numbers accurate", async () => {
    const content = "first\nsecond\nthird and more text\nfourth\n";
    // Resume inside "third and more text" (line 3): bytes [0, 17) cover "first\nsecond\nthir".
    const page = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: 17,
      fileSizeBytes: Buffer.byteLength(content, "utf8"),
      maxLines: 100,
      budgetBytes: 1_000,
    });

    expect(page.parts[0]).toBe("3 (cont.): d and more text");
    expect(page.parts[1]).toBe("4: fourth");
    expect(page.startedMidLine).toBe(true);
  });

  it("treats a byte_offset at a line start as a plain line, not a continuation", async () => {
    const content = "abc\ndef\n";
    // Byte 4 is the first byte of "def" (right after "abc\n").
    const page = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: 4,
      fileSizeBytes: Buffer.byteLength(content, "utf8"),
      maxLines: 100,
      budgetBytes: 1_000,
    });

    expect(page.parts).toEqual(["2: def"]);
    expect(page.startedMidLine).toBe(false);
  });

  it("snaps an inbound byte_offset backward off a multibyte character", async () => {
    const line = "é".repeat(50); // 2 bytes per character.
    const content = line + "\n";

    // Byte 21 is the continuation byte of the 11th "é" (bytes [20, 22)); the resume must
    // snap back to byte 20 and emit whole characters.
    const page = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: 21,
      fileSizeBytes: Buffer.byteLength(content, "utf8"),
      maxLines: 100,
      budgetBytes: 1_000,
    });

    expect(page.parts).toEqual([`1 (cont.): ${"é".repeat(40)}`]);
    expect(page.parts[0]).not.toContain("�");
  });

  it("snaps an inbound byte_offset even when the skip ends exactly at a chunk boundary", async () => {
    const line = "é".repeat(50);
    const content = line + "\n";

    // The skip target (byte 21) is exactly the end of the first chunk, so the snap decision
    // must carry over to the next chunk.
    const page = await readTextFilePage(
      streamOf(content.slice(0, 10), content.slice(10)),
      {
        startLine: 1,
        byteOffset: 21,
        fileSizeBytes: Buffer.byteLength(content, "utf8"),
        maxLines: 100,
        budgetBytes: 1_000,
      }
    );

    expect(page.parts).toEqual([`1 (cont.): ${"é".repeat(40)}`]);
    expect(page.parts[0]).not.toContain("�");
  });

  it("returns an empty page when the stream ends before the byte_offset", async () => {
    const page = await readTextFilePage(streamOf("short"), {
      startLine: 1,
      byteOffset: 100,
      fileSizeBytes: 5,
      maxLines: 100,
      budgetBytes: 1_000,
    });

    expect(page.parts).toEqual([]);
    expect(page.firstLine).toBeNull();
  });

  it("backs off to a UTF-8 boundary instead of splitting a character on output", async () => {
    const line = "é".repeat(50); // 2 bytes per character.
    const content = line + "\n";
    const fileSizeBytes = Buffer.byteLength(content, "utf8");

    // "1: " prefix is 3 bytes, so a 24-byte budget leaves 21 content bytes — landing inside
    // the 11th "é" (bytes [20, 22)). The cut must back off to byte 20.
    const page = await readTextFilePage(streamOf(content), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes,
      maxLines: 100,
      budgetBytes: 24,
    });

    assert(page.endedMidLine);
    expect(page.parts[0]).toBe(`1: ${"é".repeat(10)}`);
    expect(page.parts[0]).not.toContain("�");
    expect(page.endedMidLine.pos).toBe(20);
  });

  it("resolves a page from an oversized line prefix without waiting for the newline", async () => {
    // The rest of the line arrives late; the scanner must resolve the page from the
    // buffered prefix alone instead of buffering the whole line up to its newline.
    let restOfLineDelivered = false;
    async function* chunks() {
      yield Buffer.from("X".repeat(200), "utf8");
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
      restOfLineDelivered = true;
      yield Buffer.from("tail\n", "utf8");
    }

    const page = await readTextFilePage(Readable.from(chunks()), {
      startLine: 1,
      byteOffset: null,
      fileSizeBytes: 205,
      maxLines: 100,
      budgetBytes: 100,
    });

    assert(page.endedMidLine);
    expect(page.parts[0]).toBe(`1: ${"X".repeat(97)}`);
    expect(page.endedMidLine.pos).toBe(97);
    expect(restOfLineDelivered).toBe(false);
  });
});
