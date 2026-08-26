import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { creditsExhaustedMessage } from "@app/temporal/agent_loop/activities/common";
import { logStuckToolsForErroredAgentMessage } from "@app/temporal/agent_loop/activities/finalize";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
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
  const auth = {
    getNonNullableWorkspace: () => ({ sId: "workspace-1" }),
  } as unknown as Authenticator;
  const agentLoopArgs = {
    conversationId: "conversation-1",
    agentMessageId: "message-1",
    agentMessageVersion: 0,
  } as AgentLoopArgs;
  const error = { message: "Activity task timed out", name: "ActivityFailure" };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the non-final actions as stuck tools", async () => {
    vi.spyOn(
      AgentMCPActionResource,
      "listNonFinalActionsForAgentMessage"
    ).mockResolvedValue([
      {
        id: 42,
        status: "running",
        toolConfiguration: { name: "notion-search", mcpServerName: "notion" },
      },
    ] as unknown as AgentMCPActionResource[]);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => true);

    await logStuckToolsForErroredAgentMessage(auth, {
      agentLoopArgs,
      agentMessageModelId: 1,
      error,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowErrorName: "ActivityFailure",
        stuckTools: [
          {
            actionModelId: 42,
            status: "running",
            toolName: "notion-search",
            mcpServerName: "notion",
          },
        ],
      }),
      "Agent loop finalized as errored"
    );
  });

  it("does not throw when the actions query fails, and still logs the failure cause", async () => {
    vi.spyOn(
      AgentMCPActionResource,
      "listNonFinalActionsForAgentMessage"
    ).mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => true);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => true);

    await expect(
      logStuckToolsForErroredAgentMessage(auth, {
        agentLoopArgs,
        agentMessageModelId: 1,
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
