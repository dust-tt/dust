import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { goalModeSkill } from "@app/lib/resources/skill/code_defined/system/goal_mode";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { beforeEach, describe, expect, it } from "vitest";

describe("goalModeSkill", () => {
  let setup: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    setup = await createResourceTest({ role: "builder" });
  });

  it("is restricted until the Goal Mode feature flag is enabled", async () => {
    expect(await goalModeSkill.isRestricted(setup.authenticator)).toBe(true);

    await FeatureFlagFactory.basic(setup.authenticator, "goal_mode");

    expect(await goalModeSkill.isRestricted(setup.authenticator)).toBe(false);
  });

  it("auto-enables only for the active goal agent and exposes goal instructions", async () => {
    await FeatureFlagFactory.basic(setup.authenticator, "goal_mode");
    const agent = await AgentConfigurationFactory.createTestAgent(
      setup.authenticator
    );
    const conversation = await ConversationFactory.create(setup.authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    const userMessage = conversation.content
      .flat()
      .find((message) => message.type === "user_message");
    const agentMessage = conversation.content
      .flat()
      .find((message) => message.type === "agent_message");
    if (!userMessage || !agentMessage) {
      throw new Error("Expected one user and agent message");
    }

    await withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        setup.authenticator,
        {
          objective: "Complete the release",
          conversationId: conversation.id,
          branchId: null,
          createdByUserId: setup.user.id,
          agentConfigurationId: agent.sId,
          currentAgentMessageId: agentMessage.agentMessageId,
          maxTurns: 25,
        },
        transaction
      )
    );

    const { model, ...agentConfiguration } = agent;
    const agentLoopData = {
      agentConfiguration,
      modelInfo: {
        endpoint: getTestStreamEndpoint(model.modelId),
        ...model,
      },
      agentMessage,
      conversation,
      userMessage,
    };

    expect(
      await goalModeSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation,
        agentLoopData,
        auth: setup.authenticator,
      })
    ).toBe("enabled");

    const instructions = await goalModeSkill.fetchInstructions(
      setup.authenticator,
      {
        spaceIds: [],
        agentLoopData,
      }
    );
    expect(instructions).toContain("<active_goal>\nComplete the release");
    expect(instructions).toContain("This is turn 1 of at most 25");
    expect(instructions).toContain("update_goal");

    const completed = await ConversationGoalResource.updateFromAgent(
      setup.authenticator,
      {
        agentLoopData,
        status: "complete",
        reason: "Release checks passed",
      }
    );
    expect(completed.isOk()).toBe(true);
    if (completed.isOk()) {
      expect(completed.value).toMatchObject({
        status: "completed",
        reason: "Release checks passed",
      });
    }
    expect(
      (
        await ConversationGoalResource.updateFromAgent(setup.authenticator, {
          agentLoopData,
          status: "complete",
          reason: "Release checks passed",
        })
      ).isOk()
    ).toBe(true);

    expect(
      await goalModeSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation,
        agentLoopData,
        auth: setup.authenticator,
      })
    ).toBeUndefined();
  });
});
