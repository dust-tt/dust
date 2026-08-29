// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/operation_lock", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/frames/operation_lock")>();
  return {
    ...actual,
    withFramePublishLock: async (
      _frameId: string,
      callback: () => Promise<unknown>
    ) => callback(),
    withFrameSourceAndPublishLock: async (
      _frameId: string,
      callback: () => Promise<unknown>
    ) => callback(),
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
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
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
import assert from "assert";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});

async function setup() {
  const {
    authenticator: auth,
    globalGroup,
    user,
    workspace,
  } = await createResourceTest({ role: "admin" });
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

  fileStorageMock.setFileExists(() => false);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${sourceGcsDirectoryPath}/`
      ? [
          {
            name: `${sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`,
            metadata: {
              contentType: frameV2ContentType,
              generation: "1",
              md5Hash: "manifest",
              size: String(Buffer.byteLength(manifest)),
            },
          },
          {
            name: `${sourceGcsDirectoryPath}/index.tsx`,
            metadata: {
              contentType: "text/typescript",
              generation: "1",
              md5Hash: "ui",
              size: "1",
            },
          },
        ]
      : null
  );

  return {
    auth,
    conversation,
    frame,
    globalGroup,
    sourceDirectoryPath,
    sourceGcsDirectoryPath,
    user,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
  vi.restoreAllMocks();
});

describe("moveFrameV2Source", () => {
  it("moves within one scope without replacing identity, publication, or sharing", async () => {
    const context = await setup();
    const beforeShare = await context.frame.getShareInfo();
    const scopeTransition = vi.spyOn(
      FrameSandboxAdapter,
      "withScopeTransition"
    );
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Renamed`;

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
    expect(scopeTransition).not.toHaveBeenCalled();

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
      })}Renamed/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      conversationId: context.conversation.sId,
    });
    await expect(reloaded?.getShareInfo()).resolves.toEqual(beforeShare);
  });

  it("recycles the runtime when moving to another scope while keeping state ownership", async () => {
    const context = await setup();
    const destinationPod = await SpaceFactory.project(context.workspace);
    await SpaceFactory.attachGroup(
      destinationPod,
      context.globalGroup,
      "project_editor"
    );
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      context.user.sId,
      context.workspace.sId
    );
    assert(auth);
    const sandbox = await SandboxResource.makeNew(context.auth, {
      providerId: "frame-sandbox",
      status: "sleeping",
      baseImage: "dust-base",
      version: "1",
    });
    await SandboxOwnerModel.create({
      frameFileModelId: context.frame.id,
      sandboxId: sandbox.id,
      workspaceId: context.workspace.id,
    });
    const destinationDirectoryPath = `pod-${destinationPod.sId}/Status`;

    const moved = await moveFrameV2Source(auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    assert(moved.isOk(), moved.isErr() ? moved.error.message : undefined);
    const reloaded = await FileResource.fetchById(auth, context.frame.sId);
    expect(reloaded?.mountFilePath).toBe(
      `${getPodFilesBasePath({
        workspaceId: context.workspace.sId,
        podId: destinationPod.sId,
      })}Status/${FRAME_MANIFEST_FILE}`
    );
    expect(reloaded?.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      spaceId: destinationPod.sId,
    });
    expect(
      await FrameSandboxAdapter.fetchSandbox(auth, context.frame)
    ).toMatchObject({ id: sandbox.id, status: "deleted" });
  });

  it("rejects a matching destination object created during the move", async () => {
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

  it("does not delete a destination object overwritten after its copy", async () => {
    const context = await setup();
    const destinationDirectoryPath = `conversation-${context.conversation.sId}/Collision`;
    const destinationGcsDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    })}Collision`;
    const destinationManifestPath = `${destinationGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const destinationIndexPath = `${destinationGcsDirectoryPath}/index.tsx`;
    fileStorageMock.setObject(destinationManifestPath, "raw destination");
    fileStorageMock.setFileMetadata((filePath) =>
      filePath === destinationManifestPath
        ? {
            contentType: frameV2ContentType,
            generation: "1",
            md5Hash: "manifest",
            size: String(Buffer.byteLength(manifest)),
          }
        : null
    );
    fileStorageMock.setAfterCopyFile((_sourcePath, destinationPath) => {
      if (destinationPath === destinationIndexPath) {
        fileStorageMock.setObject(destinationPath, "newer destination");
      }
    });

    const moved = await moveFrameV2Source(context.auth, {
      conversation: context.conversation,
      destinationDirectoryPath,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({ code: "internal" });
    expect(fileStorageMock.getObject(destinationIndexPath)).toBe(
      "newer destination"
    );
    expect(fileStorageMock.deleteCalls).toContainEqual({
      filePath: destinationIndexPath,
      options: { ignoreNotFound: true, ifGenerationMatch: "2" },
    });
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
          sourceMountFilePath,
        },
      },
    });
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
            generation: isSource ? "1" : "2",
            md5Hash: "manifest",
            size: String(Buffer.byteLength(manifest)),
          },
        },
        {
          name: `${directoryPath}/index.tsx`,
          metadata: {
            contentType: "text/typescript",
            generation: isSource ? "1" : "2",
            md5Hash: "ui",
            size: "1",
          },
        },
      ];
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
