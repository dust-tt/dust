import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  isBlockedMock,
  messageFindMock,
  publishEventMock,
  removeEventMock,
} = vi.hoisted(() => ({
  isBlockedMock: vi.fn(),
  messageFindMock: vi.fn(),
  publishEventMock: vi.fn(),
  removeEventMock: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishConversationRelatedEvent: publishEventMock,
}));
vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => ({ removeEvent: removeEventMock }),
}));
vi.mock("@app/lib/models/agent/conversation", () => ({
  AgentMessageModel: { findOne: messageFindMock },
}));
vi.mock("@app/lib/resources/agent_mcp_action_resource", () => ({
  AgentMCPActionResource: {
    isBlockedForWorkspace: isBlockedMock,
  },
}));

import { publishDeferredEventsActivity } from "@app/temporal/agent_loop/activities/publish_deferred_events";

const DEFERRED_EVENT: DeferredEvent = {
  context: {
    agentMessageId: "message_id",
    agentMessageRowId: 1,
    conversationId: "conversation_id",
    step: 2,
    workspaceId: 3,
  },
  event: {
    type: "tool_ask_user_question",
    actionId: "action_id",
    configurationId: "configuration_id",
    conversationId: "conversation_id",
    created: 1,
    inputs: {},
    messageId: "message_id",
    metadata: {
      agentName: "agent",
      mcpServerName: "server",
      toolName: "tool",
    },
    question: {
      multiSelect: false,
      options: [],
      question: "Continue?",
    },
  },
  shouldPauseAgentLoop: true,
};

describe("publishDeferredEventsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageFindMock.mockResolvedValue({});
    publishEventMock.mockResolvedValue(undefined);
    removeEventMock.mockResolvedValue(undefined);
  });

  it("removes an event denied while it is being published", async () => {
    isBlockedMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const shouldPause = await publishDeferredEventsActivity([DEFERRED_EVENT]);

    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(removeEventMock).toHaveBeenCalledTimes(1);
    expect(shouldPause).toBe(false);
  });
});
