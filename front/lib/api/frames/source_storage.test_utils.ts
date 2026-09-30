import { DustFileSystem } from "@app/lib/api/file_system";
import { moveFrameV2Source } from "@app/lib/api/frames/move_source";
import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";

export const frameManifest = JSON.stringify({ version: 1, name: "Status" });

/**
 * With `inPod`, the conversation belongs to a Pod the user can edit, so the Frame can be saved
 * there.
 */
export async function setupFrameSourceStorageTest(
  { inPod }: { inPod: boolean } = { inPod: false }
) {
  const {
    authenticator: workspaceAuth,
    user,
    workspace,
  } = await createResourceTest({
    role: "admin",
  });
  const pod = inPod ? await SpaceFactory.project(workspace, user.id) : null;
  // Pod editor rights are resolved when the authenticator is built, so rebuild it after the Pod.
  const auth = pod
    ? await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId)
    : workspaceAuth;
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
    ...(pod ? { spaceId: pod.id } : {}),
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
    pod,
    sourceDirectoryPath,
    sourceMountDirectory,
    sourceObjects,
    workspace,
  };
}

/**
 * Build the conversation-scoped filesystem a move needs. Production callers resolve their own:
 * the Pod rename builds one from the Frame's scoped path, and an agent-loop caller would build
 * one here. Scoping to the source is enough: it also mounts the conversation's Pod, the only other
 * mount a Frame can move to, and `moveFrameV2Source` rejects any other cross-mount destination
 * before it touches the filesystem.
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
