import { describe, expect, it } from "vitest";

import { decodeBuffer, handleTextFile } from "./file";

function stringToArrayBuffer(content: string): ArrayBuffer {
  const buf = Buffer.from(content, "utf-8");
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

// Helper to properly convert Buffer to ArrayBuffer
function bufferToArrayBuffer(buffer: Buffer): ArrayBufferLike {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

describe("decodeBuffer", () => {
  it("should decode UTF-8 text without BOM", () => {
    const content = "Hello, World! 你好世界 こんにちは";
    const buffer = Buffer.from(content, "utf-8");

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    expect(result).toBe(content);
  });

  it("should decode UTF-8 text with BOM", () => {
    const content = "Hello, World!";
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const contentBuffer = Buffer.from(content, "utf-8");
    const utf8BomBuffer = Buffer.concat([bom, contentBuffer]);

    const result = decodeBuffer(bufferToArrayBuffer(utf8BomBuffer));

    // iconv strips the BOM when decoding UTF-8
    expect(result).toBe(content);
  });

  it("should decode UTF-16LE text with BOM", () => {
    const content = "Hello, World! 你好世界";
    // Create UTF-16LE buffer with BOM
    const utf16Buffer = Buffer.from("\uFEFF" + content, "utf16le");

    const result = decodeBuffer(bufferToArrayBuffer(utf16Buffer));

    // iconv strips the BOM when decoding UTF-16
    expect(result).toBe(content);
  });

  it("should decode UTF-16BE text with BOM", () => {
    const content = "Hello, World!";
    // Manually create UTF-16BE buffer with BOM (FE FF)
    const bomBE = Buffer.from([0xfe, 0xff]);
    // Encode content in UTF-16LE then swap bytes to BE
    const contentLE = Buffer.from(content, "utf16le");
    const contentBE = Buffer.alloc(contentLE.length);
    for (let i = 0; i < contentLE.length; i += 2) {
      // @ts-expect-error - we know the length is correct
      contentBE[i] = contentLE[i + 1];
      // @ts-expect-error - we know the length is correct
      contentBE[i + 1] = contentLE[i];
    }
    const utf16BEBuffer = Buffer.concat([bomBE, contentBE]);

    const result = decodeBuffer(bufferToArrayBuffer(utf16BEBuffer));

    // iconv strips the BOM when decoding
    expect(result).toBe(content);
  });

  it("should handle CSV data with UTF-16LE encoding", () => {
    const csvContent = `name,age,city
Alice,30,Paris
Bob,25,London`;
    const utf16Buffer = Buffer.from("\uFEFF" + csvContent, "utf16le");

    const result = decodeBuffer(bufferToArrayBuffer(utf16Buffer));

    // Should preserve BOM and decode content correctly
    expect(result).toContain("name,age,city");
    expect(result).toContain("Alice,30,Paris");
    expect(result).toContain("Bob,25,London");
  });

  it("should handle CSV data with UTF-16LE and special characters", () => {
    const csvContent = `name,age,city
André,30,París
François,25,Zürich
日本,28,東京`;
    const utf16Buffer = Buffer.from("\uFEFF" + csvContent, "utf16le");

    const result = decodeBuffer(bufferToArrayBuffer(utf16Buffer));

    expect(result).toContain("André");
    expect(result).toContain("París");
    expect(result).toContain("François");
    expect(result).toContain("Zürich");
    expect(result).toContain("日本");
    expect(result).toContain("東京");
  });

  it("should handle empty buffer", () => {
    const buffer = Buffer.from("");

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    expect(result).toBe("");
  });

  it("should handle buffer with only BOM", () => {
    // UTF-16LE BOM only
    const bomBuffer = Buffer.from([0xff, 0xfe]);

    const result = decodeBuffer(bufferToArrayBuffer(bomBuffer));

    // iconv strips the BOM, leaving an empty string
    expect(result).toBe("");
  });

  it("should handle ASCII text (subset of UTF-8)", () => {
    const content = "Hello, World! 123456";
    const buffer = Buffer.from(content, "ascii");

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    expect(result).toBe(content);
  });

  it("should handle Latin-1 characters (fallback to UTF-8 interpretation)", () => {
    const content = "Café résumé naïve";
    const buffer = Buffer.from(content, "utf-8");

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    expect(result).toBe(content);
  });

  it("should detect UTF-16LE BOM correctly", () => {
    // Create buffer with UTF-16LE BOM
    const buffer = Buffer.from([0xff, 0xfe, 0x41, 0x00]); // BOM + 'A' in UTF-16LE

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    // Should be decoded as UTF-16LE, BOM is stripped
    expect(result).toBe("A");
  });

  it("should detect UTF-16BE BOM correctly", () => {
    // Create buffer with UTF-16BE BOM
    const buffer = Buffer.from([0xfe, 0xff, 0x00, 0x41]); // BOM + 'A' in UTF-16BE

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    // Should be decoded as UTF-16BE, BOM is stripped
    expect(result).toBe("A");
  });

  it("should detect UTF-8 BOM correctly", () => {
    // Create buffer with UTF-8 BOM
    const buffer = Buffer.from([0xef, 0xbb, 0xbf, 0x41]); // BOM + 'A'

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    // iconv strips UTF-8 BOM
    expect(result).toBe("A");
  });

  it("should handle buffer that looks like BOM but is too short", () => {
    // Single byte that matches first byte of UTF-16LE BOM
    const buffer = Buffer.from([0xff]);

    const result = decodeBuffer(bufferToArrayBuffer(buffer));

    // Should be treated as regular UTF-8
    expect(result.length).toBe(1);
  });

  it("should handle Windows-style line endings in UTF-16LE", () => {
    const content = "line1\r\nline2\r\nline3";
    const utf16Buffer = Buffer.from("\uFEFF" + content, "utf16le");

    const result = decodeBuffer(bufferToArrayBuffer(utf16Buffer));

    expect(result).toContain("\r\n");
    expect(result).toContain("line1");
    expect(result).toContain("line2");
    expect(result).toContain("line3");
  });
});

describe("handleTextFile", () => {
  const maxDocumentLen = 1_000_000;

  it("accepts plain prose", () => {
    const data = stringToArrayBuffer(
      "The quick brown fox jumps over the lazy dog. Hello world!"
    );

    const result = handleTextFile(data, maxDocumentLen);

    expect(result.isOk()).toBe(true);
  });

  it("rejects content with too few letters (numeric dump)", () => {
    const data = stringToArrayBuffer(
      "1.234, 5.678, 9.012, 3.456, 7.890, 2.345, 6.789, 0.123, 4.567, 8.901"
    );

    const result = handleTextFile(data, maxDocumentLen);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("text_ratio_too_low");
    }
  });

  it("rejects content with high separator density (TSV)", () => {
    const data = stringToArrayBuffer(
      "alpha\tbeta\tgamma\tdelta\nepsilon\tzeta\teta\ttheta"
    );

    const result = handleTextFile(data, maxDocumentLen);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("too_many_separators");
    }
  });

  it("rejects empty content", () => {
    const data = stringToArrayBuffer("   \n\t  ");

    const result = handleTextFile(data, maxDocumentLen);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("empty_content");
    }
  });
});
