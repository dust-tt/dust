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

import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";

const manifest = JSON.stringify({ version: 1, name: "Status" });

async function setup() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
  const sourceMountDirectory = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status`;
  const sourceObjects = [
    `${sourceMountDirectory}/${FRAME_MANIFEST_FILE}`,
    `${sourceMountDirectory}/index.tsx`,
  ];
  const objectSizes = new Map<string, string>();
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifest),
    status: "created",
    useCase: "conversation",
    useCaseMetadata: {
      activePublicationId: "publication-1",
      conversationId: conversation.sId,
    },
    mountFilePath: sourceObjects[0],
  });
  await frame.markFrameV2AsReadyFromMount(auth);
  fileStorageMock.setObject(sourceObjects[0], manifest);
  fileStorageMock.setObject(sourceObjects[1], "ui source");
  fileStorageMock.setFileExists(
    (filePath) => fileStorageMock.getObject(filePath) !== undefined
  );
  const listedObjects = [...sourceObjects];
  fileStorageMock.setFilesByPrefix((prefix) =>
    listedObjects
      .filter(
        (name) =>
          name.startsWith(prefix) &&
          fileStorageMock.getObject(name) !== undefined
      )
      .map((name) => ({
        name,
        metadata: {
          contentType: "text/plain",
          size: objectSizes.get(name) ?? "10",
        },
      }))
  );
  return {
    auth,
    conversation,
    frame,
    listedObjects,
    objectSizes,
    sourceDirectoryPath,
    sourceMountDirectory,
    sourceObjects,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
  emitMovedAuditLog.mockReset();
  vi.restoreAllMocks();
});

describe("moveFrameV2Source", () => {
  it("moves the folder while preserving the Frame identity and publication", async () => {
    const c = await setup();
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
    ).toBe(manifest);
    expect(emitMovedAuditLog).toHaveBeenCalledOnce();
  });

  it("rejects cross-mount moves before looking up a Frame", async () => {
    const c = await setup();
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

  it("requires an empty, nonexistent destination", async () => {
    const c = await setup();
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Taken`;
    const destinationObject = c.sourceObjects[0].replace("/Status/", "/Taken/");
    c.listedObjects.push(destinationObject);
    fileStorageMock.setObject(destinationObject, "occupied");

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
  });

  it("copies hidden, processed, and placeholder objects", async () => {
    const c = await setup();
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Archive`;
    const destinationMountDirectory = c.sourceMountDirectory.replace(
      "/Status",
      "/Archive"
    );
    const additionalObjects = [
      `${c.sourceMountDirectory}/.cache/state.json`,
      `${c.sourceMountDirectory}/report.processed.txt`,
      `${c.sourceMountDirectory}/empty/`,
    ];
    for (const objectPath of additionalObjects) {
      c.listedObjects.push(objectPath);
      fileStorageMock.setObject(objectPath, objectPath);
    }

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    for (const objectPath of additionalObjects) {
      expect(
        fileStorageMock.getObject(
          objectPath.replace(c.sourceMountDirectory, destinationMountDirectory)
        )
      ).toBe(objectPath);
    }
  });

  it("rejects a destination containing only hidden objects", async () => {
    const c = await setup();
    const destinationDirectoryPath = `conversation-${c.conversation.sId}/Taken`;
    const hiddenDestinationObject = c.sourceObjects[0].replace(
      "/Status/manifest.json",
      "/Taken/.cache/state.json"
    );
    c.listedObjects.push(hiddenDestinationObject);
    fileStorageMock.setObject(hiddenDestinationObject, "occupied");

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
  });

  it("counts hidden objects toward the source size limit", async () => {
    const c = await setup();
    const oversizedHiddenObject = `${c.sourceMountDirectory}/.cache/large.bin`;
    c.listedObjects.push(oversizedHiddenObject);
    c.objectSizes.set(oversizedHiddenObject, String(101 * 1024 * 1024));
    fileStorageMock.setObject(oversizedHiddenObject, "");

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath: `conversation-${c.conversation.sId}/Oversized`,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "invalid_source",
    });
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
  });

  it("rejects a source containing a nested registered Frame", async () => {
    const c = await setup();
    const nestedManifestPath = `${c.sourceMountDirectory}/Nested/${FRAME_MANIFEST_FILE}`;
    const nestedFrame = await FileFactory.create(c.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: c.conversation.sId },
      mountFilePath: nestedManifestPath,
    });
    await nestedFrame.markFrameV2AsReadyFromMount(c.auth);
    c.listedObjects.push(nestedManifestPath);
    fileStorageMock.setObject(nestedManifestPath, manifest);

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
    expect(
      fileStorageMock.getObject(
        c.sourceObjects[0].replace("/Status/", "/ParentMoved/")
      )
    ).toBeUndefined();
  });

  it("returns a typed copy failure while the source identity stays authoritative", async () => {
    const c = await setup();
    fileStorageMock.setCopyFileFails((source) =>
      source.endsWith(FRAME_MANIFEST_FILE)
    );

    const moved = await moveFrameV2Source(c.auth, {
      conversation: c.conversation,
      destinationDirectoryPath: `conversation-${c.conversation.sId}/CopyFail`,
      sourceDirectoryPath: c.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "copy_failed",
    });
    expect((await c.frame.fetchFreshFrameV2(c.auth))?.mountFilePath).toBe(
      c.sourceObjects[0]
    );
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBe(manifest);
  });

  it("returns a typed commit failure without deleting the source", async () => {
    const c = await setup();
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
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBe(manifest);
  });

  it("reports source cleanup failure after committing the destination", async () => {
    const c = await setup();
    fileStorageMock.setOnDeleteByPrefix(() => {
      throw new Error("delete failed");
    });
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
    expect(fileStorageMock.getObject(c.sourceObjects[0])).toBe(manifest);
  });
});
