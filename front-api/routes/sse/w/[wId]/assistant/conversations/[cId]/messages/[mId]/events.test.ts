import { fetchConversationMessages } from "@app/lib/api/assistant/messages";
import type { MessageStreamEvent } from "@app/lib/api/assistant/pubsub";
import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import {
  asyncIteratorFrom,
  parseSseDataPayloads,
} from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Smoke coverage only: the handler logic (conversation/message resolution,
// agent-message validation, error codepaths) lives in and is tested against the
// v1 sibling. These tests confirm the private route wires workspace auth +
// the private (identity) transform.

async function getMessageSIdByRank(
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

vi.mock("@app/lib/api/assistant/pubsub", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/assistant/pubsub")>();
  return {
    ...mod,
    getMessagesEvents: vi.fn(),
  };
});

import { getMessagesEvents } from "@app/lib/api/assistant/pubsub";

function getMessageEvents(
  workspaceId: string,
  conversationId: string,
  messageId: string
) {
  return honoApp.request(
    `/api/sse/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/events`
  );
}

describe("GET /api/sse/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await getMessageEvents(
      workspace.sId,
      "conv_unknown",
      "msg_unknown"
    );

    expect(response.status).toBe(404);
  });

  it("streams events for an agent message to the client", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const agentMessageSId = await getMessageSIdByRank(
      auth,
      conversation.sId,
      1
    );

    const event: MessageStreamEvent = {
      eventId: "evt",
      data: {
        type: "generation_tokens",
        created: 0,
        configurationId: "dust",
        messageId: "msg",
        text: "hello",
        classification: "tokens",
        step: 0,
      },
    };
    vi.mocked(getMessagesEvents).mockImplementation(asyncIteratorFrom([event]));

    const response = await getMessageEvents(
      workspace.sId,
      conversation.sId,
      agentMessageSId
    );

    expect(response.status).toBe(200);
    const payloads = parseSseDataPayloads(await response.text());
    expect(payloads.map((p) => JSON.parse(p).data.text)).toEqual(["hello"]);
  });

  it("redacts user_memory tool output for a non-owner participant", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();

    const owner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, owner, { role: "user" });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      owner.sId,
      workspace.sId
    );

    const conversation = await ConversationFactory.create(ownerAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const agentMessageSId = await getMessageSIdByRank(
      auth,
      conversation.sId,
      1
    );

    const MEMORY_TEXT = "SECRET: user lives in Paris";
    const action = {
      id: 1,
      sId: "act_1",
      createdAt: 0,
      updatedAt: 0,
      agentMessageId: 1,
      internalMCPServerName: "user_memory",
      toolName: "read",
      mcpServerId: "srv",
      functionCallName: "read",
      functionCallId: "call_1",
      params: {},
      citationsAllocated: 0,
      status: "succeeded",
      step: 0,
      executionDurationMs: null,
      displayLabels: null,
      generatedFiles: [],
      output: [{ type: "text", text: MEMORY_TEXT }],
      citations: null,
    } satisfies AgentMCPActionWithOutputType;

    const event: MessageStreamEvent = {
      eventId: "evt",
      data: {
        type: "agent_action_success",
        created: 0,
        configurationId: "dust",
        messageId: "msg",
        action,
        step: 0,
      },
    };
    vi.mocked(getMessagesEvents).mockImplementation(asyncIteratorFrom([event]));

    const response = await getMessageEvents(
      workspace.sId,
      conversation.sId,
      agentMessageSId
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(MEMORY_TEXT);
  });
});
