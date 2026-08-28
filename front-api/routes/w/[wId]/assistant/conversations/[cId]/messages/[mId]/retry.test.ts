import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupAgentMessage() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "user",
    method: "POST",
  });

  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: "Retry endpoint" }
  );

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

  const { messageRow: userMessage } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Search Slack for the release notes",
    });

  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    parentMessageModelId: userMessage.id,
    rank: 1,
  });

  return { conversation, agentMessage, workspace };
}

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry", () => {
  it("succeeds when there are no blocked actions left to resume", async () => {
    const { conversation, agentMessage, workspace } = await setupAgentMessage();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}` +
        `/messages/${agentMessage.sId}/retry?blocked_only=true`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );

    // The prompt the caller acted on is already gone, which is the outcome they asked for.
    // Reporting a failure here left the blocked-action banner on screen with no way to clear it.
    expect(response.status).toBe(200);
  });
});
