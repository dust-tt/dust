import { getProcessedContentType } from "@app/lib/api/files/processing";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { copyContent } from "@app/lib/utils/files";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AllSupportedFileContentType } from "@app/types/files";
import { Readable, Writable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CONTENT = Buffer.from("original-content");
const PROCESSED_CONTENT = Buffer.from("processed-content");

function makeWritable(chunks: Buffer[]) {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
}

async function createCopyTestContext(contentType: AllSupportedFileContentType) {
  const { authenticator: auth } = await createResourceTest({
    role: "admin",
  });

  const fileExtension = contentType === "application/pdf" ? "pdf" : "txt";
  const sourceFile = await FileFactory.create(auth, null, {
    contentType,
    fileName: `source.${fileExtension}`,
    fileSize: ORIGINAL_CONTENT.length,
    status: "created",
    useCase: "conversation",
  });
  const targetFile = await FileFactory.create(auth, null, {
    contentType,
    fileName: `copy.${fileExtension}`,
    fileSize: ORIGINAL_CONTENT.length,
    status: "created",
    useCase: "conversation",
  });

  const originalChunks: Buffer[] = [];
  const processedChunks: Buffer[] = [];

  const getReadStreamSpy = vi
    .spyOn(sourceFile, "getReadStream")
    .mockImplementation(
      ({ version }: { auth: typeof auth; version: FileVersion }) =>
        Readable.from([
          version === "original" ? ORIGINAL_CONTENT : PROCESSED_CONTENT,
        ])
    );
  const getWriteStreamSpy = vi
    .spyOn(targetFile, "getWriteStream")
    .mockImplementation(
      ({
        version,
      }: {
        auth: typeof auth;
        version: FileVersion;
        overrideContentType?: string;
      }) =>
        version === "original"
          ? makeWritable(originalChunks)
          : makeWritable(processedChunks)
    );

  return {
    auth,
    sourceFile,
    targetFile,
    originalChunks,
    processedChunks,
    getReadStreamSpy,
    getWriteStreamSpy,
  };
}

describe("copyContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies only the original version for files without processing", async () => {
    const context = await createCopyTestContext("text/plain");

    await copyContent(context.auth, context.sourceFile, context.targetFile);

    expect(context.getReadStreamSpy).toHaveBeenCalledTimes(1);
    expect(context.getReadStreamSpy).toHaveBeenCalledWith({
      auth: context.auth,
      version: "original",
    });
    expect(context.getWriteStreamSpy).toHaveBeenCalledTimes(1);
    expect(context.getWriteStreamSpy).toHaveBeenCalledWith({
      auth: context.auth,
      version: "original",
    });
    expect(Buffer.concat(context.originalChunks)).toEqual(ORIGINAL_CONTENT);
    expect(context.processedChunks).toHaveLength(0);
  });

  it("copies only the original version for processed files by default", async () => {
    const context = await createCopyTestContext("application/pdf");

    await copyContent(context.auth, context.sourceFile, context.targetFile);

    expect(context.getReadStreamSpy).toHaveBeenCalledTimes(1);
    expect(context.getReadStreamSpy).toHaveBeenCalledWith({
      auth: context.auth,
      version: "original",
    });
    expect(context.getWriteStreamSpy).toHaveBeenCalledTimes(1);
    expect(context.getWriteStreamSpy).toHaveBeenCalledWith({
      auth: context.auth,
      version: "original",
    });
    expect(Buffer.concat(context.originalChunks)).toEqual(ORIGINAL_CONTENT);
    expect(context.processedChunks).toHaveLength(0);
  });

  it("copies both original and processed versions when requested", async () => {
    const context = await createCopyTestContext("application/pdf");

    await copyContent(context.auth, context.sourceFile, context.targetFile, {
      includeProcessedVersion: true,
    });

    expect(context.getReadStreamSpy).toHaveBeenCalledTimes(2);
    expect(context.getReadStreamSpy).toHaveBeenNthCalledWith(1, {
      auth: context.auth,
      version: "original",
    });
    expect(context.getReadStreamSpy).toHaveBeenNthCalledWith(2, {
      auth: context.auth,
      version: "processed",
    });
    expect(context.getWriteStreamSpy).toHaveBeenCalledTimes(2);
    expect(context.getWriteStreamSpy).toHaveBeenNthCalledWith(1, {
      auth: context.auth,
      version: "original",
    });
    expect(context.getWriteStreamSpy).toHaveBeenNthCalledWith(2, {
      auth: context.auth,
      version: "processed",
      overrideContentType: getProcessedContentType(
        context.sourceFile.contentType
      ),
    });
    expect(Buffer.concat(context.originalChunks)).toEqual(ORIGINAL_CONTENT);
    expect(Buffer.concat(context.processedChunks)).toEqual(PROCESSED_CONTENT);
  });
});
