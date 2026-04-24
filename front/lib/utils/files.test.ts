import type { Authenticator } from "@app/lib/auth";
import type { FileVersion } from "@app/lib/resources/file_resource";
import { copyContent } from "@app/lib/utils/files";
import type { AllSupportedFileContentType } from "@app/types/files";
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeSourceFile(contentType: AllSupportedFileContentType) {
  const sourceBuckets = {
    original: {
      copyFile: vi.fn(),
      name: "source-original-bucket",
    },
    processed: {
      copyFile: vi.fn(),
      name: "source-processed-bucket",
    },
  };

  return {
    contentType,
    getBucketForVersion: vi.fn(
      (version: FileVersion) => sourceBuckets[version]
    ),
    getCloudStoragePath: vi.fn(
      (_auth: Authenticator, version: FileVersion) => `source/${version}`
    ),
    sourceBuckets,
  } satisfies {
    contentType: AllSupportedFileContentType;
    getBucketForVersion: ReturnType<typeof vi.fn>;
    getCloudStoragePath: ReturnType<typeof vi.fn>;
    sourceBuckets: Record<
      FileVersion,
      { copyFile: ReturnType<typeof vi.fn>; name: string }
    >;
  };
}

function makeTargetFile() {
  const targetBuckets = {
    original: { name: "target-original-bucket" },
    processed: { name: "target-processed-bucket" },
  };

  return {
    getBucketForVersion: vi.fn(
      (version: FileVersion) => targetBuckets[version]
    ),
    getCloudStoragePath: vi.fn(
      (_auth: Authenticator, version: FileVersion) => `target/${version}`
    ),
    targetBuckets,
  } satisfies {
    getBucketForVersion: ReturnType<typeof vi.fn>;
    getCloudStoragePath: ReturnType<typeof vi.fn>;
    targetBuckets: Record<FileVersion, { name: string }>;
  };
}

describe("copyContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies only the original version for files without processing", async () => {
    const auth = {} as Authenticator;
    const sourceFile = makeSourceFile("text/plain");
    const targetFile = makeTargetFile();

    await copyContent(
      auth,
      sourceFile as unknown as Parameters<typeof copyContent>[1],
      targetFile as unknown as Parameters<typeof copyContent>[2]
    );

    expect(sourceFile.getCloudStoragePath).toHaveBeenCalledTimes(1);
    expect(sourceFile.getCloudStoragePath).toHaveBeenCalledWith(
      auth,
      "original"
    );
    expect(targetFile.getCloudStoragePath).toHaveBeenCalledTimes(1);
    expect(targetFile.getCloudStoragePath).toHaveBeenCalledWith(
      auth,
      "original"
    );
    expect(sourceFile.sourceBuckets.original.copyFile).toHaveBeenCalledTimes(1);
    expect(sourceFile.sourceBuckets.original.copyFile).toHaveBeenCalledWith(
      "source/original",
      "target/original",
      targetFile.targetBuckets.original
    );
    expect(sourceFile.sourceBuckets.processed.copyFile).not.toHaveBeenCalled();
  });

  it("copies only the original version for processed files by default", async () => {
    const auth = {} as Authenticator;
    const sourceFile = makeSourceFile("application/pdf");
    const targetFile = makeTargetFile();

    await copyContent(
      auth,
      sourceFile as unknown as Parameters<typeof copyContent>[1],
      targetFile as unknown as Parameters<typeof copyContent>[2]
    );

    expect(sourceFile.sourceBuckets.original.copyFile).toHaveBeenCalledTimes(1);
    expect(sourceFile.sourceBuckets.original.copyFile).toHaveBeenCalledWith(
      "source/original",
      "target/original",
      targetFile.targetBuckets.original
    );
    expect(sourceFile.sourceBuckets.processed.copyFile).not.toHaveBeenCalled();
  });

  it("copies both original and processed versions when requested", async () => {
    const auth = {} as Authenticator;
    const sourceFile = makeSourceFile("application/pdf");
    const targetFile = makeTargetFile();

    await copyContent(
      auth,
      sourceFile as unknown as Parameters<typeof copyContent>[1],
      targetFile as unknown as Parameters<typeof copyContent>[2],
      { includeProcessedVersion: true }
    );

    expect(sourceFile.sourceBuckets.original.copyFile).toHaveBeenCalledTimes(1);
    expect(sourceFile.sourceBuckets.original.copyFile).toHaveBeenCalledWith(
      "source/original",
      "target/original",
      targetFile.targetBuckets.original
    );
    expect(sourceFile.sourceBuckets.processed.copyFile).toHaveBeenCalledTimes(
      1
    );
    expect(sourceFile.sourceBuckets.processed.copyFile).toHaveBeenCalledWith(
      "source/processed",
      "target/processed",
      targetFile.targetBuckets.processed
    );
  });
});
