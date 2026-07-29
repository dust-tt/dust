import { UPDATE_GOAL_TOOL_NAME } from "@app/lib/api/actions/servers/goal_mode/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/goal_mode/tools";
import { ConversationBranchResource } from "@app/lib/resources/conversation_branch_resource";
import { ConversationGoalResource } from "@app/lib/resources/conversation_goal_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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
    const conversationResource = await ConversationResource.fetchById(
      setup.authenticator,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Expected conversation resource");
    }
    const { model, ...agentConfiguration } = agent;
    const branch = await ConversationBranchResource.makeNew(
      setup.authenticator,
      {
        state: "open",
        previousMessageId: agentMessage.id,
        conversationId: conversation.id,
        userId: setup.user.id,
      }
    );
    const branchTurn = await ConversationFactory.createAgentMessage(
      setup.authenticator,
      {
        workspace: setup.workspace,
        conversation,
        agentConfig: agent,
        branchId: branch.id,
      }
    );
    const branchAgentMessage = branchTurn.agentMessage;

    await withTransaction((transaction) =>
      ConversationGoalResource.makeNew(
        setup.authenticator,
        {
          objective: "Complete the release",
          conversation: conversationResource,
          branchId: branch.sId,
          agentConfigurationId: agent.sId,
          currentAgentMessageId: branchAgentMessage.sId,
          maxTurns: 25,
        },
        transaction
      )
    );

    const agentLoopData = {
      agentConfiguration,
      modelInfo: {
        endpoint: getTestStreamEndpoint(model.modelId),
        ...model,
      },
      agentMessage: branchAgentMessage,
      conversation: { ...conversation, branchId: branch.sId },
      userMessage,
    };

    expect(
      await ConversationGoalResource.fetchLatest(setup.authenticator, {
        conversation: conversationResource,
        branchId: null,
      })
    ).toBeNull();

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
    expect(instructions).not.toContain("Complete the release");
    expect(instructions).toContain("update_goal");

    const updateGoalTool = TOOLS.find(
      (tool) => tool.name === UPDATE_GOAL_TOOL_NAME
    );
    if (!updateGoalTool) {
      throw new Error("Expected update_goal tool");
    }
    const blocked = await updateGoalTool.handler({ status: "blocked" }, {
      auth: setup.authenticator,
      runContext: { contextType: "agent_loop", ...agentLoopData },
    } as unknown as Parameters<typeof updateGoalTool.handler>[1]);
    expect(blocked.isErr()).toBe(true);

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
      expect(completed.value.toJSON()).toMatchObject({
        status: "completed",
        reason: "Release checks passed",
      });
    }
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
