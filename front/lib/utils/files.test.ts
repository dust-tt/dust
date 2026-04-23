import { getProcessedContentType } from "@app/lib/api/files/processing";
import type { Authenticator } from "@app/lib/auth";
import { copyContent } from "@app/lib/utils/files";
import type { AllSupportedFileContentType } from "@app/types/files";
import { Readable, Writable } from "stream";
import { describe, expect, it, vi } from "vitest";

type FileVersion = "original" | "processed";

function makeWritable(chunks: Buffer[]) {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
}

function makeSourceFile(contentType: AllSupportedFileContentType) {
  const originalContent = Buffer.from("original-content");
  const processedContent = Buffer.from("processed-content");

  return {
    contentType,
    originalContent,
    processedContent,
    getReadStream: vi.fn(
      ({ version }: { auth: Authenticator; version: FileVersion }) =>
        Readable.from([
          version === "original" ? originalContent : processedContent,
        ])
    ),
  } satisfies {
    contentType: AllSupportedFileContentType;
    originalContent: Buffer;
    processedContent: Buffer;
    getReadStream: ReturnType<typeof vi.fn>;
  };
}

describe("copyContent", () => {
  it("copies only the original version for files without processing", async () => {
    const auth = {} as Authenticator;
    const originalChunks: Buffer[] = [];
    const processedChunks: Buffer[] = [];
    const sourceFile = makeSourceFile("text/plain");
    const targetFile = {
      getWriteStream: vi.fn(
        ({
          version,
        }: {
          auth: Authenticator;
          version: FileVersion;
          overrideContentType?: string;
        }) =>
          version === "original"
            ? makeWritable(originalChunks)
            : makeWritable(processedChunks)
      ),
    };

    await copyContent(
      auth,
      sourceFile as unknown as Parameters<typeof copyContent>[1],
      targetFile as unknown as Parameters<typeof copyContent>[2]
    );

    expect(sourceFile.getReadStream).toHaveBeenCalledTimes(1);
    expect(sourceFile.getReadStream).toHaveBeenCalledWith({
      auth,
      version: "original",
    });
    expect(targetFile.getWriteStream).toHaveBeenCalledTimes(1);
    expect(targetFile.getWriteStream).toHaveBeenCalledWith({
      auth,
      version: "original",
    });
    expect(Buffer.concat(originalChunks)).toEqual(sourceFile.originalContent);
    expect(processedChunks).toHaveLength(0);
  });

  it("copies only the original version for processed files by default", async () => {
    const auth = {} as Authenticator;
    const originalChunks: Buffer[] = [];
    const processedChunks: Buffer[] = [];
    const sourceFile = makeSourceFile("application/pdf");
    const targetFile = {
      getWriteStream: vi.fn(
        ({
          version,
        }: {
          auth: Authenticator;
          version: FileVersion;
          overrideContentType?: string;
        }) =>
          version === "original"
            ? makeWritable(originalChunks)
            : makeWritable(processedChunks)
      ),
    };

    await copyContent(
      auth,
      sourceFile as unknown as Parameters<typeof copyContent>[1],
      targetFile as unknown as Parameters<typeof copyContent>[2]
    );

    expect(sourceFile.getReadStream).toHaveBeenCalledTimes(1);
    expect(sourceFile.getReadStream).toHaveBeenCalledWith({
      auth,
      version: "original",
    });
    expect(targetFile.getWriteStream).toHaveBeenCalledTimes(1);
    expect(targetFile.getWriteStream).toHaveBeenCalledWith({
      auth,
      version: "original",
    });
    expect(Buffer.concat(originalChunks)).toEqual(sourceFile.originalContent);
    expect(processedChunks).toHaveLength(0);
  });

  it("copies both original and processed versions when requested", async () => {
    const auth = {} as Authenticator;
    const originalChunks: Buffer[] = [];
    const processedChunks: Buffer[] = [];
    const sourceFile = makeSourceFile("application/pdf");
    const targetFile = {
      getWriteStream: vi.fn(
        ({
          version,
        }: {
          auth: Authenticator;
          version: FileVersion;
          overrideContentType?: string;
        }) =>
          version === "original"
            ? makeWritable(originalChunks)
            : makeWritable(processedChunks)
      ),
    };

    await copyContent(
      auth,
      sourceFile as unknown as Parameters<typeof copyContent>[1],
      targetFile as unknown as Parameters<typeof copyContent>[2],
      { includeProcessedVersion: true }
    );

    expect(sourceFile.getReadStream).toHaveBeenCalledTimes(2);
    expect(sourceFile.getReadStream).toHaveBeenNthCalledWith(1, {
      auth,
      version: "original",
    });
    expect(sourceFile.getReadStream).toHaveBeenNthCalledWith(2, {
      auth,
      version: "processed",
    });
    expect(targetFile.getWriteStream).toHaveBeenCalledTimes(2);
    expect(targetFile.getWriteStream).toHaveBeenNthCalledWith(1, {
      auth,
      version: "original",
    });
    expect(targetFile.getWriteStream).toHaveBeenNthCalledWith(2, {
      auth,
      version: "processed",
      overrideContentType: getProcessedContentType(sourceFile.contentType),
    });
    expect(Buffer.concat(originalChunks)).toEqual(sourceFile.originalContent);
    expect(Buffer.concat(processedChunks)).toEqual(sourceFile.processedContent);
  });
});
