import type { AuthenticatorType } from "@app/lib/auth";
import type { DeferredEvent } from "@app/temporal/agent_loop/lib/deferred_events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  actionRequiredMock,
  authMock,
  authTypeMock,
  conversationFetchMock,
  fetchBlockedMock,
  lockMock,
  markRequiredMock,
  messageFindMock,
  notifyMock,
  publishEventMock,
  transaction,
} = vi.hoisted(() => ({
  actionRequiredMock: vi.fn(),
  authMock: {},
  authTypeMock: {
    authMethod: "session",
    workspaceId: "workspace_id",
    userId: "user_id",
    role: "user",
    groupIds: [],
    subscriptionId: null,
    isByok: false,
  },
  conversationFetchMock: vi.fn(),
  fetchBlockedMock: vi.fn(),
  lockMock: vi.fn(),
  markRequiredMock: vi.fn(),
  messageFindMock: vi.fn(),
  notifyMock: vi.fn(),
  publishEventMock: vi.fn(),
  transaction: {},
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishConversationRelatedEvent: publishEventMock,
}));
vi.mock("@app/lib/api/assistant/conversation/lock", () => ({
  getConversationLockById: lockMock,
}));
vi.mock("@app/lib/utils/sql_utils", () => ({
  withTransaction: (fn: (transaction: unknown) => unknown) => fn(transaction),
}));
vi.mock("@app/lib/resources/string_ids", () => ({
  getResourceIdFromSId: () => 42,
}));
vi.mock("@app/lib/models/agent/conversation", () => ({
  AgentMessageModel: { findAll: messageFindMock },
}));
vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJsonWithRefrehedGroups: vi.fn().mockResolvedValue(authMock),
  },
}));
vi.mock("@app/lib/notifications/workflows/manual-action-required", () => ({
  notifyManualActionRequired: notifyMock,
}));
vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchById: conversationFetchMock,
    getActionRequiredAndLastReadAtForUser: actionRequiredMock,
    markAsActionRequired: markRequiredMock,
  },
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
    originActionId: "origin_action_id",
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
    messageFindMock.mockResolvedValue([{ id: 1 }]);
    publishEventMock.mockResolvedValue(undefined);
    lockMock.mockResolvedValue(undefined);
    conversationFetchMock.mockResolvedValue({
      id: 42,
      toJSON: () => ({ sId: "conversation_id" }),
    });
    actionRequiredMock.mockResolvedValue({
      actionRequired: false,
      lastReadAt: null,
    });
    markRequiredMock.mockResolvedValue(undefined);
  });

  it("skips a nested event whose originating action is no longer blocked", async () => {
    fetchBlockedMock.mockResolvedValueOnce(new Set(["action_id"]));

    const shouldPause = await publishDeferredEventsActivity([DEFERRED_EVENT]);

    expect(fetchBlockedMock).toHaveBeenCalledWith({
      actionIds: ["action_id", "origin_action_id"],
      workspaceModelId: 3,
      transaction,
    });
    expect(publishEventMock).not.toHaveBeenCalled();
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
    fetchBlockedMock.mockResolvedValueOnce(
      new Set(["action_id", "origin_action_id"])
    );

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

  it("skips publication after the agent message terminated", async () => {
    messageFindMock.mockResolvedValueOnce([]);
    fetchBlockedMock.mockResolvedValueOnce(
      new Set(["action_id", "origin_action_id"])
    );

    const shouldPause = await publishDeferredEventsActivity([DEFERRED_EVENT]);

    expect(lockMock).toHaveBeenCalledWith(expect.any(Number), transaction);
    expect(publishEventMock).not.toHaveBeenCalled();
    expect(shouldPause).toBe(false);
  });

  it("marks action required only after retaining a current event", async () => {
    fetchBlockedMock.mockResolvedValueOnce(
      new Set(["action_id", "origin_action_id"])
    );
    const event = {
      ...DEFERRED_EVENT,
      context: {
        ...DEFERRED_EVENT.context,
        authType: authTypeMock as AuthenticatorType,
      },
    };

    await publishDeferredEventsActivity([event]);

    expect(markRequiredMock).toHaveBeenCalledWith(authMock, {
      conversation: expect.objectContaining({
        actionRequired: false,
        sId: "conversation_id",
      }),
      transaction,
    });
    expect(notifyMock).toHaveBeenCalledWith(authMock, {
      actionId: "action_id",
      conversationId: "conversation_id",
    });
  });

  it("does not restore action required for a terminated message", async () => {
    messageFindMock.mockResolvedValueOnce([]);
    fetchBlockedMock.mockResolvedValueOnce(
      new Set(["action_id", "origin_action_id"])
    );
    const event = {
      ...DEFERRED_EVENT,
      context: {
        ...DEFERRED_EVENT.context,
        authType: authTypeMock as AuthenticatorType,
      },
    };

    await publishDeferredEventsActivity([event]);

    expect(markRequiredMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
