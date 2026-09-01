import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";

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
          generation: fileStorageMock.getObjectGeneration(name),
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
