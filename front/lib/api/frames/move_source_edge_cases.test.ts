// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteFrameSourceStorage = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/files/gcs_mount/files", async (importActual) => ({
  ...(await importActual<
    typeof import("@app/lib/api/files/gcs_mount/files")
  >()),
  emitGCSMountFileMovedAuditLog: vi.fn(),
}));

vi.mock("@app/lib/lock", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/lock")>()),
  executeWithLockResult: async <T>(_name: string, cb: () => Promise<T>) => cb(),
}));

vi.mock("@app/lib/api/frames/source_storage", async (importActual) => ({
  ...(await importActual<
    typeof import("@app/lib/api/frames/source_storage")
  >()),
  deleteFrameSourceStorage,
}));

import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import {
  frameManifest,
  setupFrameSourceStorageTest,
} from "@app/lib/api/frames/source_storage.test_utils";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { Err } from "@app/types/shared/result";
import assert from "assert";

beforeEach(() => {
  fileStorageMock.reset();
  vi.restoreAllMocks();
  deleteFrameSourceStorage.mockReset();
  deleteFrameSourceStorage.mockResolvedValue(
    new Err(new Error("delete failed"))
  );
});

describe("moveFrameV2Source edge cases", () => {
  it("rejects cross-mount moves before looking up a Frame", async () => {
    const c = await setupFrameSourceStorageTest();
    const lookup = vi.spyOn(FileResource, "fetchByMountFilePaths");

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath: "pod-pod_123/Status",
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "invalid_source",
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a source containing a nested registered Frame", async () => {
    const c = await setupFrameSourceStorageTest();
    const nestedManifestPath = `${c.sourceMountDirectory}/Nested/${FRAME_MANIFEST_FILE}`;
    const nestedFrame = await FileFactory.create(c.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(frameManifest),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: c.conversation.sId },
      mountFilePath: nestedManifestPath,
    });
    await nestedFrame.markFrameV2AsReadyFromMount(c.auth);
    c.listedObjects.push(nestedManifestPath);
    fileStorageMock.setObject(nestedManifestPath, frameManifest);

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath: `conversation-${c.conversation.sId}/ParentMoved`,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    expect((await nestedFrame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      nestedManifestPath
    );
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
  });

  it("does not delete the source after a typed commit failure", async () => {
    const c = await setupFrameSourceStorageTest();
    vi.spyOn(FileResource.prototype, "updateMount").mockRejectedValueOnce(
      new Error("database unavailable")
    );

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath: `conversation-${c.conversation.sId}/CommitFail`,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "commit_failed",
    });
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBe(frameManifest);
    expect(deleteFrameSourceStorage).not.toHaveBeenCalled();
  });

  it("reports source cleanup failure after committing the destination", async () => {
    const c = await setupFrameSourceStorageTest();
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Moved`;

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
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBe(frameManifest);
  });
});
