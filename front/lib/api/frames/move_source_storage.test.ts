// @vitest-environment node

import path from "node:path";
import { setupMoveFrameV2SourceTest } from "@app/lib/api/frames/move_source.test_utils";
import {
  copyFrameSourceMoveStorage,
  inspectFrameSourceMoveStorage,
} from "@app/lib/api/frames/move_source_storage";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  fileStorageMock.reset();
});

describe("Frame source move storage", () => {
  it("copies the complete raw source tree into an empty destination", async () => {
    const c = await setupMoveFrameV2SourceTest();
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

    const snapshot = await inspectFrameSourceMoveStorage({
      destinationMountPath,
      sourceMountPath: c.sourceObjects[0],
    });
    assert(snapshot.isOk(), snapshot.isErr() ? snapshot.error.message : "");
    const copied = await copyFrameSourceMoveStorage(snapshot.value);

    assert(copied.isOk(), copied.isErr() ? copied.error.message : "");
    for (const objectPath of c.listedObjects) {
      expect(
        fileStorageMock.getObject(objectPath.replace("/Status/", "/Archive/"))
      ).toBe(fileStorageMock.getObject(objectPath));
    }
  });

  it("rejects an occupied destination", async () => {
    const c = await setupMoveFrameV2SourceTest();
    const destinationMountPath = c.sourceObjects[0].replace(
      "/Status/",
      "/Archive/"
    );
    fileStorageMock.setObject(
      path.posix.dirname(destinationMountPath),
      "occupied"
    );

    const snapshot = await inspectFrameSourceMoveStorage({
      destinationMountPath,
      sourceMountPath: c.sourceObjects[0],
    });

    expect(snapshot.isErr() && snapshot.error).toMatchObject({
      code: "conflict",
    });
  });

  it("counts hidden objects toward the source size limit", async () => {
    const c = await setupMoveFrameV2SourceTest();
    const hiddenObject = `${c.sourceMountDirectory}/.cache/large.bin`;
    c.listedObjects.push(hiddenObject);
    c.objectSizes.set(hiddenObject, String(101 * 1024 * 1024));
    fileStorageMock.setObject(hiddenObject, "");

    const snapshot = await inspectFrameSourceMoveStorage({
      destinationMountPath: c.sourceObjects[0].replace("/Status/", "/Archive/"),
      sourceMountPath: c.sourceObjects[0],
    });

    expect(snapshot.isErr() && snapshot.error).toMatchObject({
      code: "invalid_source",
    });
  });

  it("returns a typed copy failure", async () => {
    const c = await setupMoveFrameV2SourceTest();
    fileStorageMock.setCopyFileFails((source) => source === c.sourceObjects[0]);
    const snapshot = await inspectFrameSourceMoveStorage({
      destinationMountPath: c.sourceObjects[0].replace("/Status/", "/Archive/"),
      sourceMountPath: c.sourceObjects[0],
    });
    assert(snapshot.isOk(), snapshot.isErr() ? snapshot.error.message : "");

    const copied = await copyFrameSourceMoveStorage(snapshot.value);

    expect(copied.isErr() && copied.error).toMatchObject({
      code: "copy_failed",
    });
  });
});
