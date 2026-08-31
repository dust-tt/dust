// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("requires write access to the destination scope", async () => {
    const context = await setup();
    const destinationPod = await SpaceFactory.project(context.workspace);
    await SpaceFactory.attachGroup(
      destinationPod,
      context.globalGroup,
      "project_viewer"
    );
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      context.user.sId,
      context.workspace.sId
    );
    assert(viewerAuth);

    const moved = await moveFrameV2Source(viewerAuth, {
      conversation: context.conversation,
      destinationDirectoryPath: `pod-${destinationPod.sId}/Status`,
      sourceDirectoryPath: context.sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "unauthorized",
    });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(
      `${context.sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`
    );
  });

  it("requires write access to the source scope", async () => {
    const context = await setup();
    const sourcePod = await SpaceFactory.project(context.workspace);
    await SpaceFactory.attachGroup(
      sourcePod,
      context.globalGroup,
      "project_viewer"
    );
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      context.user.sId,
      context.workspace.sId
    );
    assert(viewerAuth);
    const sourceDirectoryPath = `pod-${sourcePod.sId}/Status`;
    const sourceGcsDirectoryPath = `${getPodFilesBasePath({
      workspaceId: context.workspace.sId,
      podId: sourcePod.sId,
    })}Status`;
    const sourceManifestPath = `${sourceGcsDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    fileStorageMock.setObject(sourceManifestPath, manifest);
    fileStorageMock.setObject(
      `${sourceGcsDirectoryPath}/index.tsx`,
      "ui source"
    );
    await context.frame.updateMount({
      destFileName: FRAME_MANIFEST_FILE,
      destMountFilePath: sourceManifestPath,
      destUseCase: "project_context",
      destUseCaseMetadata: { spaceId: sourcePod.sId },
    });

    const moved = await moveFrameV2Source(viewerAuth, {
      conversation: context.conversation,
      destinationDirectoryPath: `conversation-${context.conversation.sId}/Moved`,
      sourceDirectoryPath,
    });

    expect(moved.isErr() && moved.error).toMatchObject({
      code: "unauthorized",
    });
    const reloaded = await FileResource.fetchById(
      context.auth,
      context.frame.sId
    );
    expect(reloaded?.mountFilePath).toBe(sourceManifestPath);
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
            generation: "2",
            md5Hash: "ui",
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
