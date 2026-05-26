import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/exit_events";
import { makeMCPToolExit } from "@app/lib/actions/mcp_internal_actions/utils";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

describe("getExitOrPauseEvents", () => {
  it("should normalize user cancellation early exits to non-errors", async () => {
    const output = makeMCPToolExit({
      message: "The tool execution was cancelled.",
      isError: true,
      reason: "user_cancellation",
    });

    const events = await getExitOrPauseEvents({} as Authenticator, {
      outputItems: output.content.map((content) => ({
        content,
      })),
      action: {} as AgentMCPActionResource,
      agentConfiguration: {
        sId: "agent-configuration-id",
      } as AgentConfigurationType,
      agentMessage: { sId: "agent-message-id" } as AgentMessageType,
      conversation: {
        sId: "conversation-id",
      } as ConversationWithoutContentType,
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
