import { DustFileSystem } from "@app/lib/api/file_system";
import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import type { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";

export const frameManifest = JSON.stringify({ version: 1, name: "Status" });

export async function setupFrameSourceStorageTest() {
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
    fileSize: Buffer.byteLength(frameManifest),
    status: "created",
    useCase: "conversation",
    useCaseMetadata: {
      activePublicationId: "publication-1",
      conversationId: conversation.sId,
    },
    mountFilePath: sourceObjects[0],
  });
  await frame.markFrameV2AsReadyFromMount(auth);
  fileStorageMock.setObject(sourceObjects[0], frameManifest);
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

/**
 * Build the conversation-scoped filesystem a move needs. Production callers resolve their own:
 * the Pod rename builds one from the Frame's scoped path, and an agent-loop caller would build
 * one here. Scoping to the source is enough — a move stays within one mount, and
 * `moveFrameV2Source` rejects a cross-mount destination before it touches the filesystem.
 */
export async function moveFrameSourceForTest(
  {
    auth,
    conversation,
  }: {
    auth: Authenticator;
    conversation: ConversationWithoutContentType;
  },
  {
    destinationDirectoryPath,
    sourceDirectoryPath,
  }: { destinationDirectoryPath: string; sourceDirectoryPath: string }
) {
  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths: [sourceDirectoryPath],
  });
  assert(fsResult.isOk(), "Test file system should be available");

  return moveFrameV2Source(auth, {
    dustFs: fsResult.value,
    destinationDirectoryPath,
    sourceDirectoryPath,
  });
}
