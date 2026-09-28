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

  const moved = await registerAt("a.txt");
  // The destination is claimed by a row whose bytes are gone: only the source has bytes.
  await registerAt("archive/a.txt");
  await registerAt("b.txt");
  fileStorageMock.setFileExists((p) => p === `${basePath}a.txt`);

  const storage = getPrivateUploadBucket();
  vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
  const copyFile = vi.spyOn(storage, "copyFile");
  copyFile.mockClear();

  return { auth, dustFs: fsResult.value, projectId, basePath, moved, copyFile };
}

beforeEach(() => {
  fileStorageMock.reset();
  vi.restoreAllMocks();
});

describe("moving onto a path a FileResource still claims", () => {
  it("moveCanonicalFile refuses with already_exists and moves nothing", async () => {
    const { auth, dustFs, projectId, basePath, moved, copyFile } =
      await setup();

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/archive/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("already_exists");
    expect(copyFile).not.toHaveBeenCalled();
    const reloaded = await FileResource.fetchById(auth, moved.sId);
    expect(reloaded?.mountFilePath).toBe(`${basePath}a.txt`);
  });

  it("moveCanonicalFile refuses an unnormalized spelling of a registered path", async () => {
    const { auth, dustFs, projectId, copyFile } = await setup();

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `pod-${projectId}/dir/../archive/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("already_exists");
    expect(copyFile).not.toHaveBeenCalled();
  });

  it("moveCanonicalFile rejects a destination escaping the namespace", async () => {
    const { auth, dustFs, projectId, copyFile } = await setup();

    const result = await moveCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      `../pod-${projectId}/a.txt`
    );

    assert(result.isErr());
    expect(result.error.code).toBe("invalid_path");
    expect(copyFile).not.toHaveBeenCalled();
  });

  it("renameCanonicalFile refuses with already_exists and moves nothing", async () => {
    const { auth, dustFs, projectId, basePath, moved, copyFile } =
      await setup();

    const result = await renameCanonicalFile(
      auth,
      dustFs,
      `pod-${projectId}/a.txt`,
      "b.txt"
    );

    assert(result.isErr());
    expect(result.error.code).toBe("already_exists");
    expect(copyFile).not.toHaveBeenCalled();
    const reloaded = await FileResource.fetchById(auth, moved.sId);
    expect(reloaded?.mountFilePath).toBe(`${basePath}a.txt`);
    expect(reloaded?.fileName).toBe("a.txt");
  });
});
