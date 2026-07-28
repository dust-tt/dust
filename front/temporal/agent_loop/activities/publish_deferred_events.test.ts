import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchBlockedMock, messageFindMock, publishEventMock, removeEventMock } =
  vi.hoisted(() => ({
    fetchBlockedMock: vi.fn(),
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
    fetchBlockedActionIds: fetchBlockedMock,
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
    fetchBlockedMock.mockReset();
    messageFindMock.mockResolvedValue({});
    publishEventMock.mockResolvedValue(undefined);
    removeEventMock.mockResolvedValue(undefined);
  });

  it("removes an event denied while it is being published", async () => {
    fetchBlockedMock
      .mockResolvedValueOnce(new Set(["action_id"]))
      .mockResolvedValueOnce(new Set());

    const shouldPause = await publishDeferredEventsActivity([DEFERRED_EVENT]);

    expect(fetchBlockedMock).toHaveBeenCalledTimes(2);
    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(removeEventMock).toHaveBeenCalledTimes(1);
    expect(shouldPause).toBe(false);
  });

  it("marks the last active event as the last blocking event", async () => {
    const staleEvent: DeferredEvent = {
      ...DEFERRED_EVENT,
      event: {
        ...DEFERRED_EVENT.event,
        actionId: "stale_action_id",
      },
    };
    fetchBlockedMock
      .mockResolvedValueOnce(new Set(["action_id"]))
      .mockResolvedValueOnce(new Set(["action_id"]));

    const shouldPause = await publishDeferredEventsActivity([
      DEFERRED_EVENT,
      staleEvent,
    ]);

    expect(publishEventMock).toHaveBeenCalledOnce();
    expect(publishEventMock).toHaveBeenCalledWith({
      conversationId: "conversation_id",
      event: expect.objectContaining({
        actionId: "action_id",
        isLastBlockingEventForStep: true,
      }),
      step: 2,
    });
    expect(shouldPause).toBe(true);
  });

  it("publishes a last marker when the last action resolves during publication", async () => {
    const lastEvent: DeferredEvent = {
      ...DEFERRED_EVENT,
      event: {
        ...DEFERRED_EVENT.event,
        actionId: "last_action_id",
      },
    };
    fetchBlockedMock
      .mockResolvedValueOnce(new Set(["action_id", "last_action_id"]))
      .mockResolvedValueOnce(new Set(["action_id"]));

    const shouldPause = await publishDeferredEventsActivity([
      DEFERRED_EVENT,
      lastEvent,
    ]);

    expect(publishEventMock).toHaveBeenCalledTimes(2);
    expect(publishEventMock).toHaveBeenLastCalledWith({
      conversationId: "conversation_id",
      event: expect.objectContaining({
        actionId: "last_action_id",
        isLastBlockingEventForStep: true,
      }),
      step: 2,
    });
    expect(removeEventMock).toHaveBeenCalledOnce();
    expect(shouldPause).toBe(true);
  });
});
