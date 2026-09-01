// @vitest-environment node

import { DustFileSystem } from "@app/lib/api/file_system";
import { getFrameSourceLockName } from "@app/lib/api/frames/operation_lock";
import {
  captureFrameV2SourceSnapshot,
  publishFrameFromSource,
  publishFrameV2FromSource,
} from "@app/lib/api/frames/publish_from_source";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import { FramePublicationDescriptorSchema } from "@app/types/api/frame_publication";
import { getFramePublicationDescriptorPath } from "@app/types/api/frame_storage";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";

async function setup({
  uiContentType = "text/typescript",
}: {
  uiContentType?: string;
} = {}) {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
  const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const gcsSourceDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status`;
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifest),
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });

  const sourceByPath = new Map([
    [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
    [`${gcsSourceDirectoryPath}/index.tsx`, uiSource],
  ]);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${gcsSourceDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".tsx")
              ? uiContentType
              : frameV2ContentType,
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );
  fileStorageMock.setFileContent(
    (filePath) => sourceByPath.get(filePath) ?? null
  );

  return {
    auth,
    conversation,
    frame,
    gcsSourceDirectoryPath,
    manifestPath,
    workspace,
  };
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("publishFrameFromSource", () => {
  it("rejects a Frame outside the signed conversation scope", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const sourcePath = `conversation-${otherConversation.sId}/Legacy.tsx`;
    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Legacy.tsx",
      fileSize: Buffer.byteLength(uiSource),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: otherConversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: otherConversation.sId,
      })}Legacy.tsx`,
    });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_path",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a legacy Frame in a read-only Pod", async () => {
    const {
      authenticator: auth,
      globalGroup,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const space = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(space, globalGroup, "project_viewer");
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    assert(viewerAuth);
    expect(viewerAuth.can("read", space)).toBe(true);
    expect(viewerAuth.can("write", space)).toBe(false);

    const conversation = await ConversationFactory.create(viewerAuth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: space.id,
    });
    const sourcePath = `pod-${space.sId}/Legacy.tsx`;
    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Legacy.tsx",
      fileSize: Buffer.byteLength(uiSource),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: space.sId,
      })}Legacy.tsx`,
    });

    const result = await publishFrameFromSource(viewerAuth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "unauthorized",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});

describe("publishFrameV2FromSource", () => {
  it("captures a reusable snapshot of the validated source", async () => {
    const { auth, conversation, manifestPath } = await setup();
    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    assert(fsResult.isOk());

    const snapshot = await captureFrameV2SourceSnapshot(
      fsResult.value,
      manifestPath
    );

    assert(snapshot.isOk());
    expect(snapshot.value.manifestPath).toBe(manifestPath);
    expect(snapshot.value.manifestSizeBytes).toBe(Buffer.byteLength(manifest));
    expect(
      snapshot.value.sourceFiles.map(({ relativePath }) => relativePath)
    ).toEqual([FRAME_MANIFEST_FILE, "index.tsx"]);
  });

  it("publishes artifacts without copying source and activates one publication", async () => {
    const {
      auth,
      conversation,
      frame,
      gcsSourceDirectoryPath,
      manifestPath,
      workspace,
    } = await setup();

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });

    assert(result.isOk());
    const identity = {
      workspaceId: workspace.sId,
      frameId: frame.sId,
      publicationId: result.value.publicationId,
    };
    const storedPublication = fileStorageMock.getObject(
      getFramePublicationDescriptorPath(identity)
    );
    assert(storedPublication);
    const publication = FramePublicationDescriptorSchema.parse(
      JSON.parse(storedPublication)
    );
    expect(publication.manifest).toEqual(
      FrameManifestSchema.parse(JSON.parse(manifest))
    );
    expect(
      fileStorageMock.saveFileCalls.some(({ filePath }) =>
        filePath.startsWith(`${gcsSourceDirectoryPath}/`)
      )
    ).toBe(false);

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      result.value.publicationId
    );
  });

  it("infers TSX source content type from its extension", async () => {
    const { auth, conversation, frame, manifestPath } = await setup({
      uiContentType: "application/x-tiled-tsx",
    });

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a path that does not match the Frame identity", async () => {
    const { auth, conversation, frame } = await setup();

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath: `conversation-${conversation.sId}/Other/manifest.json`,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("revalidates the Frame source path after acquiring the source lock", async () => {
    const { auth, conversation, frame, manifestPath, workspace } =
      await setup();
    const staleFrame = await FileResource.fetchById(auth, frame.sId);
    assert(staleFrame);
    const movedManifestPath = `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Moved/${FRAME_MANIFEST_FILE}`;
    await frame.updateMount({
      destFileName: FRAME_MANIFEST_FILE,
      destMountFilePath: movedManifestPath,
      destUseCase: "conversation",
      destUseCaseMetadata: { conversationId: conversation.sId },
    });

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame: staleFrame,
      manifestPath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("does not write when another source operation holds the lock", async () => {
    const { auth, conversation, frame, manifestPath } = await setup();
    const lockKey = `lock:${getFrameSourceLockName(frame.sId)}`;
    const redisClient = await getRedisStreamClient({ origin: "lock" });
    await redisClient.set(lockKey, "held-by-test", {
      NX: true,
      PX: 60_000,
    });
    vi.useFakeTimers();

    try {
      const publicationPromise = publishFrameV2FromSource(auth, {
        conversation,
        frame,
        manifestPath,
      });
      await vi.runAllTimersAsync();
      const published = await publicationPromise;

      expect(published.isErr() && published.error).toMatchObject({
        code: "publish_conflict",
        message:
          "Another source operation is in progress for this Frame; retry shortly.",
      });
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
      expect(fileStorageMock.writeStreamCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      await redisClient.del(lockKey);
    }
  });

  it("rejects publication from a read-only Pod", async () => {
    const {
      authenticator: auth,
      globalGroup,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const space = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(space, globalGroup, "project_viewer");
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    assert(viewerAuth);
    expect(viewerAuth.can("read", space)).toBe(true);
    expect(viewerAuth.can("write", space)).toBe(false);

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const sourceDirectoryPath = `pod-${space.sId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const gcsSourceDirectoryPath = `${getPodFilesBasePath({
      workspaceId: workspace.sId,
      podId: space.sId,
    })}Status`;
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    });
    const accessibleFrame = await FileResource.fetchById(viewerAuth, frame.sId);
    assert(accessibleFrame);

    const result = await publishFrameV2FromSource(viewerAuth, {
      conversation,
      frame: accessibleFrame,
      manifestPath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "unauthorized",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("bounds source listing before reading the folder", async () => {
    const { auth, conversation, frame, gcsSourceDirectoryPath, manifestPath } =
      await setup();
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === `${gcsSourceDirectoryPath}/`
        ? Array.from({ length: 2_000 }, (_, index) => ({
            name: `${gcsSourceDirectoryPath}/file-${index}.txt`,
            metadata: { contentType: "text/plain", size: "1" },
          }))
        : null
    );

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
      message: "Frame source exceeds the publication file count limit.",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(1);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
