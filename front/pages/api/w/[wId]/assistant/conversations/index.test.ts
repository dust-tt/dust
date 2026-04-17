import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation/content_fragment", () => ({
  getContentFragmentBlob: vi.fn(),
}));

import handler from "./index";

describe("POST /api/w/[wId]/assistant/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a conversation with both content fragments and an initial message", async () => {
    const { req, res, workspace, auth, globalSpace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Route Test Agent",
        description: "Route behavior test agent",
      }
    );

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );

    vi.mocked(getContentFragmentBlob).mockImplementation(async (_auth, cf) => {
      if (!("nodeId" in cf)) {
        throw new Error("Expected a content-node fragment");
      }

      return new Ok({
        contentType: "text/plain",
        fileId: null,
        nodeId: cf.nodeId,
        nodeDataSourceViewId: dataSourceView.id,
        nodeType: "document",
        sourceUrl: null,
        textBytes: null,
        title: cf.title,
      });
    });

    req.url = `/api/w/${workspace.sId}/assistant/conversations`;
    req.body = {
      title: "Conversation created from route",
      visibility: "unlisted",
      spaceId: null,
      contentFragments: [
        {
          title: "Workspace context",
          nodeId: "node-1",
          nodeDataSourceViewId: dataSourceView.sId,
          context: { profilePictureUrl: null },
        },
      ],
      message: {
        content: "Hello from the route",
        mentions: [{ configurationId: agentConfiguration.sId }],
        context: {
          timezone: "Europe/Paris",
          profilePictureUrl: null,
        },
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.contentFragments).toHaveLength(1);
    expect(responseData.contentFragments[0]).toMatchObject({
      type: "content_fragment",
      title: "Workspace context",
    });
    expect(responseData.message).toMatchObject({
      type: "user_message",
      content: "Hello from the route",
      mentions: [{ configurationId: agentConfiguration.sId }],
    });

    const flattenedContent = responseData.conversation.content.flat();
    const contentFragmentIndex = flattenedContent.findIndex(
      (item: { type: string }) => item.type === "content_fragment"
    );
    const userMessageIndex = flattenedContent.findIndex(
      (item: { sId?: string; type: string }) =>
        item.type === "user_message" && item.sId === responseData.message.sId
    );

    expect(contentFragmentIndex).toBeGreaterThanOrEqual(0);
    expect(userMessageIndex).toBeGreaterThan(contentFragmentIndex);
    expect(
      flattenedContent.some(
        (item: { type: string }) => item.type === "agent_message"
      )
    ).toBe(true);
  });
});
