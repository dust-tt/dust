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

import { DustFileSystem } from "@app/lib/api/file_system";
import {
  moveFrameV2Source,
  moveFrameV2SourceUsingFileSystem,
} from "@app/lib/api/frames/move_source";
import {
  getFramePublishLockName,
  getFrameSourceLockName,
} from "@app/lib/api/frames/operation_lock";
import {
  frameManifest,
  setupFrameSourceStorageTest,
} from "@app/lib/api/frames/source_storage.test_utils";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getPodFilesBasePath } from "@app/types/mount_path";
import { DEFAULT_POD_FILE_TAB_ICON } from "@app/types/pod_file_tab";
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
      `acquire:${getFramePublishLockName(c.frame.sId)}`,
      `release:${getFramePublishLockName(c.frame.sId)}`,
      `release:${getFrameSourceLockName(c.frame.sId)}`,
    ]);
  });

  it("repoints Pod tabs and the pinned Frame when moving a Pod Frame", async () => {
    const { globalGroup, user, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(space, globalGroup, "project_editor");
    // Group grants are resolved when the authenticator is built, so build it after attaching.
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    assert(auth);

    const sourceDirectoryPath = `pod-${space.sId}/Status`;
    const destinationDirectoryPath = `pod-${space.sId}/Renamed`;
    const sourceManifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const destinationManifestPath = `${destinationDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const podFilesBasePath = getPodFilesBasePath({
      workspaceId: workspace.sId,
      podId: space.sId,
    });
    const sourceObjects = [
      `${podFilesBasePath}Status/${FRAME_MANIFEST_FILE}`,
      `${podFilesBasePath}Status/index.tsx`,
    ];
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(frameManifest),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: sourceObjects[0],
    });
    await frame.markFrameV2AsReadyFromMount(auth);
    fileStorageMock.setObject(sourceObjects[0], frameManifest);
    fileStorageMock.setObject(sourceObjects[1], "ui source");
    fileStorageMock.setFileExists(
      (filePath) => fileStorageMock.getObject(filePath) !== undefined
    );
    fileStorageMock.setFilesByPrefix((prefix) =>
      sourceObjects
        .filter(
          (name) =>
            name.startsWith(prefix) &&
            fileStorageMock.getObject(name) !== undefined
        )
        .map((name) => ({
          name,
          metadata: { contentType: "text/plain", size: "10" },
        }))
    );
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
    vi.spyOn(storage, "copyFile").mockImplementation(async (source, target) => {
      const content = fileStorageMock.getObject(source);
      if (content !== undefined) {
        fileStorageMock.setObject(target, content);
      }
      return { destinationGeneration: "mock" } as never;
    });

    await ProjectMetadataResource.makeNew(auth, space, {
      pinnedFramePath: sourceManifestPath,
      frameTabs: [
        {
          path: sourceManifestPath,
          title: "Status",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      tabsOrder: ["files", sourceManifestPath],
    });

    const fsResult = await DustFileSystem.forPod(auth, space);
    assert(fsResult.isOk(), fsResult.isErr() ? fsResult.error.message : "");

    const moved = await moveFrameV2SourceUsingFileSystem(auth, {
      destinationDirectoryPath,
      dustFs: fsResult.value,
      sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.mountFilePath).toBe(
      `${podFilesBasePath}Renamed/${FRAME_MANIFEST_FILE}`
    );
    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    expect(metadata?.pinnedFramePath).toBe(destinationManifestPath);
    expect(metadata?.frameTabs?.map((tab) => tab.path)).toEqual([
      destinationManifestPath,
    ]);
    expect(metadata?.tabsOrder).toEqual(["files", destinationManifestPath]);
  });
});
