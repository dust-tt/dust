import type { Authenticator } from "@app/lib/auth";
import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("ConversationGoalResource", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let conversation: ConversationType;
  let conversationResource: ConversationResource;
  let agent: LightAgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "builder" });
    auth = setup.authenticator;
    workspace = auth.getNonNullableWorkspace();
    agent = await AgentConfigurationFactory.createTestAgent(auth);
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const resource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!resource) {
      throw new Error("Conversation not found");
    }
    conversationResource = resource;
  });

  async function createAgentMessage(status: "created" | "succeeded", rank = 1) {
    const message = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank,
      agentConfigurationId: agent.sId,
    });
    const agentMessageModelId = message.agentMessageId;
    if (agentMessageModelId === null) {
      throw new Error("Agent message not found");
    }
    if (status === "succeeded") {
      await ConversationFactory.setAgentMessageStatus({
        workspace,
        agentMessageModelId,
        status,
      });
    }
    return { message, agentMessageModelId };
  }

  async function createGoal(currentAgentMessageId: string) {
    return withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        auth,
        {
          objective: "Ship and verify Goal Mode",
          conversation: conversationResource,
          branchId: null,
          agentConfigurationId: agent.sId,
          currentAgentMessageId,
          maxTurns: 25,
        },
        transaction
      )
    );
  }

  it("recovers an abandoned continuation claim", async () => {
    const { message } = await createAgentMessage("succeeded");
    const goal = await createGoal(message.sId);

    expect(
      await ConversationGoalResource.claimContinuation(auth, {
        conversationId: conversation.sId,
        conversationBranchId: null,
        agentMessageId: message.sId,
      })
    ).toMatchObject({ type: "continue", goal: { turnCount: 2 } });
    expect(
      await ConversationGoalResource.claimContinuation(auth, {
        conversationId: conversation.sId,
        conversationBranchId: null,
        agentMessageId: message.sId,
      })
    ).toMatchObject({ type: "continue", goal: { turnCount: 2 } });

    const next = await createAgentMessage("created", 2);
    await withTransaction(async (transaction) => {
      expect(
        await goal.setCurrentAgentMessage(auth, {
          conversation: conversationResource,
          branchId: null,
          agentMessageId: next.message.sId,
          agentConfigurationId: agent.sId,
          transaction,
        })
      ).toBe(true);
    });
    await withTransaction(async (transaction) => {
      expect(
        await goal.setCurrentAgentMessage(auth, {
          conversation: conversationResource,
          branchId: null,
          agentMessageId: next.message.sId,
          agentConfigurationId: agent.sId,
          transaction,
        })
      ).toBe(false);
    });
    expect(
      (
        await ConversationGoalResource.fetchLatest(auth, {
          conversation: conversationResource,
        })
      )?.currentAgentMessageId
    ).toBe(next.agentMessageModelId);

    expect(
      await ConversationGoalResource.claimContinuation(auth, {
        conversationId: conversation.sId,
        conversationBranchId: null,
        agentMessageId: message.sId,
      })
    ).toMatchObject({ type: "ensure_current", goal: { turnCount: 2 } });
  });

  it("does not claim an unfinished agent turn", async () => {
    const { message } = await createAgentMessage("created");
    await createGoal(message.sId);

    expect(
      await ConversationGoalResource.claimContinuation(auth, {
        conversationId: conversation.sId,
        conversationBranchId: null,
        agentMessageId: message.sId,
      })
    ).toEqual({ type: "not_succeeded" });
    expect(
      (
        await ConversationGoalResource.fetchLatest(auth, {
          conversation: conversationResource,
        })
      )?.turnCount
    ).toBe(1);
  });
});
