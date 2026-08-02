import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 7;

async function setupMessage() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "user",
    method: "GET",
  });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: "Consumption endpoint" }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
  });
  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId: agentMessage.agentMessageId,
    costCredits: BILLED_CREDITS,
  });

  return { auth, workspace, conversation, agentMessage };
}

function getConsumption({
  workspaceId,
  conversationId,
  messageId,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/consumption`
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/messages/:mId/consumption", () => {
  it("returns the exact bill while attribution is unavailable", async () => {
    const { auth, workspace, conversation, agentMessage } =
      await setupMessage();
    await FeatureFlagFactory.basic(auth, "conversation_consumption_details");

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      details: null,
    });
  });

  it("rejects workspaces without the feature flag", async () => {
    const { workspace, conversation, agentMessage } = await setupMessage();

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(403);
  });
});
