import { describe, expect, it } from "vitest";

import { hashFileContent } from "./file_operations";

describe("hashFileContent", () => {
  // These tests verify blake3 integration. A 64-char hex string corresponds to
  // blake3's fixed 256-bit (32-byte) output.

  it("returns a 64-character hex string", () => {
    const hash = hashFileContent(Buffer.from("hello world"));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same hash for the same content (deterministic)", () => {
    const content = Buffer.from("same content every time");
    expect(hashFileContent(content)).toBe(hashFileContent(content));
  });

  it("returns different hashes for different content", () => {
    const hash1 = hashFileContent(Buffer.from("file content A"));
    const hash2 = hashFileContent(Buffer.from("file content B"));
    expect(hash1).not.toBe(hash2);
  });

  it("handles an empty buffer", () => {
    const hash = hashFileContent(Buffer.from(""));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles binary content", () => {
    const binary = Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x01]);
    const hash = hashFileContent(binary);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces a stable known hash — regression test", () => {
    // Hardcoded to catch accidental changes to the hashing algorithm or
    // encoding. If blake3 is replaced the stored hashes in the database
    // would become inconsistent.
    const hash = hashFileContent(Buffer.from("hello world"));
    expect(hash).toBe(
      "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24"
    );
  });
});
