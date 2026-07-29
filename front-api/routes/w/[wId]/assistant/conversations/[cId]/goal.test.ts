import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import {
  ConversationGoalResource,
  DEFAULT_GOAL_MAX_TURNS,
} from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

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

function getGoal(
  workspaceId: string,
  conversationId: string,
  branchId?: string
) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/goal${
      branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""
    }`
  );
}

function patchGoal(
  workspaceId: string,
  conversationId: string,
  branchId?: string
) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/goal`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause", branchId }),
    }
  );
}

describe("conversation goal API", () => {
  it("is gated by the Goal Mode feature flag", async () => {
    const { workspace, conversation } = await setupTest(false);
    const response = await getGoal(workspace.sId, conversation.sId);
    expect(response.status).toBe(403);
  });

  it("returns and updates the latest goal", async () => {
    const { workspace, conversation, agent, auth } = await setupTest(true);
    const message = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 0,
      agentConfigurationId: agent.sId,
    });
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }
    await withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        auth,
        {
          objective: "Finish the release",
          conversation: conversationResource,
          branchId: null,
          agentConfigurationId: agent.sId,
          currentAgentMessageId: message.sId,
          maxTurns: DEFAULT_GOAL_MAX_TURNS,
        },
        transaction
      )
    );

    const response = await getGoal(workspace.sId, conversation.sId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canManage: true,
      goal: {
        objective: "Finish the release",
        status: "active",
      },
    });

    const paused = await patchGoal(workspace.sId, conversation.sId);
    expect(paused.status).toBe(200);
    expect((await paused.json()).goal).toMatchObject({
      status: "paused",
      reason: "paused_by_user",
    });

    await createPrivateApiMockRequest({
      role: "admin",
      workspace,
    });
    const nonOwnerView = await getGoal(workspace.sId, conversation.sId);
    expect((await nonOwnerView.json()).canManage).toBe(false);
    expect((await patchGoal(workspace.sId, conversation.sId)).status).toBe(403);
  });

  it("returns a branch goal and rejects a branch from another conversation", async () => {
    const { workspace, conversation, agent, auth, user } =
      await setupTest(true);
    const rootMessage = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 0,
      agentConfigurationId: agent.sId,
    });
    const branch = await ConversationBranchResource.makeNew(auth, {
      state: "open",
      previousMessageId: rootMessage.id,
      conversationId: conversation.id,
      userId: user.id,
    });
    const branchTurn = await ConversationFactory.createAgentMessage(auth, {
      workspace,
      conversation,
      agentConfig: agent,
      branchId: branch.id,
    });
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }
    await withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        auth,
        {
          objective: "Finish the branch",
          conversation: conversationResource,
          branchId: branch.sId,
          agentConfigurationId: agent.sId,
          currentAgentMessageId: branchTurn.messageRow.sId,
          maxTurns: DEFAULT_GOAL_MAX_TURNS,
        },
        transaction
      )
    );

    const response = await getGoal(workspace.sId, conversation.sId, branch.sId);
    expect(response.status).toBe(200);
    expect((await response.json()).goal.objective).toBe("Finish the branch");
    const paused = await patchGoal(workspace.sId, conversation.sId, branch.sId);
    expect(paused.status).toBe(200);
    expect((await paused.json()).goal.status).toBe("paused");

    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const otherMessage = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: otherConversation.id,
      rank: 0,
      agentConfigurationId: agent.sId,
    });
    const foreignBranch = await ConversationBranchResource.makeNew(auth, {
      state: "open",
      previousMessageId: otherMessage.id,
      conversationId: otherConversation.id,
      userId: user.id,
    });
    const foreignResponse = await getGoal(
      workspace.sId,
      conversation.sId,
      foreignBranch.sId
    );
    expect(foreignResponse.status).toBe(404);
  });
});
