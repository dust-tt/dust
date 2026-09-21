// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const emitMovedAuditLog = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/files/gcs_mount/files", async (importActual) => ({
  ...(await importActual<
    typeof import("@app/lib/api/files/gcs_mount/files")
  >()),
  emitGCSMountFileMovedAuditLog: emitMovedAuditLog,
}));

vi.mock("@app/lib/lock", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/lock")>()),
  executeWithLockResult: async <T>(_name: string, cb: () => Promise<T>) => cb(),
}));

import { DustFileSystem } from "@app/lib/api/file_system";
import { renameCanonicalFile } from "@app/lib/api/files/file_system_ops";
import { setupFrameSourceStorageTest } from "@app/lib/api/frames/source_storage.test_utils";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import assert from "assert";

function mockStorageCopies() {
  const storage = getPrivateUploadBucket();
  vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
  vi.spyOn(storage, "copyFile").mockImplementation(async (source, target) => {
    const content = fileStorageMock.getObject(source);
    if (content !== undefined) {
      fileStorageMock.setObject(target, content);
    }
    return { destinationGeneration: "mock" } as never;
  });
}

async function renameFolder(
  c: Awaited<ReturnType<typeof setupFrameSourceStorageTest>>,
  newFileName: string
) {
  const fsResult = await DustFileSystem.forAgentLoop(c.auth, {
    conversation: c.conversation,
    scopedPaths: [c.sourceDirectoryPath],
  });
  assert(fsResult.isOk(), "Test file system should be available");

  return renameCanonicalFile(
    c.auth,
    fsResult.value,
    c.sourceDirectoryPath,
    newFileName
  );
}

beforeEach(() => {
  fileStorageMock.reset();
  emitMovedAuditLog.mockReset();
  vi.restoreAllMocks();
});

describe("renameCanonicalFile on a Frames v2 package folder", () => {
  it("renames the Frame, keeping its identity and publication", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();

    const renamed = await renameFolder(c, "Health");

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : undefined);
    expect(renamed.value.dest).toBe(
      `conversation-${c.conversation.sId}/Health`
    );

    // The registration follows the folder, so the Frame keeps its id and its active publication.
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    assert(reloaded);
    expect(reloaded.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Health/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded.useCaseMetadata?.activePublicationId).toBe("publication-1");
  });

  it("rejects a name the Frame move would not accept", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();

    const renamed = await renameFolder(c, "   ");

    assert(renamed.isErr());
    expect(renamed.error.code).toBe("invalid_path");
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`
    );
  });

  it("reports an occupied destination as a conflict", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();
    const occupied = c.sourceMountDirectory.replace("/Status", "/Health");
    fileStorageMock.setObject(`${occupied}/index.tsx`, "other");
    c.listedObjects.push(`${occupied}/index.tsx`);

    const renamed = await renameFolder(c, "Health");

    assert(renamed.isErr());
    expect(renamed.error.code).toBe("already_exists");
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`
    );
  });

  it("leaves an ordinary folder to the plain rename", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();
    const plainFolder = `conversation-${c.conversation.sId}/Notes`;
    const plainObject = c.sourceMountDirectory.replace(
      "/Status",
      "/Notes/note.txt"
    );
    fileStorageMock.setObject(plainObject, "note");
    c.listedObjects.push(plainObject);

    const fsResult = await DustFileSystem.forAgentLoop(c.auth, {
      conversation: c.conversation,
      scopedPaths: [plainFolder],
    });
    assert(fsResult.isOk());

    const renamed = await renameCanonicalFile(
      c.auth,
      fsResult.value,
      plainFolder,
      "Archive"
    );

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : undefined);
    // No Frame lives here, so no Frame lock or audit event is taken out.
    expect(emitMovedAuditLog).not.toHaveBeenCalled();
  });
});
