// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const emitMovedAuditLog = vi.hoisted(() => vi.fn());
const lockEvents = vi.hoisted(() => [] as string[]);

vi.mock("@app/lib/api/files/gcs_mount/files", async (importActual) => ({
  ...(await importActual<
    typeof import("@app/lib/api/files/gcs_mount/files")
  >()),
  emitGCSMountFileMovedAuditLog: emitMovedAuditLog,
}));

vi.mock("@app/lib/lock", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/lock")>()),
  executeWithLockResult: async <T>(name: string, cb: () => Promise<T>) => {
    lockEvents.push(`acquire:${name}`);
    const result = await cb();
    lockEvents.push(`release:${name}`);
    return result;
  },
}));

import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import {
  getFramePublishLockName,
  getFrameSourceLockName,
  getFrameWorkspaceSourceLockName,
} from "@app/lib/api/frames/operation_lock";
import {
  frameManifest,
  setupFrameSourceStorageTest,
} from "@app/lib/api/frames/source_storage.test_utils";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import assert from "assert";

beforeEach(() => {
  fileStorageMock.reset();
  emitMovedAuditLog.mockReset();
  lockEvents.length = 0;
  vi.restoreAllMocks();
});

describe("moveFrameV2Source", () => {
  it("moves the folder while preserving the Frame identity and publication", async () => {
    const c = await setupFrameSourceStorageTest();
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
    vi.spyOn(storage, "copyFile").mockImplementation(async (source, target) => {
      const content = fileStorageMock.getObject(source);
      if (content !== undefined) {
        fileStorageMock.setObject(target, content);
      }
      return { destinationGeneration: "mock" } as never;
    });
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Archive/Renamed`;
    const destinationMountDirectory = c.sourceMountDirectory.replace(
      "/Status",
      "/Archive/Renamed"
    );

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(moved.value).toEqual({
      destinationDirectoryPath,
      frameId: c.frame.sId,
      sourceDeletionFailed: false,
    });
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.mountFilePath).toBe(
      `${destinationMountDirectory}/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      conversationId: c.conversation.sId,
    });
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBeUndefined();
    expect(
      fileStorageMock.getObject(
        `${destinationMountDirectory}/${FRAME_MANIFEST_FILE}`
      )
    ).toBe(frameManifest);
    expect(emitMovedAuditLog).toHaveBeenCalledOnce();
    expect(lockEvents).toEqual([
      `acquire:${getFrameSourceLockName(c.frame.sId)}`,
      `acquire:${getFrameWorkspaceSourceLockName(c.workspace.sId)}`,
      `acquire:${getFramePublishLockName(c.frame.sId)}`,
      `release:${getFramePublishLockName(c.frame.sId)}`,
      `release:${getFrameWorkspaceSourceLockName(c.workspace.sId)}`,
      `release:${getFrameSourceLockName(c.frame.sId)}`,
    ]);
  });
});
