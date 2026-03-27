import { getEventMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { describe, expect, it } from "vitest";

describe("getEventMessageChannelId", () => {
  it("routes deferred tool file auth events to the parent message channel", () => {
    expect(
      getEventMessageChannelId({
        type: "tool_file_auth_required",
        created: Date.now(),
        configurationId: "config",
        messageId: "child-message",
        conversationId: "conversation",
        actionId: "action",
        metadata: {
          pubsubMessageId: "parent-message",
          toolName: "search",
          mcpServerName: "drive",
          agentName: "Agent",
          mcpServerDisplayName: "Drive",
          mcpServerId: "mcp_server",
        },
        inputs: {},
        fileAuthError: {
          fileId: "file",
          fileName: "spec.pdf",
          connectionId: "connection",
          mimeType: "application/pdf",
          toolName: "search",
          message: "Authorization required",
        },
      })
    ).toBe("message-parent-message");
  });
});
