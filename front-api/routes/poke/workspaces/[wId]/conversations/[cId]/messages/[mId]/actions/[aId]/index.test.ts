import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it } from "vitest";

describe("GET /api/poke/workspaces/:wId/conversations/:cId/messages/:mId/actions/:aId", () => {
  it("returns the action inputs and output", async () => {
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
      inputs: { query: "test query" },
      output: [{ type: "text", text: "test output" }],
    });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations/${conversation.sId}/messages/${agentMessage.sId}/actions/${action.sId}`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.action.sId).toBe(action.sId);
    expect(data.action.params).toEqual({ query: "test query" });
    expect(data.action.output).toEqual([{ type: "text", text: "test output" }]);
    expect(data.messageStatus).toBe(agentMessage.status);
  });
});
