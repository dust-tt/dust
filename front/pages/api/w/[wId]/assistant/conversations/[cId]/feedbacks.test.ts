import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

import handler from "./feedbacks";

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

describe("GET /api/w/[wId]/assistant/conversations/[cId]/feedbacks", () => {
  it("returns empty feedbacks when none exist", async () => {
    const { req, res, authenticator } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.query.cId = conversation.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().feedbacks).toEqual([]);
  });

  it("returns feedbacks for the current user only", async () => {
    const { req, res, authenticator, workspace } =
      await createPrivateApiMockRequest({ method: "GET" });
    const user = authenticator.getNonNullableUser();

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    // rank 1 = first agent message, rank 3 = second agent message.
    const msg1 = await getMessageByRank(authenticator, conversation.id, 1);
    const msg2 = await getMessageByRank(authenticator, conversation.id, 3);
    const { agentMessage: am1 } = await ConversationFactory.getMessage(
      authenticator,
      msg1.id
    );
    const { agentMessage: am2 } = await ConversationFactory.getMessage(
      authenticator,
      msg2.id
    );

    await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
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
      agentMessageId: am2!.id,
      userId: user.id,
      thumbDirection: "down",
      content: "bad",
      isConversationShared: false,
      dismissed: false,
    });

    req.query.cId = conversation.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const feedbacks = res._getJSONData().feedbacks;
    expect(feedbacks).toHaveLength(2);

    const directions = feedbacks.map(
      (f: { thumbDirection: string }) => f.thumbDirection
    );
    expect(directions).toContain("up");
    expect(directions).toContain("down");
  });

  it("does not return feedbacks from other conversations", async () => {
    const { req, res, authenticator, workspace } =
      await createPrivateApiMockRequest({ method: "GET" });
    const user = authenticator.getNonNullableUser();

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conversation1 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const conversation2 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    const msg = await getMessageByRank(authenticator, conversation2.id, 1);
    const { agentMessage } = await ConversationFactory.getMessage(
      authenticator,
      msg.id
    );

    await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: 0,
      agentMessageId: agentMessage!.id,
      userId: user.id,
      thumbDirection: "up",
      content: null,
      isConversationShared: false,
      dismissed: false,
    });

    // Query feedbacks for conversation1: should be empty.
    req.query.cId = conversation1.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().feedbacks).toEqual([]);
  });
});
