import type { Authenticator } from "@app/lib/auth";
import { ConversationGoalModel } from "@app/lib/models/agent/conversation_goal";
import {
  ConversationGoalResource,
  DEFAULT_GOAL_MAX_TURNS,
} from "@app/lib/resources/conversation_goal_resource";
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

  async function createGoal(
    currentAgentMessageId: string,
    maxTurns = DEFAULT_GOAL_MAX_TURNS
  ) {
    return withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        auth,
        {
          objective: "Ship and verify Goal Mode",
          conversation: conversationResource,
          branchId: null,
          agentConfigurationId: agent.sId,
          currentAgentMessageId,
          maxTurns,
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

  it("pauses instead of continuing behind newer user input", async () => {
    const { message } = await createAgentMessage("succeeded");
    await createGoal(message.sId);
    await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 2,
      content: "Follow this new direction",
    });

    expect(
      await ConversationGoalResource.claimContinuation(auth, {
        conversationId: conversation.sId,
        conversationBranchId: null,
        agentMessageId: message.sId,
      })
    ).toEqual({ type: "newer_message" });
    expect(
      (
        await ConversationGoalResource.fetchLatest(auth, {
          conversation: conversationResource,
        })
      )?.toJSON()
    ).toMatchObject({
      status: "paused",
      reason: "user_interrupted",
    });

    expect(
      await ConversationGoalResource.claimContinuation(auth, {
        conversationId: conversation.sId,
        conversationBranchId: null,
        agentMessageId: message.sId,
      })
    ).toEqual({ type: "already_processed" });
  });

  it.each([
    "turn_limit_reached",
    "paused_by_user",
    "blocked",
  ] as const)("extends the safety budget when resuming from %s", async (reason) => {
    const { message } = await createAgentMessage("succeeded");
    const goal = await createGoal(message.sId, 1);

    if (reason === "turn_limit_reached") {
      expect(
        await ConversationGoalResource.claimContinuation(auth, {
          conversationId: conversation.sId,
          conversationBranchId: null,
          agentMessageId: message.sId,
        })
      ).toEqual({ type: "turn_limit_reached" });
    } else if (reason === "paused_by_user") {
      expect(
        (
          await ConversationGoalResource.transitionByUser(auth, {
            conversation: conversationResource,
            branchId: null,
            action: "pause",
          })
        ).isOk()
      ).toBe(true);
    } else {
      await ConversationGoalModel.update(
        { status: "blocked", reason, terminalAt: new Date() },
        { where: { id: goal.id } }
      );
      expect(
        await ConversationGoalResource.fetchUnfinished(auth, {
          conversationModelId: conversation.id,
          branchId: null,
        })
      ).toMatchObject({ id: goal.id, status: "blocked" });
    }

    const resumed = await withTransaction((transaction) =>
      goal.lockForResume(auth, {
        conversation: conversationResource,
        branchId: null,
        transaction,
      })
    );
    expect(resumed.isOk()).toBe(true);
    if (resumed.isOk()) {
      expect(resumed.value).toMatchObject({
        status: "active",
        turnCount: 2,
        maxTurns: 1 + DEFAULT_GOAL_MAX_TURNS,
      });
    }
  });

  it("does not double-count a failed continuation retry", async () => {
    const { message } = await createAgentMessage("succeeded");
    const goal = await createGoal(message.sId);
    await ConversationGoalResource.claimContinuation(auth, {
      conversationId: conversation.sId,
      conversationBranchId: null,
      agentMessageId: message.sId,
    });
    await ConversationGoalResource.pauseForAgentMessage(auth, {
      conversationId: conversation.sId,
      conversationBranchId: null,
      agentMessageId: message.sId,
      reason: "continuation_failed",
    });

    const resumed = await withTransaction((transaction) =>
      goal.lockForResume(auth, {
        conversation: conversationResource,
        branchId: null,
        transaction,
      })
    );
    expect(resumed.isOk()).toBe(true);
    if (resumed.isOk()) {
      expect(resumed.value.turnCount).toBe(2);
    }
  });

  it("ignores a delayed failure from an older goal turn", async () => {
    const first = await createAgentMessage("succeeded");
    const goal = await createGoal(first.message.sId);
    await ConversationGoalResource.claimContinuation(auth, {
      conversationId: conversation.sId,
      conversationBranchId: null,
      agentMessageId: first.message.sId,
    });
    const second = await createAgentMessage("created", 2);

    await withTransaction(async (transaction) => {
      expect(
        await goal.setCurrentAgentMessage(auth, {
          conversation: conversationResource,
          branchId: null,
          agentMessageId: second.message.sId,
          agentConfigurationId: agent.sId,
          transaction,
        })
      ).toBe(true);
    });

    await ConversationGoalResource.pauseForAgentMessage(auth, {
      conversationId: conversation.sId,
      conversationBranchId: null,
      agentMessageId: first.message.sId,
      reason: "delayed_old_turn_failure",
    });
    expect(
      (
        await ConversationGoalResource.fetchLatest(auth, {
          conversation: conversationResource,
        })
      )?.status
    ).toBe("active");

    await ConversationGoalResource.pauseForAgentMessage(auth, {
      conversationId: conversation.sId,
      conversationBranchId: null,
      agentMessageId: second.message.sId,
      reason: "current_turn_failure",
    });
    expect(
      (
        await ConversationGoalResource.fetchLatest(auth, {
          conversation: conversationResource,
        })
      )?.status
    ).toBe("paused");
  });
});
