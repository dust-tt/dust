import { processAttachment } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it } from "vitest";

const failingExtractText = async () =>
  new Err("Text extraction not supported for file type.");

describe("processAttachment", () => {
  it("returns text/plain content verbatim, including non-ASCII characters", async () => {
    const content = "héllo wörld — accents preserved, naïve café";
    const result = await processAttachment({
      mimeType: "text/plain",
      filename: "notes.txt",
      extractText: failingExtractText,
      downloadContent: async () => new Ok(Buffer.from(content, "utf-8")),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([
        { type: "text", text: JSON.stringify(content, null, 2) },
      ]);
    }
  });

  it("returns text/xml content verbatim instead of misdecoding it as base64", async () => {
    const content = `<?xml version="1.0"?><x>ioz</x>`;
    const result = await processAttachment({
      mimeType: "text/xml",
      filename: "data.xml",
      extractText: failingExtractText,
      downloadContent: async () => new Ok(Buffer.from(content, "utf-8")),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([
        { type: "text", text: JSON.stringify(content, null, 2) },
      ]);
    }
  });

  it("returns text/csv content verbatim", async () => {
    const content = "name,city\nZoé,Paris\nJosé,Lyon";
    const result = await processAttachment({
      mimeType: "text/csv",
      filename: "users.csv",
      extractText: failingExtractText,
      downloadContent: async () => new Ok(Buffer.from(content, "utf-8")),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([
        { type: "text", text: JSON.stringify(content, null, 2) },
      ]);
    }
  });

  it("returns binary content as a base64 resource blob preserving the exact bytes", async () => {
    // PNG magic number followed by arbitrary non-UTF-8 bytes.
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe,
    ]);
    const result = await processAttachment({
      mimeType: "image/png",
      filename: "screenshot.png",
      extractText: failingExtractText,
      downloadContent: async () => new Ok(bytes),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      const block = result.value[0];
      if (block.type !== "resource" || !("blob" in block.resource)) {
        throw new Error("Expected a blob resource block");
      }
      expect(block.resource.mimeType).toBe("image/png");
      expect(Buffer.from(block.resource.blob, "base64").equals(bytes)).toBe(
        true
      );
    }
  });

  it("returns extracted text for supported document types without downloading", async () => {
    const result = await processAttachment({
      mimeType: "application/pdf",
      filename: "report.pdf",
      extractText: async () => new Ok("extracted text"),
      downloadContent: async () => {
        throw new Error("downloadContent should not be called");
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([
        { type: "text", text: JSON.stringify("extracted text", null, 2) },
      ]);
    }
  });

  it("falls back to download when text extraction fails for a supported type", async () => {
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    const result = await processAttachment({
      mimeType: "application/pdf",
      filename: "broken.pdf",
      extractText: async () => new Err("Tika choked"),
      downloadContent: async () => new Ok(bytes),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const block = result.value[0];
      if (block.type !== "resource" || !("blob" in block.resource)) {
        throw new Error("Expected a blob resource block");
      }
      expect(Buffer.from(block.resource.blob, "base64").equals(bytes)).toBe(
        true
      );
    }
  });

  it("propagates download errors", async () => {
    const result = await processAttachment({
      mimeType: "text/plain",
      filename: "missing.txt",
      extractText: failingExtractText,
      downloadContent: async () => new Err("boom"),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("boom");
    }
  });
});
