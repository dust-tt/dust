import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import type { MessageStreamBatchEvent } from "@app/lib/api/assistant/pubsub";
import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/pubsub", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/assistant/pubsub")>();
  return {
    ...mod,
    getMessagesEventsBatch: vi.fn(),
  };
});

import { getMessagesEventsBatch } from "@app/lib/api/assistant/pubsub";

async function getMessageIdByRank(
  auth: Authenticator,
  conversationId: string,
  rank: number
): Promise<string> {
  const messagesRes = await fetchConversationMessages(auth, {
    conversationId,
    limit: 100,
    lastRank: null,
    viewType: "light",
  });
  if (messagesRes.isErr()) {
    throw messagesRes.error;
  }
  const message = messagesRes.value.messages.find((m) => m.rank === rank);
  if (!message) {
    throw new Error(`No message found at rank ${rank}`);
  }
  return message.sId;
}

function pollMessageEvents({
  workspaceId,
  conversationId,
  messageId,
  lastEventId,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  lastEventId?: string;
}) {
  const query = lastEventId ? `?lastEventId=${lastEventId}` : "";
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/events/poll${query}`
  );
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events/poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await pollMessageEvents({
      workspaceId: workspace.sId,
      conversationId: "conv_unknown",
      messageId: "msg_unknown",
    });

    expect(response.status).toBe(404);
  });

  it("returns serialized events after the requested event ID", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const messageId = await getMessageIdByRank(auth, conversation.sId, 1);
    const events: MessageStreamBatchEvent[] = [
      {
        eventId: "evt_2",
        data: {
          type: "generation_tokens",
          created: 0,
          configurationId: "dust",
          messageId,
          text: "hello",
          classification: "tokens",
          step: 0,
        },
      },
    ];
    vi.mocked(getMessagesEventsBatch).mockResolvedValue(events);

    const response = await pollMessageEvents({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId,
      lastEventId: "evt_1",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      events: events.map((event) => JSON.stringify(event)),
    });
    expect(getMessagesEventsBatch).toHaveBeenCalledWith({
      messageId,
      lastEventId: "evt_1",
      signal: expect.any(AbortSignal),
    });
  });

  it("returns end-of-stream when a completed message has no events after the cursor", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const messageId = await getMessageIdByRank(auth, conversation.sId, 1);
    const message = await MessageModel.findOne({
      where: { sId: messageId, workspaceId: workspace.id },
    });
    if (!message?.agentMessageId) {
      throw new Error("Expected an agent message.");
    }
    vi.mocked(getMessagesEventsBatch).mockResolvedValue([]);

    const activeResponse = await pollMessageEvents({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId,
      lastEventId: "1-0",
    });
    expect(await activeResponse.json()).toEqual({ events: [] });

    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: message.agentMessageId,
      status: "succeeded",
    });

    const response = await pollMessageEvents({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId,
      lastEventId: "1-0",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      events: [
        JSON.stringify({
          eventId: "end-of-stream",
          data: { type: "end-of-stream" },
        }),
      ],
    });
  });
});
