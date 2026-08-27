import { ConversationModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 7;

async function setupConversation() {
  const { auth, user, workspace } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "user",
  });
  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const createdConversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const conversation = await ConversationResource.fetchById(
    auth,
    createdConversation.sId
  );
  if (!conversation) {
    throw new Error("Just-created conversation not found.");
  }
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
  });
  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId: agentMessage.agentMessageId,
    costCredits: BILLED_CREDITS,
  });
  await ConversationFactory.setAgentMessageStatus({
    workspace,
    agentMessageModelId: agentMessage.agentMessageId,
    status: "succeeded",
  });

  return { conversation, user, workspace };
}

function getConsumption({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}) {
  return honoApp.request(
    `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/consumption`
  );
}

describe("GET /api/poke/workspaces/:wId/conversations/:cId/consumption", () => {
  it("returns consumption to a Poke superuser without membership or the customer feature flag", async () => {
    const { conversation, user, workspace } = await setupConversation();
    const revokeResult = await MembershipResource.revokeMembership({
      user,
      workspace,
    });
    if (revokeResult.isErr()) {
      throw revokeResult.error;
    }

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      details: null,
    });
  });

  it("returns consumption for a deleted conversation", async () => {
    const { conversation, workspace } = await setupConversation();
    await ConversationModel.update(
      { visibility: "deleted" },
      { where: { id: conversation.id, workspaceId: workspace.id } }
    );

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS,
    });
  });

  it("returns not found for an unknown conversation", async () => {
    const { workspace } = await setupConversation();

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: "missing-conversation",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "conversation_not_found" },
    });
  });
});
