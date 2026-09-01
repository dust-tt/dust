// @vitest-environment node

import path from "node:path";
import {
  copyFrameSourceStorage,
  inspectFrameSourceStorage,
} from "@app/lib/api/frames/source_storage";
import { setupFrameSourceStorageTest } from "@app/lib/api/frames/source_storage.test_utils";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  fileStorageMock.reset();
});

describe("Frame source storage copies", () => {
  it("copies the complete raw source tree into an empty destination", async () => {
    const c = await setupFrameSourceStorageTest();
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket)
      .mockReturnValueOnce(storage)
      .mockReturnValueOnce(storage);
    const copyFile = vi.mocked(storage.copyFile);
    const destinationMountPath = c.sourceObjects[0].replace(
      "/Status/",
      "/Archive/"
    );
    const hiddenObject = `${c.sourceMountDirectory}/.cache/state.json`;
    const placeholderObject = `${c.sourceMountDirectory}/empty/`;
    for (const objectPath of [hiddenObject, placeholderObject]) {
      c.listedObjects.push(objectPath);
      fileStorageMock.setObject(objectPath, objectPath);
    }

    const snapshot = await inspectFrameSourceStorage({
      destinationMountPath,
      sourceMountPath: c.sourceObjects[0],
    });
    assert(snapshot.isOk(), snapshot.isErr() ? snapshot.error.message : "");
    const copied = await copyFrameSourceStorage(snapshot.value);

    assert(copied.isOk(), copied.isErr() ? copied.error.message : "");
    for (const source of c.listedObjects) {
      const destination = source.replace("/Status/", "/Archive/");
      const file = storage.file(destination);
      const chunks = await file.createReadStream().toArray();
      const expected = fileStorageMock.getObject(source);
      expect(Buffer.concat(chunks).toString("utf8")).toBe(expected);
      expect(copyFile).toHaveBeenCalledWith(source, destination, undefined, {
        destinationGenerationMatch: 0,
        sourceGeneration: expect.any(String),
      });
    }
  });

  it("rejects an occupied destination", async () => {
    const c = await setupFrameSourceStorageTest();
    const destinationMountPath = c.sourceObjects[0].replace(
      "/Status/",
      "/Archive/"
    );
    fileStorageMock.setObject(
      path.posix.dirname(destinationMountPath),
      "occupied"
    );

    const snapshot = await inspectFrameSourceStorage({
      destinationMountPath,
      sourceMountPath: c.sourceObjects[0],
    });

    expect(snapshot.isErr() && snapshot.error).toMatchObject({
      code: "conflict",
    });
  });

  it("counts hidden objects toward the source size limit", async () => {
    const c = await setupFrameSourceStorageTest();
    const hiddenObject = `${c.sourceMountDirectory}/.cache/large.bin`;
    c.listedObjects.push(hiddenObject);
    c.objectSizes.set(hiddenObject, String(101 * 1024 * 1024));
    fileStorageMock.setObject(hiddenObject, "");

    const snapshot = await inspectFrameSourceStorage({
      destinationMountPath: c.sourceObjects[0].replace("/Status/", "/Archive/"),
      sourceMountPath: c.sourceObjects[0],
    });

    expect(snapshot.isErr() && snapshot.error).toMatchObject({
      code: "invalid_source",
    });
  });

  it("returns a typed copy failure", async () => {
    const c = await setupFrameSourceStorageTest();
    fileStorageMock.setCopyFileFails((source) => source === c.sourceObjects[0]);
    const snapshot = await inspectFrameSourceStorage({
      destinationMountPath: c.sourceObjects[0].replace("/Status/", "/Archive/"),
      sourceMountPath: c.sourceObjects[0],
    });
    assert(snapshot.isOk(), snapshot.isErr() ? snapshot.error.message : "");

    const copied = await copyFrameSourceStorage(snapshot.value);

    expect(copied.isErr() && copied.error).toMatchObject({
      code: "copy_failed",
    });
  });
});
