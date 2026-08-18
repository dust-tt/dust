import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/exit_events";
import {
  makeMCPToolExit,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { describe, expect, it, vi } from "vitest";

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

  it("should include the tool display label in personal authentication events", async () => {
    const output = makePersonalAuthenticationError("google_drive");

    const events = await getExitOrPauseEvents(
      { user: () => null } as Authenticator,
      {
        outputItems: output.content.map((content) => ({ content })),
        toolContext: {
          runContext: {
            contextType: "sandbox_function",
            // This branch only reads the fields below from the action resource.
            // @ts-expect-error Deliberately use a partial resource to keep this a unit test.
            action: {
              sId: "action-id",
              toolName: "custom_personal_auth_tool",
              inputs: {},
              updateStatus: vi.fn(),
            },
            invocation: {
              sId: "invocation-id",
              // This branch only reads the sandbox function's stable identifier.
              // @ts-expect-error Deliberately use a partial resource to keep this a unit test.
              sandboxFunction: { sId: "sandbox-function-id" },
            },
            // This branch only reads tool identity and display-label fields.
            // @ts-expect-error Deliberately use a partial configuration to keep this a unit test.
            toolConfiguration: {
              originalName: "custom_personal_auth_tool",
              mcpServerName: "custom_personal_auth_server",
              toolServerId: "remote-server-id",
              displayLabels: {
                running: "Using custom tool",
                done: "Use custom tool",
              },
            },
          },
        },
      }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_personal_auth_required",
      metadata: {
        displayLabel: "Using custom tool",
      },
    });
  });
});
