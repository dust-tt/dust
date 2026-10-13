import {
  FILE_OFFLOAD_FILE_SIZE_BYTES,
  FILE_OFFLOAD_IMAGE_SIZE_BYTES,
  TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
import {
  buildBinaryFileResource,
  buildFileContentBlocks,
  checkFileSizeBeforeDownload,
  paginateText,
  processAttachment,
} from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import config from "@app/lib/api/config";
import { Err, Ok } from "@app/types/shared/result";
import { isTextExtractionSupportedContentType } from "@app/types/shared/text_extraction";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("buildBinaryFileResource", () => {
  it("should base64-encode the buffer and preserve the mime type", () => {
    const buffer = Buffer.from("Hello PDF", "utf-8");

    const block = buildBinaryFileResource({
      buffer,
      fileName: "report.pdf",
      mimeType: "application/pdf",
    });

    expect(block.type).toBe("resource");
    expect(block.resource.mimeType).toBe("application/pdf");
    expect(block.resource.blob).toBe(buffer.toString("base64"));
    expect(block.resource.uri).toBe("report.pdf");
    expect(block.resource._meta).toEqual({ text: "File: report.pdf" });
  });

  it("should fall back to 'unknown' when the file name is missing", () => {
    const block = buildBinaryFileResource({
      buffer: Buffer.from(""),
      fileName: null,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    expect(block.resource.uri).toBe("unknown");
    expect(block.resource._meta).toEqual({ text: "File: unknown" });
  });

  it("should sanitize file names with unsafe characters", () => {
    const block = buildBinaryFileResource({
      buffer: Buffer.from("x"),
      fileName: "../../etc/passwd",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(block.resource.uri).not.toContain("/");
    expect(block.resource.uri).not.toContain("..");
    expect(block.resource._meta.text).toBe(`File: ${block.resource.uri}`);
  });
});

describe("paginateText", () => {
  it("returns the requested slice with a continuation offset", () => {
    expect(paginateText({ text: "abcdefghij", offset: 2, limit: 3 })).toEqual({
      content: "cde",
      returnedContentLength: 3,
      totalContentLength: 10,
      offset: 2,
      nextOffset: 5,
      hasMore: true,
    });
  });

  it("stops at the end of the text on the last page", () => {
    expect(paginateText({ text: "abcdefghij", offset: 8, limit: 5 })).toEqual({
      content: "ij",
      returnedContentLength: 2,
      totalContentLength: 10,
      offset: 8,
      nextOffset: undefined,
      hasMore: false,
    });
  });

  it("returns no content for an offset past the end or a negative limit", () => {
    expect(paginateText({ text: "abc", offset: 10, limit: 5 }).content).toBe(
      ""
    );
    expect(paginateText({ text: "abc", offset: 0, limit: -1 }).content).toBe(
      ""
    );
  });
});

describe("file reads", () => {
  beforeEach(() => {
    // `@app/types/shared/text_extraction` is globally mocked in vite.setup.ts;
    // mirror the real behavior of marking only Tika-supported types.
    vi.mocked(isTextExtractionSupportedContentType).mockImplementation(
      (contentType: string) => contentType === "application/pdf"
    );
    vi.spyOn(config, "getTextExtractionUrl").mockReturnValue(
      "http://text-extraction.test"
    );
  });

  describe("checkFileSizeBeforeDownload", () => {
    it("rejects files over the download limit, even with readable text", () => {
      const result = checkFileSizeBeforeDownload({
        byteLength: TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES + 1,
        mimeType: "application/pdf",
      });

      expect(result.isErr()).toBe(true);
    });

    it("rejects binaries with no readable text over the offload limit", () => {
      const result = checkFileSizeBeforeDownload({
        byteLength: FILE_OFFLOAD_IMAGE_SIZE_BYTES,
        mimeType: "image/png",
      });

      expect(result.isErr()).toBe(true);
    });

    it("accepts files with readable text over the offload limit", () => {
      expect(
        checkFileSizeBeforeDownload({
          byteLength: FILE_OFFLOAD_FILE_SIZE_BYTES + 1,
          mimeType: "text/csv",
        }).isOk()
      ).toBe(true);
      expect(
        checkFileSizeBeforeDownload({
          byteLength: FILE_OFFLOAD_FILE_SIZE_BYTES + 1,
          mimeType: "application/pdf",
        }).isOk()
      ).toBe(true);
    });

    it("accepts binaries within the offload limit", () => {
      const result = checkFileSizeBeforeDownload({
        byteLength: 1024,
        mimeType: "image/png",
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe("buildFileContentBlocks", () => {
    const metadata = { fileId: "file-1" };

    function getBlocks(
      result: Awaited<ReturnType<typeof buildFileContentBlocks>>
    ): CallToolResult["content"] {
      if (result.isErr()) {
        throw new Error(`Expected Ok result, got: ${result.error.message}`);
      }
      return result.value;
    }

    function parseTextBlock(block: CallToolResult["content"][number]) {
      if (block.type !== "text") {
        throw new Error("Expected a text block");
      }
      return JSON.parse(block.text);
    }

    it("returns the first text page with the metadata and the binary on offset 0", async () => {
      const blocks = getBlocks(
        await buildFileContentBlocks({
          buffer: Buffer.from("abcdefghij", "utf-8"),
          fileName: "notes.txt",
          mimeType: "text/plain",
          metadata,
          offset: 0,
          limit: 4,
          workspaceId: "w1",
        })
      );

      expect(blocks).toHaveLength(2);
      expect(parseTextBlock(blocks[0])).toMatchObject({
        fileId: "file-1",
        content: "abcd",
        nextOffset: 4,
        hasMore: true,
      });
      expect(blocks[1].type).toBe("resource");
    });

    it("does not attach the binary again on later pages", async () => {
      const blocks = getBlocks(
        await buildFileContentBlocks({
          buffer: Buffer.from("abcdefghij", "utf-8"),
          fileName: "notes.txt",
          mimeType: "text/plain",
          metadata,
          offset: 4,
          limit: 4,
          workspaceId: "w1",
        })
      );

      expect(blocks).toHaveLength(1);
      expect(parseTextBlock(blocks[0])).toMatchObject({ content: "efgh" });
    });

    it("returns extracted text for supported document types", async () => {
      const blocks = getBlocks(
        await buildFileContentBlocks({
          buffer: Buffer.from("%PDF", "utf-8"),
          fileName: "report.pdf",
          mimeType: "application/pdf",
          metadata,
          offset: 0,
          limit: 100,
          workspaceId: "w1",
        })
      );

      expect(parseTextBlock(blocks[0])).toMatchObject({
        content: "mock extracted text",
      });
    });

    it("attaches a binary with no readable text whatever the offset", async () => {
      const blocks = getBlocks(
        await buildFileContentBlocks({
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          fileName: "screenshot.png",
          mimeType: "image/png",
          metadata,
          offset: 10,
          limit: 100,
          workspaceId: "w1",
        })
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("resource");
    });

    it("fails when a binary with no readable text exceeds the offload limit", async () => {
      const result = await buildFileContentBlocks({
        buffer: Buffer.alloc(FILE_OFFLOAD_IMAGE_SIZE_BYTES),
        fileName: "large.png",
        mimeType: "image/png",
        metadata,
        offset: 0,
        limit: 100,
        workspaceId: "w1",
      });

      expect(result.isErr()).toBe(true);
    });

    it("falls back to the binary when text extraction fails", async () => {
      vi.spyOn(config, "getTextExtractionUrl").mockImplementation(() => {
        throw new Error("Tika unavailable");
      });

      const blocks = getBlocks(
        await buildFileContentBlocks({
          buffer: Buffer.from("%PDF", "utf-8"),
          fileName: "report.pdf",
          mimeType: "application/pdf",
          metadata,
          offset: 0,
          limit: 100,
          workspaceId: "w1",
        })
      );

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("resource");
    });

    it("reports the extraction failure when the binary exceeds the offload limit", async () => {
      vi.spyOn(config, "getTextExtractionUrl").mockImplementation(() => {
        throw new Error("Tika unavailable");
      });

      const result = await buildFileContentBlocks({
        buffer: Buffer.alloc(FILE_OFFLOAD_FILE_SIZE_BYTES),
        fileName: "scan.pdf",
        mimeType: "application/pdf",
        metadata,
        offset: 0,
        limit: 100,
        workspaceId: "w1",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Tika unavailable");
      }
    });
  });
});
