import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { creditsExhaustedMessage } from "@app/temporal/agent_loop/activities/common";
import { logStuckToolsForErroredAgentMessage } from "@app/temporal/agent_loop/activities/finalize";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("creditsExhaustedMessage", () => {
  it("tells admins to purchase more credits", () => {
    const auth = { isAdmin: () => true } as unknown as Authenticator;
    expect(creditsExhaustedMessage(auth)).toBe(
      "Your workspace has run out of credits. Please purchase more credits to continue using Dust."
    );
  });

  it("tells members to contact their administrator", () => {
    const auth = { isAdmin: () => false } as unknown as Authenticator;
    expect(creditsExhaustedMessage(auth)).toBe(
      "Your workspace has run out of credits. Please contact your administrator to purchase more credits."
    );
  });
});

describe("logStuckToolsForErroredAgentMessage", () => {
  const error = {
    message: "Activity task timed out",
    name: "ActivityFailure",
    swallowed: true,
    activityType: "runToolActivity",
    retryState: "MAXIMUM_ATTEMPTS_REACHED",
    timeoutType: "HEARTBEAT",
  };

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
        swallowed: true,
        activityType: "runToolActivity",
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
