import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/credit_cost", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/api/assistant/credit_cost")>();

  return {
    ...original,
    fetchAgentMessageCostAnalyticsByMessageIds: vi
      .fn()
      .mockResolvedValue(new Map()),
  };
});

function conversationUrl(workspaceId: string, conversationId: string) {
  return `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}`;
}

describe("GET /api/poke/workspaces/:wId/conversations/:cId", () => {
  it("paginates messages while preserving the unpaginated response", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
    });

    for (let rank = 0; rank < 3; rank++) {
      await ConversationFactory.createUserMessageWithRank({
        auth,
        workspace,
        conversationId: conversation.id,
        rank,
        content: `Message ${rank}`,
      });
    }

    const url = conversationUrl(workspace.sId, conversation.sId);
    const firstResponse = await honoApp.request(`${url}?limit=2`);

    expect(firstResponse.status).toBe(200);
    const firstPage = await firstResponse.json();
    expect(
      firstPage.conversation.content
        .flat()
        .map((message: { content: string }) => message.content)
    ).toEqual(["Message 1", "Message 2"]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.lastValue).toBe(1);

    const secondResponse = await honoApp.request(
      `${url}?limit=2&lastValue=${firstPage.lastValue}`
    );

    expect(secondResponse.status).toBe(200);
    const secondPage = await secondResponse.json();
    expect(
      secondPage.conversation.content
        .flat()
        .map((message: { content: string }) => message.content)
    ).toEqual(["Message 0"]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.lastValue).toBe(0);

    const fullResponse = await honoApp.request(url);

    expect(fullResponse.status).toBe(200);
    const fullConversation = await fullResponse.json();
    expect(
      fullConversation.conversation.content
        .flat()
        .map((message: { content: string }) => message.content)
    ).toEqual(["Message 0", "Message 1", "Message 2"]);
    expect(fullConversation).not.toHaveProperty("hasMore");
    expect(fullConversation).not.toHaveProperty("lastValue");
  });

  it("does not load tool output content with the conversation", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "dust",
      messagesCreatedAt: [new Date()],
    });
    const agentMessage = conversation.content
      .flat()
      .find((message) => message.type === "agent_message");
    assert(agentMessage);

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      output: [{ type: "text", text: "large tool output" }],
    });

    const response = await honoApp.request(
      `${conversationUrl(workspace.sId, conversation.sId)}?limit=50`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const responseAgentMessage = data.conversation.content
      .flat()
      .find((message: { sId: string }) => message.sId === agentMessage.sId);
    assert(responseAgentMessage);
    const responseAction = responseAgentMessage.actions.find(
      (candidate: { sId: string }) => candidate.sId === action.sId
    );
    assert(responseAction);
    expect(responseAction.output).toEqual([]);
    expect(responseAction).not.toHaveProperty("mcpIO");
  });
});
