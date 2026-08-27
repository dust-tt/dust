import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { getFramePublicationSourcePath } from "@app/types/api/frame_storage";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";

async function setup() {
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
              ? "text/typescript"
              : frameV2ContentType,
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );
  fileStorageMock.setFileContent(
    (filePath) => sourceByPath.get(filePath) ?? null
  );

  return { auth, conversation, frame, manifestPath, workspace };
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("publishFrameV2FromSource", () => {
  it("snapshots the source folder and activates one publication", async () => {
    const { auth, conversation, frame, manifestPath, workspace } =
      await setup();

    const result = await publishFrameV2FromSource(auth, {
      conversation: conversation as ConversationType,
      frame,
      manifestPath,
    });

    assert(result.isOk());
    const identity = {
      workspaceId: workspace.sId,
      frameId: frame.sId,
      publicationId: result.value.publicationId,
    };
    expect(
      fileStorageMock.getObject(
        getFramePublicationSourcePath({
          ...identity,
          relativePath: FRAME_MANIFEST_FILE,
        })
      )
    ).toBe(manifest);
    expect(
      fileStorageMock.getObject(
        getFramePublicationSourcePath({
          ...identity,
          relativePath: "index.tsx",
        })
      )
    ).toBe(uiSource);

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      result.value.publicationId
    );
  });

  it("rejects a path that does not match the Frame identity", async () => {
    const { auth, conversation, frame } = await setup();

    const result = await publishFrameV2FromSource(auth, {
      conversation: conversation as ConversationType,
      frame,
      manifestPath: `conversation-${conversation.sId}/Other/manifest.json`,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
