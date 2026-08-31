// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitGCSMountFileMovedAuditLogMock } = vi.hoisted(() => ({
  emitGCSMountFileMovedAuditLogMock: vi.fn(),
}));

vi.mock("@app/lib/api/files/gcs_mount/files", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/files/gcs_mount/files")>();
  return {
    ...actual,
    emitGCSMountFileMovedAuditLog: emitGCSMountFileMovedAuditLogMock,
  };
});

vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async <T>(_key: string, callback: () => Promise<T>) =>
      callback(),
  };
});

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

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const moveIdMetadataKey = "dust_frame_source_move_id";

async function setup() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
  const sourceGcsDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status`;
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
    mountFilePath: `${sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });
  await frame.markFrameV2AsReadyFromMount(auth);

  const sourceManifestPath = `${sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const sourceUiPath = `${sourceGcsDirectoryPath}/index.tsx`;
  fileStorageMock.setObject(sourceManifestPath, manifest);
  fileStorageMock.setObject(sourceUiPath, "ui source");
  fileStorageMock.setFileExists(() => false);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${sourceGcsDirectoryPath}/`
      ? [
          {
            name: sourceManifestPath,
            metadata: {
              contentType: frameV2ContentType,
              generation: "1",
              md5Hash: "manifest",
              size: String(Buffer.byteLength(manifest)),
            },
          },
          {
            name: sourceUiPath,
            metadata: {
              contentType: "text/typescript",
              generation: "2",
              md5Hash: "ui",
              size: "1",
            },
          },
        ].filter(({ name }) => fileStorageMock.getObject(name) !== undefined)
      : null
  );

  return {
    auth,
    conversation,
    frame,
    sourceDirectoryPath,
    sourceGcsDirectoryPath,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
  emitGCSMountFileMovedAuditLogMock.mockClear();
  vi.restoreAllMocks();
});

describe("moveFrameV2Source", () => {
  it("moves within one scope without replacing identity, publication, or sharing", async () => {
    const context = await setup();
    const beforeShare = await context.frame.getShareInfo();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Archive/Renamed`;

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(moved.value).toEqual({
      destinationDirectoryPath,
      frameId: context.frame.sId,
      sourceDeletionFailed: false,
    });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded).toMatchObject({
      sId: context.frame.sId,
      useCase: "conversation",
    });
    expect(reloaded?.mountFilePath).toBe(
      `${getConversationFilesBasePath({
        workspaceId: context.workspace.sId,
        conversationId: context.conversation.sId,
      })}Archive/Renamed/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      conversationId: context.conversation.sId,
    });
    await expect(reloaded?.getShareInfo()).resolves.toEqual(beforeShare);
    expect(emitGCSMountFileMovedAuditLogMock).toHaveBeenCalledWith(
      context.auth,
      {
        conversationId: context.conversation.sId,
        useCase: "conversation",
      },
      {
        parentRelativePath: "Archive",
        relativeFilePath: "Status",
      }
    );
  });

  it("does not move a registered Frame whose source manifest is missing", async () => {
    const context = await setup();
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === `${context.sourceGcsDirectoryPath}/`
        ? [
            {
              name: sourceUiPath,
              metadata: {
                contentType: "text/typescript",
                generation: "2",
                md5Hash: "ui",
                size: "1",
              },
            },
          ]
        : null
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath: `conversation-${context.conversation.sId}/MissingManifest`,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "invalid_source",
    });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(
      `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
  });

  it("rejects cross-mount moves before looking up a Frame", async () => {
    const context = await setup();
    const fetchFrames = vi.spyOn(FileResource, "fetchByMountFilePaths");

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath: "pod-pod_123/Status",
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "invalid_source",
    });
    expect(fetchFrames).not.toHaveBeenCalled();
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(
      `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
  });

  it("moves within another conversation when the caller can access its mount", async () => {
    const context = await setup();
    const otherConversation = await ConversationFactory.create(context.auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const otherSourceDirectoryPath = `conversation-${otherConversation.sId}/Status`;
    const otherSourceGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: otherConversation.sId,
    })}Status`;
    const otherSourceManifestPath = `${otherSourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const otherSourceUiPath = `${otherSourceGcsDirectoryPath}/index.tsx`;
    const otherFrame = await FileFactory.create(context.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: otherConversation.sId },
      mountFilePath: otherSourceManifestPath,
    });
    await otherFrame.markFrameV2AsReadyFromMount(context.auth);
    fileStorageMock.setObject(otherSourceManifestPath, manifest);
    fileStorageMock.setObject(otherSourceUiPath, "ui source");
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === `${otherSourceGcsDirectoryPath}/`
        ? [
            {
              name: otherSourceManifestPath,
              metadata: {
                contentType: frameV2ContentType,
                generation: "3",
                size: String(Buffer.byteLength(manifest)),
              },
            },
            {
              name: otherSourceUiPath,
              metadata: {
                contentType: "text/typescript",
                generation: "4",
                size: "9",
              },
            },
          ].filter(({ name }) => fileStorageMock.getObject(name) !== undefined)
        : null
    );
    const destinationDirectoryPath = `conversation-${otherConversation.sId}/Renamed`;

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: otherSourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(moved.value).toMatchObject({
      destinationDirectoryPath,
      frameId: otherFrame.sId,
    });
  });
  it("does not overwrite a destination object created during the move", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Collision`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Collision`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    fileStorageMock.setObject(destinationManifestPath, "raw destination");
    fileStorageMock.setFileMetadata((filePath) =>
      filePath === destinationManifestPath
        ? {
            contentType: frameV2ContentType,
            generation: "1",
            md5Hash: "raw",
            size: "15",
          }
        : null
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(
      `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(
      "raw destination"
    );
    expect(fileStorageMock.deleteCalls).not.toContainEqual(
      expect.objectContaining({ filePath: destinationManifestPath })
    );
    expect(fileStorageMock.deleteCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.objectContaining({
            ifGenerationMatch: expect.any(String),
          }),
        }),
      ])
    );
  });

  it.each([
    { label: "missing", metadata: undefined },
    {
      label: "different",
      metadata: { [moveIdMetadataKey]: "another-operation" },
    },
  ])("does not adopt same-byte destination objects with a $label ownership marker", async ({
    metadata,
  }) => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/MatchingCollision`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}MatchingCollision`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    fileStorageMock.setObject(destinationManifestPath, manifest, metadata);
    fileStorageMock.setFileMetadata((filePath) =>
      filePath === destinationManifestPath
        ? {
            contentType: frameV2ContentType,
            generation: "3",
            md5Hash: "manifest",
            metadata,
            size: String(Buffer.byteLength(manifest)),
          }
        : null
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(manifest);
    expect(fileStorageMock.deleteCalls).not.toContainEqual(
      expect.objectContaining({ filePath: destinationManifestPath })
    );
  });

  it("claims a marker-owned generation after a committed copy response is lost", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Ambiguous`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Ambiguous`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    let lostResponse = false;
    fileStorageMock.setCopyFileCommitsThenFails(
      (_sourcePath, destinationPath) => {
        if (!lostResponse && destinationPath === destinationManifestPath) {
          lostResponse = true;
          return true;
        }
        return false;
      }
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(lostResponse).toBe(true);
    expect(fileStorageMock.metadataCalls).toContain(destinationManifestPath);
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(manifest);
  });

  it("does not move over a destination-only object created during the move", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/UnexpectedCollision`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}UnexpectedCollision`;
    const destinationExtraPath = `${destinationGcsDirectoryPath}/extra.ts`;
    const sourceManifestPath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    let destinationListings = 0;
    fileStorageMock.setFilesByPrefix((prefix) => {
      if (prefix === `${context.sourceGcsDirectoryPath}/`) {
        return [
          {
            name: sourceManifestPath,
            metadata: {
              contentType: frameV2ContentType,
              generation: "1",
              md5Hash: "manifest",
              size: String(Buffer.byteLength(manifest)),
            },
          },
          {
            name: sourceUiPath,
            metadata: {
              contentType: "text/typescript",
              generation: "2",
              md5Hash: "ui",
              size: "1",
            },
          },
        ];
      }
      if (prefix === `${destinationGcsDirectoryPath}/`) {
        destinationListings++;
        return destinationListings === 1
          ? []
          : [
              {
                name: destinationExtraPath,
                metadata: {
                  contentType: "text/typescript",
                  generation: "3",
                  md5Hash: "extra",
                  size: "1",
                },
              },
            ];
      }
      return null;
    });

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "conflict" });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(
      `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
    expect(fileStorageMock.deleteCalls).not.toContainEqual(
      expect.objectContaining({ filePath: destinationExtraPath })
    );
  });

  it("copies pinned source generations and preserves concurrent edits", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Edited`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Edited`;
    const sourceManifestPath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    const newSourcePath = `${context.sourceGcsDirectoryPath}/new.ts`;
    let sourceListings = 0;
    fileStorageMock.setFilesByPrefix((prefix) => {
      if (prefix !== `${context.sourceGcsDirectoryPath}/`) {
        return null;
      }
      sourceListings++;
      if (sourceListings === 1) {
        const snapshot = [
          {
            name: sourceManifestPath,
            metadata: {
              contentType: frameV2ContentType,
              generation: "1",
              md5Hash: "manifest",
              size: String(Buffer.byteLength(manifest)),
            },
          },
          {
            name: sourceUiPath,
            metadata: {
              contentType: "text/typescript",
              generation: "2",
              md5Hash: "ui",
              size: "1",
            },
          },
        ];
        fileStorageMock.setObject(sourceUiPath, "edited ui");
        fileStorageMock.setObject(newSourcePath, "new source");
        return snapshot;
      }
      return [sourceManifestPath, sourceUiPath, newSourcePath]
        .filter((filePath) => fileStorageMock.getObject(filePath) !== undefined)
        .map((filePath) => ({ name: filePath, metadata: {} }));
    });

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(moved.value.sourceDeletionFailed).toBe(true);
    expect(
      fileStorageMock.getObject(`${destinationGcsDirectoryPath}/index.tsx`)
    ).toBe("ui source");
    expect(fileStorageMock.getObject(sourceUiPath)).toBe("edited ui");
    expect(fileStorageMock.getObject(newSourcePath)).toBe("new source");
    expect(fileStorageMock.getObject(sourceManifestPath)).toBeUndefined();
  });

  it("does not delete a destination generation overwritten after copy", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Overwritten`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Overwritten`;
    const destinationUiPath = `${destinationGcsDirectoryPath}/index.tsx`;
    fileStorageMock.setAfterCopyFile((_sourcePath, destinationPath) => {
      if (destinationPath === destinationUiPath) {
        fileStorageMock.setObject(
          destinationPath,
          "concurrent destination edit"
        );
      }
    });
    const updateMount = FileResource.prototype.updateMount;
    let updateMountCalls = 0;
    vi.spyOn(FileResource.prototype, "updateMount").mockImplementation(
      function (this: FileResource, args) {
        updateMountCalls++;
        if (updateMountCalls === 2) {
          return Promise.reject(
            new Error("Simulated final Frame update failure")
          );
        }
        return updateMount.call(this, args);
      }
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "internal" });
    expect(fileStorageMock.getObject(destinationUiPath)).toBe(
      "concurrent destination edit"
    );
    expect(fileStorageMock.deleteCalls).toContainEqual(
      expect.objectContaining({
        filePath: destinationUiPath,
        options: expect.objectContaining({
          ifGenerationMatch: expect.any(String),
        }),
      })
    );
  });

  it("keeps the recovery reservation when exact-generation cleanup fails", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Retry`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Retry`;
    const destinationMountFilePath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    fileStorageMock.setCopyFileFails((sourcePath) =>
      sourcePath.endsWith(`/${FRAME_MANIFEST_FILE}`)
    );
    fileStorageMock.setDeleteFails((filePath) =>
      filePath.endsWith("/index.tsx")
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "internal" });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(destinationMountFilePath);
    expect(reloaded?.useCaseMetadata?.pendingFrameSourceMove).toEqual({
      destinationMountFilePath,
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      sourceMountFilePath: `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    });
    expect(fileStorageMock.deleteCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: `${destinationGcsDirectoryPath}/index.tsx`,
          options: expect.objectContaining({
            ifGenerationMatch: expect.any(String),
          }),
        }),
      ])
    );
  });

  it("keeps matching recovery objects reserved until a retry succeeds", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/RecoveryRollback`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}RecoveryRollback`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const destinationMountFilePath = destinationManifestPath;
    const sourceMountFilePath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    await context.frame.updateMount({
      destFileName: FRAME_MANIFEST_FILE,
      destMountFilePath: destinationMountFilePath,
      destUseCase: "conversation",
      destUseCaseMetadata: {
        activePublicationId: "publication-1",
        conversationId: context.conversation.sId,
        pendingFrameSourceMove: {
          destinationMountFilePath,
          operationId: "move-recovery",
          sourceMountFilePath,
        },
      },
    });
    fileStorageMock.setObject(destinationManifestPath, manifest, {
      [moveIdMetadataKey]: "move-recovery",
    });
    fileStorageMock.setFilesByPrefix((prefix) => {
      if (prefix === `${context.sourceGcsDirectoryPath}/`) {
        return [
          {
            name: sourceMountFilePath,
            metadata: {
              contentType: frameV2ContentType,
              generation: "1",
              md5Hash: "manifest",
              size: String(Buffer.byteLength(manifest)),
            },
          },
          {
            name: `${context.sourceGcsDirectoryPath}/index.tsx`,
            metadata: {
              contentType: "text/typescript",
              generation: "2",
              md5Hash: "ui",
              size: "1",
            },
          },
        ].filter(({ name }) => fileStorageMock.getObject(name) !== undefined);
      }
      if (prefix === `${destinationGcsDirectoryPath}/`) {
        return [
          {
            name: destinationManifestPath,
            metadata: {
              contentType: frameV2ContentType,
              generation: "3",
              md5Hash: "manifest",
              metadata: { [moveIdMetadataKey]: "move-recovery" },
              size: String(Buffer.byteLength(manifest)),
            },
          },
        ].filter(({ name }) => fileStorageMock.getObject(name) !== undefined);
      }
      return null;
    });
    const updateMount = FileResource.prototype.updateMount;
    let updateMountCalls = 0;
    vi.spyOn(FileResource.prototype, "updateMount").mockImplementation(
      function (this: FileResource, args) {
        updateMountCalls++;
        if (updateMountCalls === 1) {
          return Promise.reject(
            new Error("Simulated final Frame update failure")
          );
        }
        return updateMount.call(this, args);
      }
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "internal" });
    expect(fileStorageMock.getObject(destinationManifestPath)).toBeUndefined();
    expect(fileStorageMock.deleteCalls).toContainEqual(
      expect.objectContaining({
        filePath: destinationManifestPath,
        options: { ifGenerationMatch: "3", ignoreNotFound: true },
      })
    );

    const reserved = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reserved?.mountFilePath).toBe(destinationMountFilePath);
    expect(reserved?.useCaseMetadata?.pendingFrameSourceMove).toEqual({
      destinationMountFilePath,
      operationId: "move-recovery",
      sourceMountFilePath,
    });

    const retried = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(retried.isOk(), retried.isErr() ? retried.error.message : undefined);
    expect(retried.value.sourceDeletionFailed).toBe(false);
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(destinationMountFilePath);
    expect(reloaded?.useCaseMetadata?.pendingFrameSourceMove).toBeUndefined();
  });

  it("resumes an interrupted move from its destination reservation", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Recovered`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Recovered`;
    const destinationMountFilePath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceMountFilePath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    await context.frame.updateMount({
      destFileName: FRAME_MANIFEST_FILE,
      destMountFilePath: destinationMountFilePath,
      destUseCase: "conversation",
      destUseCaseMetadata: {
        activePublicationId: "publication-1",
        conversationId: context.conversation.sId,
        pendingFrameSourceMove: {
          destinationMountFilePath,
          operationId: "move-interrupted",
          sourceMountFilePath,
        },
      },
    });
    fileStorageMock.setObject(destinationMountFilePath, manifest, {
      [moveIdMetadataKey]: "move-interrupted",
    });
    fileStorageMock.setObject(
      `${destinationGcsDirectoryPath}/index.tsx`,
      "ui source",
      { [moveIdMetadataKey]: "move-interrupted" }
    );
    fileStorageMock.setFilesByPrefix((prefix) => {
      const isSource = prefix === `${context.sourceGcsDirectoryPath}/`;
      const isDestination = prefix === `${destinationGcsDirectoryPath}/`;
      if (!isSource && !isDestination) {
        return null;
      }
      const directoryPath = isSource
        ? context.sourceGcsDirectoryPath
        : destinationGcsDirectoryPath;
      return [
        {
          name: `${directoryPath}/${FRAME_MANIFEST_FILE}`,
          metadata: {
            contentType: frameV2ContentType,
            generation: isSource ? "1" : "3",
            md5Hash: "manifest",
            metadata: isSource
              ? undefined
              : { [moveIdMetadataKey]: "move-interrupted" },
            size: String(Buffer.byteLength(manifest)),
          },
        },
        {
          name: `${directoryPath}/index.tsx`,
          metadata: {
            contentType: "text/typescript",
            generation: isSource ? "2" : "4",
            md5Hash: "ui",
            metadata: isSource
              ? undefined
              : { [moveIdMetadataKey]: "move-interrupted" },
            size: "1",
          },
        },
      ].filter(
        ({ name }) => !isSource || fileStorageMock.getObject(name) !== undefined
      );
    });

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(destinationMountFilePath);
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      conversationId: context.conversation.sId,
    });
  });

  it("rejects moving a Frame inside its own source folder", async () => {
    const context = await setup();

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath: `${context.sourceDirectoryPath}/Nested`,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "invalid_source",
    });
  });
});
