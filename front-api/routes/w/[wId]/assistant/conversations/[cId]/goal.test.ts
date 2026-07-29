import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(enableGoalMode: boolean) {
  const { workspace, auth, user } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (enableGoalMode) {
    await FeatureFlagFactory.basic(auth, "goal_mode");
  }
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  return { agent, auth, conversation, user, workspace };
}

function getGoal(workspaceId: string, conversationId: string) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/goal`
  );
}

describe("conversation goal API", () => {
  it("is gated by the Goal Mode feature flag", async () => {
    const { workspace, conversation } = await setupTest(false);
    const response = await getGoal(workspace.sId, conversation.sId);
    expect(response.status).toBe(403);
  });

  it("returns the latest goal", async () => {
    const { workspace, conversation, agent, auth, user } =
      await setupTest(true);
    const message = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 0,
      agentConfigurationId: agent.sId,
    });
    const agentMessageModelId = message.agentMessageId;
    if (agentMessageModelId === null) {
      throw new Error("Agent message not found");
    }
    await withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        auth,
        {
          objective: "Finish the release",
          conversationId: conversation.id,
          branchId: null,
          createdByUserId: user.id,
          agentConfigurationId: agent.sId,
          currentAgentMessageId: agentMessageModelId,
          maxTurns: 25,
        },
        transaction
      )
    );

    const response = await getGoal(workspace.sId, conversation.sId);
    expect(response.status).toBe(200);
    expect((await response.json()).goal).toMatchObject({
      objective: "Finish the release",
      status: "active",
    });
  });
});
