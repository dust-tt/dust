import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ModelId } from "@app/types/shared/model_id";
import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "../auth";

async function createConvWithAgentMessage(
  auth: Authenticator,
  agentSId: string
) {
  const workspace = auth.getNonNullableWorkspace();
  const conv = await ConversationFactory.create(auth, {
    agentConfigurationId: agentSId,
    messagesCreatedAt: [],
  });
  const messageRow = await ConversationFactory.createAgentMessageWithRank({
    workspace,
    conversationId: conv.id as ModelId,
    rank: 0,
    agentConfigurationId: agentSId,
  });
  return { conv, agentMessageId: messageRow.agentMessageId! };
}

describe("AgentMessageFeedbackResource.getFeedbackCountsByConversationIds", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "builder" });
    auth = setup.authenticator;
  });

  it("returns empty map when no conversation IDs are provided", async () => {
    const result =
      await AgentMessageFeedbackResource.getFeedbackCountsByConversationIds(
        auth,
        []
      );
    expect(result.size).toBe(0);
  });

  it("returns empty map when conversations have no feedback", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { conv } = await createConvWithAgentMessage(auth, agent.sId);

    const result =
      await AgentMessageFeedbackResource.getFeedbackCountsByConversationIds(
        auth,
        [conv.id as ModelId]
      );
    expect(result.size).toBe(0);
  });

  it("counts feedback per conversation correctly", async () => {
    const workspace = auth.getNonNullableWorkspace();
    const userId = auth.getNonNullableUser().id;
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const { conv: conv1, agentMessageId: amId1a } =
      await createConvWithAgentMessage(auth, agent.sId);
    // Create a second agent message in conv1 at a different rank.
    const msgRow1b = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv1.id as ModelId,
      rank: 2,
      agentConfigurationId: agent.sId,
    });
    const amId1b = msgRow1b.agentMessageId!;

    const { conv: conv2, agentMessageId: amId2 } =
      await createConvWithAgentMessage(auth, agent.sId);

    // Add 2 feedbacks to conv1 (one per agent message), 1 to conv2.
    for (const amId of [amId1a, amId1b]) {
      await AgentMessageFeedbackResource.makeNew({
        workspaceId: workspace.id,
        agentConfigurationId: agent.sId,
        agentConfigurationVersion: agent.version,
        conversationId: conv1.id,
        agentMessageId: amId,
        userId,
        thumbDirection: "up",
        content: null,
        isConversationShared: false,
        dismissed: false,
      });
    }

    await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      conversationId: conv2.id,
      agentMessageId: amId2,
      userId,
      thumbDirection: "down",
      content: null,
      isConversationShared: false,
      dismissed: false,
    });

    const result =
      await AgentMessageFeedbackResource.getFeedbackCountsByConversationIds(
        auth,
        [conv1.id as ModelId, conv2.id as ModelId]
      );

    expect(result.get(conv1.id as ModelId)).toBe(2);
    expect(result.get(conv2.id as ModelId)).toBe(1);
  });

  it("ignores conversations not in the requested list", async () => {
    const workspace = auth.getNonNullableWorkspace();
    const userId = auth.getNonNullableUser().id;
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const { conv: conv1, agentMessageId: amId1 } =
      await createConvWithAgentMessage(auth, agent.sId);
    const { conv: conv2, agentMessageId: amId2 } =
      await createConvWithAgentMessage(auth, agent.sId);

    // Add feedback to both conversations.
    for (const [conv, amId] of [
      [conv1, amId1],
      [conv2, amId2],
    ] as const) {
      await AgentMessageFeedbackResource.makeNew({
        workspaceId: workspace.id,
        agentConfigurationId: agent.sId,
        agentConfigurationVersion: agent.version,
        conversationId: conv.id,
        agentMessageId: amId,
        userId,
        thumbDirection: "up",
        content: null,
        isConversationShared: false,
        dismissed: false,
      });
    }

    // Only request conv1.
    const result =
      await AgentMessageFeedbackResource.getFeedbackCountsByConversationIds(
        auth,
        [conv1.id as ModelId]
      );

    expect(result.size).toBe(1);
    expect(result.get(conv1.id as ModelId)).toBe(1);
    expect(result.has(conv2.id as ModelId)).toBe(false);
  });
});
