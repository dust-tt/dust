import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { creditStopMessage } from "@app/temporal/agent_loop/activities/common";
import { logStuckToolsForErroredAgentMessage } from "@app/temporal/agent_loop/activities/finalize";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("creditStopMessage", () => {
  it("tells admins to purchase more credits when the pool is exhausted", async () => {
    const { authenticator: admin } = await createResourceTest({
      role: "admin",
    });
    expect(creditStopMessage(admin, "credits_exhausted")).toBe(
      "Your workspace has run out of credits. Please purchase more credits to continue using Dust."
    );
  });

  it("tells members to contact their administrator when the pool is exhausted", async () => {
    const { authenticator: member } = await createResourceTest({
      role: "user",
    });
    expect(creditStopMessage(member, "credits_exhausted")).toBe(
      "Your workspace has run out of credits. Please contact your administrator to purchase more credits."
    );
  });

  it("names the personal cap, not the workspace pool, when the user cap is reached", async () => {
    const { authenticator: member } = await createResourceTest({
      role: "user",
    });
    expect(creditStopMessage(member, "user_cap_reached")).toBe(
      "You have reached your personal usage cap. Please contact your administrator to increase it."
    );
  });

  it("points members to their group managers when their shared usage limit is reached", async () => {
    const { authenticator: member } = await createResourceTest({
      role: "user",
    });
    expect(creditStopMessage(member, "group_shared_usage_limit_reached")).toBe(
      "Your group has reached its shared usage limit. Please contact your group managers or administrator to increase it."
    );
  });

  it("names the missing seat when the user has none", async () => {
    const { authenticator: member } = await createResourceTest({
      role: "user",
    });
    expect(creditStopMessage(member, "no_seat")).toBe(
      "You don't have a seat assigned in this workspace. Please contact your administrator to assign you one."
    );
  });
});

describe("logStuckToolsForErroredAgentMessage", () => {
  const error = { message: "Activity task timed out", name: "ActivityFailure" };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup() {
    const { workspace, authenticator: auth } = await createResourceTest({});
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const { agentMessage, action } =
      await AgentMCPActionFactory.createWithAgentMessage(auth, {
        workspace,
        conversation,
        status: "running",
      });

    return {
      auth,
      action,
      agentLoopArgs: {
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
      },
      agentMessageModelId: agentMessage.agentMessageId,
    };
  }

  it("logs the non-final actions as stuck tools", async () => {
    const { auth, action, agentLoopArgs, agentMessageModelId } = await setup();
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => true);

    await logStuckToolsForErroredAgentMessage(auth, {
      agentLoopArgs,
      agentMessageModelId,
      error,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowErrorName: "ActivityFailure",
        stuckTools: [
          {
            actionModelId: action.id,
            status: "running",
            toolName: action.toolConfiguration.name,
            mcpServerName: action.toolConfiguration.mcpServerName,
          },
        ],
      }),
      "Agent loop finalized as errored"
    );
  });

  it("does not throw when the actions query fails, and still logs the failure cause", async () => {
    const { auth, agentLoopArgs, agentMessageModelId } = await setup();
    vi.spyOn(
      AgentMCPActionResource,
      "listNonFinalActionsForAgentMessage"
    ).mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => true);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => true);

    await expect(
      logStuckToolsForErroredAgentMessage(auth, {
        agentLoopArgs,
        agentMessageModelId,
        error,
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stuckTools: [] }),
      "Agent loop finalized as errored"
    );
  });
});
