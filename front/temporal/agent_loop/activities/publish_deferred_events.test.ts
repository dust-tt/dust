import type { AgentLoopMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { expect, it, vi } from "vitest";

const publishConversationRelatedEvent = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/api/assistant/streaming/events", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/lib/api/assistant/streaming/events")
  >()),
  publishConversationRelatedEvent,
}));

import { publishDeferredEventsActivity } from "./publish_deferred_events";

it("marks only the final deferred approval as the last blocking event", async () => {
  const { authenticator, workspace } = await createResourceTest({});
  const agentConfig =
    await AgentConfigurationFactory.createTestAgent(authenticator);
  const conversation = await ConversationFactory.create(authenticator, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(
    authenticator,
    { workspace, conversation, agentConfig }
  );
  const context = {
    agentMessageId: agentMessage.sId,
    agentMessageRowId: agentMessage.agentMessageId,
    conversationId: conversation.sId,
    step: 0,
    workspaceId: workspace.id,
  };
  const approvalEvent = {
    type: "tool_approve_execution",
    actionId: "action-1",
    created: Date.now(),
    metadata: {
      toolName: "test-tool",
      mcpServerName: "test-server",
      agentName: "test-agent",
    },
    inputs: {},
    configurationId: agentConfig.sId,
    messageId: agentMessage.sId,
    conversationId: conversation.sId,
  } satisfies AgentLoopMCPApproveExecutionEvent;
  const deferredEvents: DeferredEvent[] = [
    { context, event: approvalEvent, shouldPauseAgentLoop: true },
    {
      context,
      event: { ...approvalEvent, actionId: "action-2" },
      shouldPauseAgentLoop: true,
    },
  ];
  publishConversationRelatedEvent.mockClear();

  expect(await publishDeferredEventsActivity(deferredEvents)).toBe(true);
  expect(publishConversationRelatedEvent).toHaveBeenCalledTimes(2);
  expect(publishConversationRelatedEvent).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      event: expect.objectContaining({ isLastBlockingEventForStep: false }),
    })
  );
  expect(publishConversationRelatedEvent).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      event: expect.objectContaining({ isLastBlockingEventForStep: true }),
    })
  );
});
