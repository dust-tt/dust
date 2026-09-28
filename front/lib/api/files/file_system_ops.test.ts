// @vitest-environment node

import { DustFileSystem } from "@app/lib/api/file_system";
import {
  moveCanonicalFile,
  renameCanonicalFile,
} from "@app/lib/api/files/file_system_ops";
import { FileResource } from "@app/lib/resources/file_resource";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { getPodFilesBasePath } from "@app/types/mount_path";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  const registerAt = (relativePath: string) =>
    FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: relativePath.split("/").pop() ?? relativePath,
      fileSize: 1,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: projectId },
      mountFilePath: `${basePath}${relativePath}`,
    });

  return { auth, dustFs: fsResult.value, projectId, basePath, registerAt };
}

beforeEach(() => {
  fileStorageMock.reset();
  vi.restoreAllMocks();
});

describe("moveCanonicalFile onto a stale registered path", () => {
  it("releases the stale file and repoints the moved one", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    const moved = await registerAt("a.txt");
    const stale = await registerAt("archive/a.txt");
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

  it("reports a destination claimed during the move as already_exists", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    await registerAt("a.txt");
    await registerAt("archive/a.txt");
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);
    // Simulate another writer claiming the path between the release and the repoint.
    vi.spyOn(FileResource, "releaseMountFilePath").mockResolvedValue(undefined);

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/archive/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("already_exists");
  });
});

describe("renameCanonicalFile onto a stale registered path", () => {
  it("releases the stale file and repoints the renamed one", async () => {
    const { auth, dustFs, projectId, basePath, registerAt } = await setup();
    const renamed = await registerAt("a.txt");
    const stale = await registerAt("b.txt");
    fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);

    const result = await renameCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      "b.txt"
    );

    assert(result.isOk(), result.isErr() ? result.error.message : undefined);
    const [reloadedRenamed] = await FileResource.fetchByMountFilePaths(auth, [
      `${basePath}b.txt`,
    ]);
    expect(reloadedRenamed?.sId).toBe(renamed.sId);
    expect(reloadedRenamed?.fileName).toBe("b.txt");
    const reloadedStale = await FileResource.fetchById(auth, stale.sId);
    expect(reloadedStale?.mountFilePath).toBeNull();
  });
});
