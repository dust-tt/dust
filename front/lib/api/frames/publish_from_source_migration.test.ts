// @vitest-environment node
import { migrateFrameToV2 } from "@app/lib/api/frames/migrate_to_v2";
import { publishFrameFromSource } from "@app/lib/api/frames/publish_from_source";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import type { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/migrate_to_v2", () => ({
  migrateFrameToV2: vi.fn(),
}));
vi.mock("@app/lib/api/viz/publish_frame", () => ({
  publishFrame: vi.fn(),
}));

const migrateFrameToV2Mock = vi.mocked(migrateFrameToV2);
const publishFrameMock = vi.mocked(publishFrame);

beforeEach(() => {
  fileStorageMock.reset();
  migrateFrameToV2Mock.mockReset();
  publishFrameMock.mockReset();
  migrateFrameToV2Mock.mockResolvedValue(new Ok(null));
  publishFrameMock.mockResolvedValue(new Ok({ warnings: [] }));
});

async function setup() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [],
  });
  const mountBase = getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  });
  const sourcePath = `conversation-${conversation.sId}/Sales.tsx`;

  const frame = await FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName: "Sales.tsx",
    fileSize: 64,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${mountBase}Sales.tsx`,
  });

  return { auth, conversation, frame, sourcePath };
}

function migratedTo(frame: FileResource, publicationId: string) {
  return new Ok({ frame, published: { publicationId } });
}

describe("publishFrameFromSource of a legacy Frame", () => {
  it("returns the v2 publication of the upgraded Frame instead of republishing v1", async () => {
    const { auth, conversation, frame, sourcePath } = await setup();
    migrateFrameToV2Mock.mockResolvedValue(migratedTo(frame, "pub_upgraded"));

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "agent_x",
      sourcePath,
    });
    assert(result.isOk(), "publishing an upgraded Frame must succeed");

    expect(result.value).toEqual({
      kind: "v2",
      frameId: frame.sId,
      sourcePath,
      publicationId: "pub_upgraded",
      created: false,
    });
    expect(publishFrameMock).not.toHaveBeenCalled();
  });

  it("hands the upgrade the Frame and the entry path it was asked to publish", async () => {
    const { auth, conversation, frame, sourcePath } = await setup();
    migrateFrameToV2Mock.mockResolvedValue(migratedTo(frame, "pub_upgraded"));

    await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "agent_x",
      sourcePath,
    });

    expect(migrateFrameToV2Mock).toHaveBeenCalledTimes(1);
    expect(migrateFrameToV2Mock.mock.calls[0][1]).toMatchObject({
      entryScopedPath: sourcePath,
      frame: expect.objectContaining({ sId: frame.sId }),
    });
  });

  it("publishes through the legacy path when the Frame is not upgraded", async () => {
    const { auth, conversation, frame, sourcePath } = await setup();

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "agent_x",
      sourcePath,
    });
    assert(result.isOk(), "a declined upgrade must not fail the publish");

    expect(result.value).toEqual({
      kind: "legacy",
      frameId: frame.sId,
      sourcePath,
      warnings: [],
    });
    expect(publishFrameMock).toHaveBeenCalledTimes(1);
  });
});
