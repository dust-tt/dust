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
  executeWithLockResult: async <T>(_name: string, cb: () => Promise<T>) => cb(),
}));

import { DustFileSystem } from "@app/lib/api/file_system";
import { renameCanonicalFile } from "@app/lib/api/files/file_system_ops";
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
  vi.restoreAllMocks();
});

async function setupFrameRename() {
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
  const fsResult = await DustFileSystem.fromScopedPath(
    c.auth,
    c.sourceDirectoryPath
  );
  assert(fsResult.isOk(), fsResult.isErr() ? fsResult.error.message : "");
  return { ...c, dustFs: fsResult.value };
}

describe("renameCanonicalFile", () => {
  it("renames a registered Frame source folder through the Frame move", async () => {
    const c = await setupFrameRename();

    const renamed = await renameCanonicalFile(
      c.auth,
      c.dustFs,
      c.sourceDirectoryPath,
      "Renamed"
    );

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : "");
    expect(renamed.value).toEqual({
      dest: `conversation-${c.conversation.sId}/Renamed`,
      sourceDeletionFailed: false,
    });

    const destinationMountDirectory = c.sourceMountDirectory.replace(
      "/Status",
      "/Renamed"
    );
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.mountFilePath).toBe(
      `${destinationMountDirectory}/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.fileName).toBe(FRAME_MANIFEST_FILE);
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBeUndefined();
    expect(
      fileStorageMock.getObject(
        `${destinationMountDirectory}/${FRAME_MANIFEST_FILE}`
      )
    ).toBe(frameManifest);
  });

  it("rejects a Frame name containing a path separator", async () => {
    const c = await setupFrameRename();

    const renamed = await renameCanonicalFile(
      c.auth,
      c.dustFs,
      c.sourceDirectoryPath,
      "nested/Renamed"
    );

    expect(renamed.isErr() && renamed.error).toMatchObject({
      code: "invalid_path",
    });
    const reloaded = await FileResource.fetchById(c.auth, c.frame.sId);
    expect(reloaded?.mountFilePath).toBe(c.sourceObjects[0]);
  });

  it("no-ops when the Frame keeps its name", async () => {
    const c = await setupFrameRename();

    const renamed = await renameCanonicalFile(
      c.auth,
      c.dustFs,
      c.sourceDirectoryPath,
      "Status"
    );

    assert(renamed.isOk(), renamed.isErr() ? renamed.error.message : "");
    expect(renamed.value.dest).toBe(c.sourceDirectoryPath);
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBe(frameManifest);
  });
});
