import { Readable } from "stream";

import { describe, expect, it } from "vitest";

import { getBase64DecodedSize, streamToBuffer } from "./streams";

describe("streams", () => {
  describe("getBase64DecodedSize", () => {
    it("returns correct size for base64 with no padding", () => {
      // "abc" in base64 is "YWJj" (4 chars, no padding, 3 bytes)
      expect(getBase64DecodedSize("YWJj")).toBe(3);
    });

    it("returns correct size for base64 with single = padding", () => {
      // "ab" in base64 is "YWI=" (4 chars, 1 padding, 2 bytes)
      expect(getBase64DecodedSize("YWI=")).toBe(2);
    });

    it("returns correct size for base64 with double == padding", () => {
      // "a" in base64 is "YQ==" (4 chars, 2 padding, 1 byte)
      expect(getBase64DecodedSize("YQ==")).toBe(1);
    });

    it("returns 0 for empty string", () => {
      expect(getBase64DecodedSize("")).toBe(0);
    });

    it("returns correct size for longer base64 strings", () => {
      // "Hello, World!" is 13 bytes
      const base64 = Buffer.from("Hello, World!").toString("base64");
      expect(getBase64DecodedSize(base64)).toBe(13);
    });
  });

  describe("streamToBuffer", () => {
    it("converts readable stream to buffer", async () => {
      const data = "Hello, World!";
      const readable = Readable.from([data]);

      const result = await streamToBuffer(readable);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.toString()).toBe(data);
      }
    });

    it("handles multiple chunks", async () => {
      const chunks = ["Hello", ", ", "World", "!"];
      const readable = Readable.from(chunks);

      const result = await streamToBuffer(readable);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.toString()).toBe("Hello, World!");
      }
    });

    it("handles Buffer chunks", async () => {
      const chunks = [Buffer.from("Hello"), Buffer.from(", World!")];
      const readable = Readable.from(chunks);

      const result = await streamToBuffer(readable);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.toString()).toBe("Hello, World!");
      }
    });

    it("returns Err on stream error", async () => {
      const readable = new Readable({
        read() {
          this.destroy(new Error("Stream error"));
        },
      });

      const result = await streamToBuffer(readable);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toContain("Failed to read file stream");
      }
    });

    it("handles empty stream", async () => {
      const readable = Readable.from([]);

      const result = await streamToBuffer(readable);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.length).toBe(0);
      }
    });
  });
});
