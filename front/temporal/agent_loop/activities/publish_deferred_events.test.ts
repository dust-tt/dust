import * as streamingEvents from "@app/lib/api/assistant/streaming/events";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it, vi } from "vitest";

import { publishDeferredEventsActivity } from "./publish_deferred_events";

describe("publishDeferredEventsActivity", () => {
  it("marks deferred tool file auth events as the last blocking event for the step", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Test Agent",
      }
    );
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      authenticator,
      {
        workspace,
        conversation,
        agentConfig,
      }
    );

    const publishSpy = vi
      .spyOn(streamingEvents, "publishConversationRelatedEvent")
      .mockResolvedValue();

    try {
      await publishDeferredEventsActivity([
        {
          event: {
            type: "tool_file_auth_required",
            created: Date.now(),
            configurationId: agentConfig.sId,
            conversationId: conversation.sId,
            messageId: "child-message",
            actionId: "action",
            metadata: {
              toolName: "search",
              mcpServerName: "server",
              agentName: "Child Agent",
              mcpServerDisplayName: "Server",
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
          },
          context: {
            agentMessageId: agentMessage.sId,
            agentMessageRowId: agentMessage.agentMessageId,
            conversationId: conversation.sId,
            step: 4,
            workspaceId: workspace.id,
          },
          shouldPauseAgentLoop: true,
        },
      ]);

      expect(publishSpy).toHaveBeenCalledWith({
        conversationId: conversation.sId,
        event: expect.objectContaining({
          type: "tool_file_auth_required",
          isLastBlockingEventForStep: true,
          metadata: expect.objectContaining({
            pubsubMessageId: agentMessage.sId,
          }),
        }),
        step: 4,
      });
    } finally {
      publishSpy.mockRestore();
    }
  });
});
