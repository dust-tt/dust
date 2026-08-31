// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitGCSMountFileMovedAuditLogMock, lockLeaseCheckMock } = vi.hoisted(
  () => ({
    emitGCSMountFileMovedAuditLogMock: vi.fn(),
    lockLeaseCheckMock: vi.fn(),
  })
);

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
  const executeImmediately = async <T>(
    _key: string,
    callback: () => Promise<T>
  ) => callback();
  const executeRenewingImmediately = async <T>(
    _key: string,
    callback: (lease: {
      check: () => ReturnType<typeof lockLeaseCheckMock>;
    }) => Promise<T>
  ) => {
    const lease = { check: () => lockLeaseCheckMock() };
    const result = await callback(lease);
    const held = lease.check();
    return held.isErr() ? held : result;
  };
  return {
    ...actual,
    executeWithLock: executeImmediately,
    executeWithLockResult: executeImmediately,
    executeWithRenewingLockResult: executeRenewingImmediately,
  };
});

import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import { Authenticator } from "@app/lib/auth";
import { LockLeaseLostError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const moveIdMetadataKey = "dust_frame_source_move_id";
let leaseCheckCount = 0;
let loseLeaseAtCheck = Number.POSITIVE_INFINITY;

async function setup({
  sourceMount = "conversation",
  withRuntimePod = false,
}: {
  sourceMount?: "conversation" | "pod";
  withRuntimePod?: boolean;
} = {}) {
  const {
    authenticator: initialAuth,
    globalGroup,
    user,
    workspace,
  } = await createResourceTest({ role: "admin" });
  const runtimeSpace =
    withRuntimePod || sourceMount === "pod"
      ? await SpaceFactory.project(workspace, user.id)
      : null;
  const auth = runtimeSpace
    ? await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId)
    : initialAuth;
  assert(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
    spaceId: runtimeSpace?.id,
  });
  const source =
    sourceMount === "conversation"
      ? {
          directoryPath: `conversation-${conversation.sId}/Status`,
          gcsDirectoryPath: `${getConversationFilesBasePath({
            workspaceId: workspace.sId,
            conversationId: conversation.sId,
          })}Status`,
          useCase: "conversation" as const,
          useCaseMetadata: {
            activePublicationId: "publication-1",
            conversationId: conversation.sId,
          },
        }
      : (() => {
          assert(runtimeSpace);
          return {
            directoryPath: `pod-${runtimeSpace.sId}/Status`,
            gcsDirectoryPath: `${getPodFilesBasePath({
              workspaceId: workspace.sId,
              podId: runtimeSpace.sId,
            })}Status`,
            useCase: "project_context" as const,
            useCaseMetadata: {
              activePublicationId: "publication-1",
              spaceId: runtimeSpace.sId,
            },
          };
        })();
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifest),
    status: "created",
    useCase: source.useCase,
    useCaseMetadata: source.useCaseMetadata,
    mountFilePath: `${source.gcsDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });
  await frame.markFrameV2AsReadyFromMount(auth);

  const sourceManifestPath = `${source.gcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const sourceUiPath = `${source.gcsDirectoryPath}/index.tsx`;
  fileStorageMock.setObject(sourceManifestPath, manifest);
  fileStorageMock.setObject(sourceUiPath, "ui source");
  fileStorageMock.setFileExists(() => false);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${source.gcsDirectoryPath}/`
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
    globalGroup,
    runtimeSpace,
    sourceDirectoryPath: source.directoryPath,
    sourceGcsDirectoryPath: source.gcsDirectoryPath,
    user,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
  emitGCSMountFileMovedAuditLogMock.mockClear();
  vi.restoreAllMocks();
  leaseCheckCount = 0;
  loseLeaseAtCheck = Number.POSITIVE_INFINITY;
  lockLeaseCheckMock.mockReset();
  lockLeaseCheckMock.mockImplementation(() => {
    leaseCheckCount++;
    return leaseCheckCount >= loseLeaseAtCheck
      ? new Err(new LockLeaseLostError("frame-test"))
      : new Ok(undefined);
  });
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

  it("does not reserve a destination after its composite lease is lost", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/LeaseLostBeforeReservation`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}LeaseLostBeforeReservation`;
    loseLeaseAtCheck = 1;

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "publish_conflict",
    });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(
      `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
    expect(
      fileStorageMock.getObject(
        `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
      )
    ).toBeUndefined();
  });

  it("preserves copied objects and the reservation when its lease is lost before commit", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/LeaseLostBeforeCommit`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}LeaseLostBeforeCommit`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    loseLeaseAtCheck = 3;

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "publish_conflict",
    });
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(manifest);
    expect(
      fileStorageMock.getObject(`${destinationGcsDirectoryPath}/index.tsx`)
    ).toBe("ui source");
    expect(
      fileStorageMock.getObject(
        `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
      )
    ).toBe(manifest);
    const reserved = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reserved?.mountFilePath).toBe(destinationManifestPath);
    expect(reserved?.useCaseMetadata?.pendingFrameSourceMove).toBeDefined();
    expect(fileStorageMock.deleteCalls).toEqual([]);
  });

  it("reports source leftovers when its lease is lost after destination commit", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/LeaseLostAfterCommit`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}LeaseLostAfterCommit`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    loseLeaseAtCheck = 5;

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(moved.value.sourceDeletionFailed).toBe(true);
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(manifest);
    expect(
      fileStorageMock.getObject(
        `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
      )
    ).toBe(manifest);
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(destinationManifestPath);
    expect(reloaded?.useCaseMetadata?.pendingFrameSourceMove).toBeUndefined();
    expect(fileStorageMock.deleteCalls).toEqual([]);
  });

  it("moves from a conversation mount to its runtime Pod", async () => {
    const context = await setup({ withRuntimePod: true });
    assert(context.runtimeSpace);
    const destinationDirectoryPath = `pod-${context.runtimeSpace.sId}/Status`;

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
    expect(reloaded).toMatchObject({
      sId: context.frame.sId,
      useCase: "project_context",
    });
    expect(reloaded?.mountFilePath).toBe(
      `${getPodFilesBasePath({
        workspaceId: context.workspace.sId,
        podId: context.runtimeSpace.sId,
      })}Status/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      spaceId: context.runtimeSpace.sId,
    });
    expect(emitGCSMountFileMovedAuditLogMock).toHaveBeenCalledWith(
      context.auth,
      { useCase: "pod", podId: context.runtimeSpace.sId },
      { parentRelativePath: "", relativeFilePath: "Status" }
    );
  });

  it("moves from a Pod mount to a conversation in that runtime", async () => {
    const context = await setup({ sourceMount: "pod" });
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Status`;

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
    expect(reloaded).toMatchObject({
      sId: context.frame.sId,
      useCase: "conversation",
    });
    expect(reloaded?.mountFilePath).toBe(
      `${getConversationFilesBasePath({
        workspaceId: context.workspace.sId,
        conversationId: context.conversation.sId,
      })}Status/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      conversationId: context.conversation.sId,
    });
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

  it("rejects moves to a different runtime before any mutation", async () => {
    const context = await setup();
    const destinationPod = await SpaceFactory.project(
      context.workspace,
      context.user.id
    );
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      context.user.sId,
      context.workspace.sId
    );
    assert(auth);
    const fetchFrames = vi.spyOn(FileResource, "fetchByMountFilePaths");
    const updateMount = vi.spyOn(FileResource.prototype, "updateMount");
    const copyFile = vi.fn();
    fileStorageMock.setAfterCopyFile(copyFile);

    const moved = await moveFrameV2Source(auth, {
      conversation: context.conversation,
      destinationDirectoryPath: `pod-${destinationPod.sId}/Status`,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "invalid_source",
      message:
        "Frame source and destination must resolve to the same runtime space.",
    });
    expect(fetchFrames).not.toHaveBeenCalled();
    expect(updateMount).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
    expect(fileStorageMock.deleteCalls).toEqual([]);
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

  it("requires destination write access before any mutation", async () => {
    const context = await setup();
    const destinationPod = await SpaceFactory.project(context.workspace);
    await SpaceFactory.attachGroup(
      destinationPod,
      context.globalGroup,
      "project_viewer"
    );
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      context.user.sId,
      context.workspace.sId
    );
    assert(auth);
    const fetchFrames = vi.spyOn(FileResource, "fetchByMountFilePaths");
    const updateMount = vi.spyOn(FileResource.prototype, "updateMount");
    const copyFile = vi.fn();
    fileStorageMock.setAfterCopyFile(copyFile);

    const moved = await moveFrameV2Source(auth, {
      conversation: context.conversation,
      destinationDirectoryPath: `pod-${destinationPod.sId}/Status`,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "unauthorized",
    });
    expect(fetchFrames).not.toHaveBeenCalled();
    expect(updateMount).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
    expect(fileStorageMock.deleteCalls).toEqual([]);
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
    fileStorageMock.setFileMetadata((filePath) =>
      filePath === destinationManifestPath
        ? {
            contentType: frameV2ContentType,
            generation:
              fileStorageMock.getObjectGeneration(filePath) ?? "missing",
            md5Hash: "manifest",
            size: String(Buffer.byteLength(manifest)),
          }
        : null
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

  it("claims a matching committed generation after a final network error", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/NetworkAmbiguous`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}NetworkAmbiguous`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    let lostResponse = false;
    fileStorageMock.setCopyFileCommitsThenErrors(
      (_sourcePath, destinationPath) => {
        if (!lostResponse && destinationPath === destinationManifestPath) {
          lostResponse = true;
          return new Error("Simulated final network error after commit");
        }
        return null;
      }
    );
    fileStorageMock.setFileMetadata((filePath) =>
      filePath === destinationManifestPath
        ? {
            contentType: frameV2ContentType,
            generation:
              fileStorageMock.getObjectGeneration(filePath) ?? "missing",
            md5Hash: "manifest",
            size: String(Buffer.byteLength(manifest)),
          }
        : null
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

  it("preserves the initial reservation when copy ownership cannot be determined", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/UnknownCopy`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}UnknownCopy`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const destinationMountFilePath = destinationManifestPath;
    const sourceManifestPath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    const updateMount = vi.spyOn(FileResource.prototype, "updateMount");
    fileStorageMock.setCopyFileFails((sourcePath) =>
      sourcePath.endsWith(`/${FRAME_MANIFEST_FILE}`)
    );
    fileStorageMock.setFileMetadataFails(
      (filePath) => filePath === destinationManifestPath
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "internal" });
    const reservationMetadata = updateMount.mock.calls
      .map(([args]) => args.destUseCaseMetadata?.pendingFrameSourceMove)
      .find((pendingMove) => pendingMove !== undefined);
    const reserved = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reservationMetadata).toBeDefined();
    expect(reserved?.mountFilePath).toBe(destinationMountFilePath);
    expect(reserved?.useCaseMetadata?.pendingFrameSourceMove).toEqual(
      reservationMetadata
    );
    expect(fileStorageMock.getObject(sourceManifestPath)).toBe(manifest);
    expect(fileStorageMock.getObject(sourceUiPath)).toBe("ui source");
    expect(fileStorageMock.getObject(destinationManifestPath)).toBeUndefined();
    expect(
      fileStorageMock.getObject(`${destinationGcsDirectoryPath}/index.tsx`)
    ).toBeUndefined();
  });

  it("does not adopt a stale copy after its pinned source generation changes", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/EditedRecovery`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}EditedRecovery`;
    const sourceManifestPath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const operationId = "edited-source-recovery";
    await context.frame.updateMount({
      destFileName: FRAME_MANIFEST_FILE,
      destMountFilePath: destinationManifestPath,
      destUseCase: "conversation",
      destUseCaseMetadata: {
        ...context.frame.useCaseMetadata,
        pendingFrameSourceMove: {
          destinationMountFilePath: destinationManifestPath,
          operationId,
          sourceMountFilePath: sourceManifestPath,
        },
      },
    });
    fileStorageMock.setObject(destinationManifestPath, "stale copy", {
      [moveIdMetadataKey]: operationId,
    });
    const destinationGeneration = fileStorageMock.getObjectGeneration(
      destinationManifestPath
    );
    let sourceListed = false;
    fileStorageMock.setFilesByPrefix((prefix) => {
      if (prefix === `${context.sourceGcsDirectoryPath}/`) {
        if (!sourceListed) {
          sourceListed = true;
          fileStorageMock.setObject(sourceManifestPath, "edited source");
        }
        return [
          {
            name: sourceManifestPath,
            metadata: {
              contentType: frameV2ContentType,
              crc32c: "same-crc",
              generation: "1",
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
        return [
          {
            name: destinationManifestPath,
            metadata: {
              contentType: frameV2ContentType,
              crc32c: "same-crc",
              generation: destinationGeneration,
              metadata: { [moveIdMetadataKey]: operationId },
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
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(
      "stale copy"
    );
    expect(fileStorageMock.getObject(sourceManifestPath)).toBe("edited source");
    expect(fileStorageMock.deleteCalls).not.toContainEqual(
      expect.objectContaining({ filePath: destinationManifestPath })
    );
    const reserved = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reserved?.useCaseMetadata?.pendingFrameSourceMove).toMatchObject({
      operationId,
    });
  });

  it("fences delayed cleanup with a fresh destination attempt generation", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/AttemptFence`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}AttemptFence`;
    const sourceManifestPath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const destinationUiPath = `${destinationGcsDirectoryPath}/index.tsx`;
    const updateMount = FileResource.prototype.updateMount;
    let updateMountCalls = 0;
    vi.spyOn(FileResource.prototype, "updateMount").mockImplementation(
      function (this: FileResource, args) {
        updateMountCalls++;
        if (updateMountCalls === 2) {
          return Promise.reject(
            new Error("Simulated uncommitted final Frame update")
          );
        }
        return updateMount.call(this, args);
      }
    );
    let releaseDelayedDelete: () => void = () => {};
    let reportDelayedDeleteStarted: () => void = () => {};
    const delayedDelete = new Promise<void>((resolve) => {
      releaseDelayedDelete = resolve;
    });
    const delayedDeleteStarted = new Promise<void>((resolve) => {
      reportDelayedDeleteStarted = resolve;
    });
    fileStorageMock.setDeleteFails(
      (filePath) => filePath === destinationManifestPath
    );
    fileStorageMock.setBeforeDelete(async (filePath) => {
      if (filePath === destinationUiPath) {
        reportDelayedDeleteStarted();
        await delayedDelete;
      }
    });

    let oldMoveSettled = false;
    const oldMovePromise = moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });
    void oldMovePromise.then(() => {
      oldMoveSettled = true;
    });

    await delayedDeleteStarted;
    await Promise.resolve();
    expect(oldMoveSettled).toBe(false);
    const oldManifestGeneration = fileStorageMock.getObjectGeneration(
      destinationManifestPath
    );
    const oldUiGeneration =
      fileStorageMock.getObjectGeneration(destinationUiPath);

    let freshAttemptCopyCount = 0;
    let reportFreshAttemptCopied: () => void = () => {};
    const freshAttemptCopied = new Promise<void>((resolve) => {
      reportFreshAttemptCopied = resolve;
    });
    fileStorageMock.setAfterCopyFile((_sourcePath, destinationPath) => {
      if (
        destinationPath === destinationManifestPath ||
        destinationPath === destinationUiPath
      ) {
        freshAttemptCopyCount++;
        if (freshAttemptCopyCount === 2) {
          reportFreshAttemptCopied();
        }
      }
    });
    const retriedPromise = moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    await freshAttemptCopied;
    releaseDelayedDelete();
    const [retried, oldMove] = await Promise.all([
      retriedPromise,
      oldMovePromise,
    ]);

    assert(retried.isOk(), retried.isErr() ? retried.error.message : undefined);
    expect(
      fileStorageMock.getObjectGeneration(destinationManifestPath)
    ).not.toBe(oldManifestGeneration);
    expect(fileStorageMock.getObjectGeneration(destinationUiPath)).not.toBe(
      oldUiGeneration
    );
    expect(oldMove.isErr() && oldMove.error).toMatchObject({
      code: "internal",
    });
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(manifest);
    expect(fileStorageMock.getObject(destinationUiPath)).toBe("ui source");
    expect(fileStorageMock.getObject(sourceManifestPath)).toBeUndefined();
    expect(fileStorageMock.getObject(sourceUiPath)).toBeUndefined();
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

  it("reconciles a final Frame update whose committed response was lost", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/CommittedUpdate`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}CommittedUpdate`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const destinationUiPath = `${destinationGcsDirectoryPath}/index.tsx`;
    const sourceManifestPath = `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const sourceUiPath = `${context.sourceGcsDirectoryPath}/index.tsx`;
    const updateMount = FileResource.prototype.updateMount;
    let updateMountCalls = 0;
    vi.spyOn(FileResource.prototype, "updateMount").mockImplementation(
      async function (this: FileResource, args) {
        updateMountCalls++;
        const result = await updateMount.call(this, args);
        if (updateMountCalls === 2) {
          throw new Error("Simulated lost final update response");
        }
        return result;
      }
    );

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    expect(fileStorageMock.getObject(destinationManifestPath)).toBe(manifest);
    expect(fileStorageMock.getObject(destinationUiPath)).toBe("ui source");
    expect(fileStorageMock.getObject(sourceManifestPath)).toBeUndefined();
    expect(fileStorageMock.getObject(sourceUiPath)).toBeUndefined();
    expect(
      fileStorageMock.deleteCalls.filter(({ filePath }) =>
        filePath.startsWith(`${destinationGcsDirectoryPath}/`)
      )
    ).toEqual([]);
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(destinationManifestPath);
    expect(reloaded?.useCaseMetadata?.pendingFrameSourceMove).toBeUndefined();
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
    const preexistingDestinationGeneration =
      fileStorageMock.getObjectGeneration(destinationManifestPath);
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
              generation: preexistingDestinationGeneration,
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
    const destinationCleanup = fileStorageMock.deleteCalls.find(
      ({ filePath }) => filePath === destinationManifestPath
    );
    expect(destinationCleanup?.options).toEqual({
      ifGenerationMatch: expect.any(String),
      ignoreNotFound: true,
    });
    expect(destinationCleanup?.options?.ifGenerationMatch).not.toBe(
      preexistingDestinationGeneration
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
