// @vitest-environment node

import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

describe("fileStorageMock", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("preserves the legacy no-op for an unpinned missing copy source", async () => {
    const bucket = getPrivateUploadBucket();

    await expect(
      bucket.copyFile("missing-source", "missing-destination")
    ).resolves.toBeUndefined();
    expect(fileStorageMock.getObject("missing-destination")).toBeUndefined();
    await expect(
      bucket.copyFile("missing-source", "missing-destination", undefined, {
        sourceGeneration: "1",
      })
    ).rejects.toMatchObject({ code: 404 });
  });

  it("distinguishes missing objects from generation mismatches on delete", async () => {
    const bucket = getPrivateUploadBucket();

    await expect(
      bucket.delete("missing", {
        ignoreNotFound: true,
        ifGenerationMatch: "1",
      })
    ).resolves.toBeUndefined();
    await expect(
      bucket.delete("missing", { ifGenerationMatch: "1" })
    ).rejects.toMatchObject({ code: 404 });
    await expect(bucket.delete("missing")).resolves.toBeUndefined();

    fileStorageMock.setObject("source", "old");
    const oldGeneration = fileStorageMock.getObjectGeneration("source");
    assert(oldGeneration);
    fileStorageMock.setObject("source", "new");

    await expect(
      bucket.delete("source", {
        ignoreNotFound: true,
        ifGenerationMatch: oldGeneration,
      })
    ).rejects.toMatchObject({ code: 412 });
    expect(fileStorageMock.getObject("source")).toBe("new");

    const currentGeneration = fileStorageMock.getObjectGeneration("source");
    assert(currentGeneration);
    await expect(
      bucket.delete("source", { ifGenerationMatch: currentGeneration })
    ).resolves.toBeUndefined();
    expect(fileStorageMock.getObject("source")).toBeUndefined();
  });
});
