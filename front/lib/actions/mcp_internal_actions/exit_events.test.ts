import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/exit_events";
import { makeMCPToolExit } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { describe, expect, it } from "vitest";

describe("getExitOrPauseEvents", () => {
  it("should normalize user cancellation early exits to non-errors", async () => {
    const output = makeMCPToolExit({
      message: "The tool execution was cancelled.",
      isError: true,
      reason: "user_cancellation",
    });

    const events = await getExitOrPauseEvents({} as Authenticator, {
      outputItems: output.content.map((content) => ({ content })),
      toolContext: {
        // The early exit path only reads identifiers off the run context; a partial mock is
        // enough here.
        runContext: {
          contextType: "agent_loop",
          action: { functionCallName: "test_tool", augmentedInputs: {} },
          agentConfiguration: {
            sId: "agent-configuration-id",
            name: "Test Agent",
          },
          agentMessage: { sId: "agent-message-id" },
          conversation: { sId: "conversation-id" },
        } as AgentLoopRunContext,
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_early_exit",
      configurationId: "agent-configuration-id",
      conversationId: "conversation-id",
      messageId: "agent-message-id",
      text: "The tool execution was cancelled.",
      isError: false,
      reason: "user_cancellation",
    });
  });
});
