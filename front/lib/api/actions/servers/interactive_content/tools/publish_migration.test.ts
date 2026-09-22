// @vitest-environment node
import type { ToolContext } from "@app/lib/actions/types";
import { PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import { upgradeLegacyFrameToV2 } from "@app/lib/api/frames/publish_from_source";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
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

vi.mock("@app/lib/api/frames/publish_from_source", () => ({
  upgradeLegacyFrameToV2: vi.fn(),
}));
vi.mock("@app/lib/api/viz/publish_frame", () => ({
  publishFrame: vi.fn(),
}));

const upgradeMock = vi.mocked(upgradeLegacyFrameToV2);
const publishFrameMock = vi.mocked(publishFrame);

beforeEach(() => {
  fileStorageMock.reset();
  upgradeMock.mockReset();
  publishFrameMock.mockReset();
  upgradeMock.mockResolvedValue(null);
  publishFrameMock.mockResolvedValue(new Ok({ warnings: [] }));
});

async function setupPublishTool() {
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
  const frame = await FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName: "Sales.tsx",
    fileSize: 64,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${mountBase}Sales.tsx`,
  });

  const toolContext = {
    runContext: {
      contextType: "agent_loop",
      conversation,
      agentConfiguration: { sId: "agent_x" },
    },
  } as unknown as ToolContext;

  const tools = await createInteractiveContentTools(auth, toolContext);
  const publishTool = tools.find(
    (tool) => tool.name === PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
  );
  assert(publishTool, "the publish tool must be registered");

  return {
    auth,
    conversation,
    frame,
    mountBase,
    publish: (path = `conversation-${conversation.sId}/Sales.tsx`) =>
      publishTool.handler(
        { file_id: frame.sId, path },
        {} as Parameters<typeof publishTool.handler>[1]
      ),
  };
}

async function publishWithTool() {
  const { conversation, frame, publish } = await setupPublishTool();

  return { conversation, frame, result: await publish() };
}

describe("publish_interactive_content_file of a legacy Frame", () => {
  it("upgrades the Frame to v2 rather than republishing it as v1", async () => {
    upgradeMock.mockImplementation(async (_auth, { frame }) => ({
      frame,
      published: { publicationId: "pub_upgraded" },
    }));

    const { conversation, frame, result } = await publishWithTool();
    assert(result.isOk(), "publishing an upgraded Frame must succeed");

    expect(publishFrameMock).not.toHaveBeenCalled();
    expect(upgradeMock).toHaveBeenCalledTimes(1);
    expect(upgradeMock.mock.calls[0][1]).toMatchObject({
      entryScopedPath: `conversation-${conversation.sId}/Sales.tsx`,
      frame: expect.objectContaining({ sId: frame.sId }),
      publishedByAgentConfigurationId: "agent_x",
    });
  });

  it("does not upgrade on a path that is another Frame's source", async () => {
    const { auth, conversation, mountBase, publish } = await setupPublishTool();
    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Costs.tsx",
      fileSize: 64,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: `${mountBase}Costs.tsx`,
    });

    const result = await publish(`conversation-${conversation.sId}/Costs.tsx`);
    assert(result.isOk(), "a mismatched pair must still publish as v1");

    // Upgrading here would relocate the other Frame's sources; v1 only writes a publication.
    expect(upgradeMock).not.toHaveBeenCalled();
    expect(publishFrameMock).toHaveBeenCalledTimes(1);
  });

  it("republishes as v1 when the Frame is not upgraded", async () => {
    upgradeMock.mockResolvedValue(null);

    const { result } = await publishWithTool();
    assert(result.isOk(), "a declined upgrade must not fail the publish");

    expect(publishFrameMock).toHaveBeenCalledTimes(1);
  });
});
