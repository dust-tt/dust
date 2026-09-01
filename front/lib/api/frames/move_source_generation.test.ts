// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/files/gcs_mount/files", async (importActual) => ({
  ...(await importActual<
    typeof import("@app/lib/api/files/gcs_mount/files")
  >()),
  emitGCSMountFileMovedAuditLog: vi.fn(),
}));

vi.mock("@app/lib/lock", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/lock")>()),
  executeWithRenewingLockResult: async <T>(
    _name: string,
    cb: (lease: never) => Promise<T>
  ) => cb({ check: vi.fn() } as never),
}));

import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import { setupFrameSourceStorageTest } from "@app/lib/api/frames/source_storage.test_utils";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import assert from "assert";

beforeEach(() => {
  fileStorageMock.reset();
  vi.restoreAllMocks();
});

describe("moveFrameV2Source generation fencing", () => {
  it("does not overwrite a destination created after the initial check", async () => {
    const c = await setupFrameSourceStorageTest();
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Collision`;
    const destinationObject = c.sourceObjects[0].replace(
      "/Status/",
      "/Collision/"
    );
    fileStorageMock.setObject(destinationObject, "concurrent destination");

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    expect(fileStorageMock.getObject(destinationObject)).toBe(
      "concurrent destination"
    );
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
  });

  it("copies pinned generations and preserves concurrent source writes", async () => {
    const c = await setupFrameSourceStorageTest();
    const sourceUiPath = c.sourceObjects[1];
    const concurrentSourcePath = `${c.sourceMountDirectory}/new.ts`;
    fileStorageMock.setAfterCopyFile((sourcePath) => {
      if (sourcePath === c.sourceObjects[0]) {
        fileStorageMock.setObject(sourceUiPath, "concurrent edit");
        fileStorageMock.setObject(concurrentSourcePath, "new source");
      }
    });
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Moved`;
    const destinationUiPath = sourceUiPath.replace("/Status/", "/Moved/");

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(moved.value.sourceDeletionFailed).toBe(true);
    expect(
      (await c.frame.fetchFreshFrameV2(c.auth))?.toScopedPath(c.auth)
    ).toBe(`${destinationDirectoryPath}/${FRAME_MANIFEST_FILE}`);
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBeUndefined();
    expect(fileStorageMock.getObject(sourceUiPath)).toBe("concurrent edit");
    expect(fileStorageMock.getObject(concurrentSourcePath)).toBe("new source");
    expect(fileStorageMock.getObject(destinationUiPath)).toBe("ui source");
  });
});
