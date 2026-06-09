import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function getMessageByRank(
  auth: Authenticator,
  conversationId: ModelId,
  rank: number
): Promise<MessageModel> {
  const message = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId,
      rank,
    },
  });
  if (!message) {
    throw new Error(`No message found at rank ${rank}`);
  }
  return message;
}

function getFeedbacks(workspace: { sId: string }, cId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/feedbacks`
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/feedbacks", () => {
  it("returns empty feedbacks when none exist", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await getFeedbacks(workspace, conversation.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).feedbacks).toEqual([]);
  });

  it("returns feedbacks for the current user only", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const user = auth.getNonNullableUser();

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    // rank 1 = first agent message, rank 3 = second agent message.
    const msg1 = await getMessageByRank(auth, conversation.id, 1);
    const msg2 = await getMessageByRank(auth, conversation.id, 3);
    const { agentMessage: am1 } = await ConversationFactory.getMessage(
      auth,
      msg1.id
    );
    const { agentMessage: am2 } = await ConversationFactory.getMessage(
      auth,
      msg2.id
    );

    await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      conversationId: conversation.id,
      agentMessageId: am1!.id,
      userId: user.id,
      thumbDirection: "up",
      content: "good",
      isConversationShared: false,
      dismissed: false,
    });

    await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      conversationId: conversation.id,
      agentMessageId: am2!.id,
      userId: user.id,
      thumbDirection: "down",
      content: "bad",
      isConversationShared: false,
      dismissed: false,
    });

    const response = await getFeedbacks(workspace, conversation.sId);

    expect(response.status).toBe(200);

    const feedbacks = (await response.json()).feedbacks;
    expect(feedbacks).toHaveLength(2);

    const directions = feedbacks.map(
      (f: { thumbDirection: string }) => f.thumbDirection
    );
    expect(directions).toContain("up");
    expect(directions).toContain("down");
  });

  it("does not return feedbacks from other conversations", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const user = auth.getNonNullableUser();

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    const conversation1 = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const conversation2 = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    const msg = await getMessageByRank(auth, conversation2.id, 1);
    const { agentMessage } = await ConversationFactory.getMessage(auth, msg.id);

    await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      conversationId: conversation2.id,
      agentMessageId: agentMessage!.id,
      userId: user.id,
      thumbDirection: "up",
      content: null,
      isConversationShared: false,
      dismissed: false,
    });

    // Query feedbacks for conversation1: should be empty.
    const response = await getFeedbacks(workspace, conversation1.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).feedbacks).toEqual([]);
  });
});
