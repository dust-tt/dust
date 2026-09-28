// @vitest-environment node

import { DustFileSystem } from "@app/lib/api/file_system";
import {
  moveCanonicalFile,
  renameCanonicalFile,
} from "@app/lib/api/files/file_system_ops";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { getPodFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STALE_AGE_MS = 10 * 60 * 1000;

async function setup() {
  const { auth, conversation, projectId } = await setupProjectConversation();
  const basePath = getPodFilesBasePath({
    workspaceId: auth.getNonNullableWorkspace().sId,
    podId: projectId,
  });

  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation: conversation.toJSON(),
    scopedPaths: [`pod-${projectId}/a.txt`],
  });
  assert(fsResult.isOk(), "Test file system should be available");

  // A row registered `ageMs` ago. Uploads claim their path right before copying bytes, so only an
  // old registration counts as stale.
  const registerAt = async (relativePath: string, { ageMs = 0 } = {}) => {
    const registeredAt = new Date(Date.now() - ageMs);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(registeredAt);
    try {
      return await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: relativePath.split("/").pop() ?? relativePath,
        fileSize: 1,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: projectId },
        mountFilePath: `${basePath}${relativePath}`,
      });
    } finally {
      vi.useRealTimers();
    }
  };

  return { auth, dustFs: fsResult.value, projectId, basePath, registerAt };
}

beforeEach(() => {
  fileStorageMock.reset();
  vi.restoreAllMocks();
});

describe("moveCanonicalFile onto a registered path", () => {
  it("releases a stale registration and repoints the moved file", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    const moved = await registerAt("a.txt");
    const stale = await registerAt("archive/a.txt", { ageMs: STALE_AGE_MS });
    // Only the source has bytes: the stale file's mount object is gone.
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/archive/a.txt`
    );

    assert(result.isOk(), result.isErr() ? result.error.message : undefined);
    const [reloadedMoved] = await FileResource.fetchByMountFilePaths(auth, [
      `${basePath}archive/a.txt`,
    ]);
    expect(reloadedMoved?.sId).toBe(moved.sId);
    const reloadedStale = await FileResource.fetchById(auth, stale.sId);
    expect(reloadedStale?.mountFilePath).toBeNull();
  });

  it("treats a fresh registration as a pending upload and moves nothing", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    const moved = await registerAt("a.txt");
    const pending = await registerAt("archive/a.txt");
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
    const copyFile = vi.spyOn(storage, "copyFile");
    copyFile.mockClear();

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/archive/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("already_exists");
    expect(copyFile).not.toHaveBeenCalled();
    const reloadedMoved = await FileResource.fetchById(auth, moved.sId);
    expect(reloadedMoved?.mountFilePath).toBe(`${basePath}a.txt`);
    const reloadedPending = await FileResource.fetchById(auth, pending.sId);
    expect(reloadedPending?.mountFilePath).toBe(`${basePath}archive/a.txt`);
  });

  it("refuses a destination claimed between the reservation and the move, before any bytes move", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    await registerAt("a.txt");
    await registerAt("archive/a.txt");
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
    const copyFile = vi.spyOn(storage, "copyFile");
    copyFile.mockClear();
    // Simulate another writer claiming the path right after the reservation.
    vi.spyOn(FileResource, "releaseStaleMountFilePath").mockResolvedValue(
      new Ok(undefined)
    );

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/archive/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("already_exists");
    expect(copyFile).not.toHaveBeenCalled();
  });

  it("restores the registration when the bytes fail to move", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    const moved = await registerAt("a.txt");
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);
    fileStorageMock.setCopyFileFails((src) => src === `${basePath}a.txt`);

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/archive/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("internal");
    const reloadedMoved = await FileResource.fetchById(auth, moved.sId);
    expect(reloadedMoved?.mountFilePath).toBe(`${basePath}a.txt`);
    expect(reloadedMoved?.fileName).toBe("a.txt");
  });
});

describe("renameCanonicalFile onto a registered path", () => {
  it("releases a stale registration and repoints the renamed file", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    const renamed = await registerAt("a.txt");
    const stale = await registerAt("b.txt", { ageMs: STALE_AGE_MS });
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);

    const result = await renameCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      "b.txt"
    );

    assert(result.isOk(), result.isErr() ? result.error.message : undefined);
    expect(result.value.dest).toBe(`pod-${projectId}/b.txt`);
    const [reloadedRenamed] = await FileResource.fetchByMountFilePaths(auth, [
      `${basePath}b.txt`,
    ]);
    expect(reloadedRenamed?.sId).toBe(renamed.sId);
    expect(reloadedRenamed?.fileName).toBe("b.txt");
    const reloadedStale = await FileResource.fetchById(auth, stale.sId);
    expect(reloadedStale?.mountFilePath).toBeNull();
  });

  it("rejects a name with a path separator", async () => {
    const { auth, dustFs, projectId } = await setup();

    const result = await renameCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      "sub/b.txt"
    );

    assert(result.isErr());
    expect(result.error.code).toBe("invalid_path");
  });
});
