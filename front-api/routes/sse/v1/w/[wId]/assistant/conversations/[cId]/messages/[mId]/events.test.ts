import type { MessageStreamEvent } from "@app/lib/api/assistant/pubsub";
import { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { honoApp } from "@front-api/app";
import {
  asyncIteratorFrom,
  emptyAsyncIterator,
  expectEmptySseStream,
  parseSseDataPayloads,
} from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function getMessageByRank(
  auth: Authenticator,
  conversationId: ModelId,
  rank: number
): Promise<MessageModel> {
  const message = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId,
      rank,
    },
  });
  if (!message) {
    throw new Error(`No message found at rank ${rank}`);
  }
  return message;
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

function tokensEvent(text: string): MessageStreamEvent {
  return {
    eventId: text,
    data: {
      type: "generation_tokens",
      created: 0,
      configurationId: "dust",
      messageId: "msg",
      text,
      classification: "tokens",
      step: 0,
    },
  };
}

function getMessageEvents(
  workspaceId: string,
  conversationId: string,
  messageId: string,
  keySecret: string
) {
  return honoApp.request(
    `/api/sse/v1/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/events`,
    { headers: { authorization: `Bearer ${keySecret}` } }
  );
}

async function setupAgentMessage() {
  const { workspace, key } = await createPublicApiMockRequest();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const conversation = await ConversationFactory.create(userAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });
  const agentMessage = await getMessageByRank(userAuth, conversation.id, 1);
  const userMessage = await getMessageByRank(userAuth, conversation.id, 0);
  return { workspace, key, conversation, agentMessage, userMessage };
}

describe("GET /api/sse/v1/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await getMessageEvents(
      workspace.sId,
      "conv_unknown",
      "msg_unknown",
      key.secret
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the message does not exist", async () => {
    const { workspace, key, conversation } = await setupAgentMessage();

    const response = await getMessageEvents(
      workspace.sId,
      conversation.sId,
      "msg_unknown",
      key.secret
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({ type: "message_not_found" }),
    });
  });

  it("returns 400 when the target message is not an agent message", async () => {
    const { workspace, key, conversation, userMessage } =
      await setupAgentMessage();

    const response = await getMessageEvents(
      workspace.sId,
      conversation.sId,
      userMessage.sId,
      key.secret
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({ type: "invalid_request_error" }),
    });
  });

  it("streams an empty SSE response when no events are produced", async () => {
    const { workspace, key, conversation, agentMessage } =
      await setupAgentMessage();

    vi.mocked(getMessagesEvents).mockImplementation(emptyAsyncIterator);

    const response = await getMessageEvents(
      workspace.sId,
      conversation.sId,
      agentMessage.sId,
      key.secret
    );

    await expectEmptySseStream(response);
  });

  it("streams events for an agent message to the client", async () => {
    const { workspace, key, conversation, agentMessage } =
      await setupAgentMessage();

    vi.mocked(getMessagesEvents).mockImplementation(
      asyncIteratorFrom([tokensEvent("hello"), tokensEvent("world")])
    );

    const response = await getMessageEvents(
      workspace.sId,
      conversation.sId,
      agentMessage.sId,
      key.secret
    );

    expect(response.status).toBe(200);
    const payloads = parseSseDataPayloads(await response.text());
    expect(payloads.map((p) => JSON.parse(p).data.text)).toEqual([
      "hello",
      "world",
    ]);
  });
});
