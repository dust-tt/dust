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

import { renameFrameV2 } from "@app/lib/api/frames/rename_source";
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

beforeEach(() => {
  fileStorageMock.reset();
  emitMovedAuditLog.mockReset();
  vi.restoreAllMocks();
});

describe("renameFrameV2", () => {
  it("moves the folder, renames the Frame, and keeps the publication", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();

    const renamed = await renameFrameV2(c.auth, {
      frame: c.frame,
      newName: "Health",
    });

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : undefined);
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    assert(reloaded);
    expect(reloaded.useCaseMetadata?.frameName).toBe("Health");
    expect(reloaded.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Health/${FRAME_MANIFEST_FILE}`
    );
    // A rename must never republish: the active publication is served throughout.
    expect(reloaded.useCaseMetadata?.activePublicationId).toBe("publication-1");
    expect(reloaded.sId).toBe(c.frame.sId);
  });

  it("trims the requested name", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();

    const renamed = await renameFrameV2(c.auth, {
      frame: c.frame,
      newName: "  Health  ",
    });

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : undefined);
    expect(renamed.value.destinationDirectoryPath).toBe(
      `conversation-${c.conversation.sId}/Health`
    );
  });

  it("is a no-op when the name is unchanged", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();

    const renamed = await renameFrameV2(c.auth, {
      frame: c.frame,
      newName: "Status",
    });

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : undefined);
    expect(emitMovedAuditLog).not.toHaveBeenCalled();
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`
    );
  });

  it.each([
    "",
    "   ",
    "a/b",
    "a\\b",
    "..",
    ".",
  ])("rejects the invalid name %j", async (newName) => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();

    const renamed = await renameFrameV2(c.auth, { frame: c.frame, newName });

    expect(renamed.isErr()).toBe(true);
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`
    );
  });

  it("rejects a rename onto an occupied name", async () => {
    const c = await setupFrameSourceStorageTest();
    mockStorageCopies();
    const occupied = c.sourceMountDirectory.replace("/Status", "/Health");
    fileStorageMock.setObject(`${occupied}/index.tsx`, "other");
    c.listedObjects.push(`${occupied}/index.tsx`);

    const renamed = await renameFrameV2(c.auth, {
      frame: c.frame,
      newName: "Health",
    });

    assert(renamed.isErr());
    expect(renamed.error.message).toContain("already exists");
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.toScopedPath(c.auth)).toBe(
      `conversation-${c.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`
    );
  });
});
