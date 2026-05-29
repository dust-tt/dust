import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import {
  asyncIteratorFrom,
  emptyAsyncIterator,
  expectEmptySseStream,
  parseSseDataPayloads,
  throwingAsyncIterator,
} from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/pubsub", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/assistant/pubsub")>();
  return {
    ...mod,
    getConversationEvents: vi.fn(),
  };
});

import { getConversationEvents } from "@app/lib/api/assistant/pubsub";

type ConversationEvent = { eventId: string; data: ConversationEvents };

function titleEvent(title: string): ConversationEvent {
  return {
    eventId: title,
    data: { type: "conversation_title", created: 0, title },
  };
}

function planUpdatedEvent(): ConversationEvent {
  return {
    eventId: "plan",
    data: {
      type: "plan_updated",
      created: 0,
      conversationId: "conv",
      planFileId: "file",
      version: 1,
      isClosed: false,
      hasApproval: false,
    },
  };
}

function getEvents(
  workspaceId: string,
  conversationId: string,
  keySecret: string,
  query = ""
) {
  return honoApp.request(
    `/api/sse/v1/w/${workspaceId}/assistant/conversations/${conversationId}/events${query}`,
    { headers: { authorization: `Bearer ${keySecret}` } }
  );
}

async function setupConversation() {
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
  return { workspace, key, conversation };
}

describe("GET /api/sse/v1/w/[wId]/assistant/conversations/[cId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await getEvents(workspace.sId, "conv_unknown", key.secret);

    expect(response.status).toBe(404);
  });

  it("streams an empty SSE response when no events are produced", async () => {
    const { workspace, key, conversation } = await setupConversation();

    vi.mocked(getConversationEvents).mockImplementation(emptyAsyncIterator);

    const response = await getEvents(
      workspace.sId,
      conversation.sId,
      key.secret
    );

    await expectEmptySseStream(response);
  });

  it("treats an empty lastEventId query param as absent", async () => {
    const { workspace, key, conversation } = await setupConversation();

    vi.mocked(getConversationEvents).mockImplementation(emptyAsyncIterator);

    const response = await getEvents(
      workspace.sId,
      conversation.sId,
      key.secret,
      "?lastEventId="
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(getConversationEvents).mock.calls[0][0].lastEventId).toBe(
      null
    );
  });

  it("streams transformed events to the client", async () => {
    const { workspace, key, conversation } = await setupConversation();

    vi.mocked(getConversationEvents).mockImplementation(
      asyncIteratorFrom([titleEvent("hello"), titleEvent("world")])
    );

    const response = await getEvents(
      workspace.sId,
      conversation.sId,
      key.secret
    );

    expect(response.status).toBe(200);
    const payloads = parseSseDataPayloads(await response.text());
    expect(payloads.map((p) => JSON.parse(p).data.title)).toEqual([
      "hello",
      "world",
    ]);
  });

  it("filters out events the public transform drops", async () => {
    const { workspace, key, conversation } = await setupConversation();

    vi.mocked(getConversationEvents).mockImplementation(
      asyncIteratorFrom([titleEvent("kept"), planUpdatedEvent()])
    );

    const response = await getEvents(
      workspace.sId,
      conversation.sId,
      key.secret
    );

    const body = await response.text();
    expect(body).toContain("kept");
    expect(body).not.toContain("plan_updated");
  });

  it("delivers events produced before an iterator error and ends the stream", async () => {
    const { workspace, key, conversation } = await setupConversation();
    // Hono logs the rejected stream callback via console.error; silence it.
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(getConversationEvents).mockImplementation(
      throwingAsyncIterator([titleEvent("before-error")], new Error("boom"))
    );

    const response = await getEvents(
      workspace.sId,
      conversation.sId,
      key.secret
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("before-error");
  });

  it("propagates the client disconnect to the event source and stops", async () => {
    const { workspace, key, conversation } = await setupConversation();
    const abortObserved = vi.fn();

    vi.mocked(getConversationEvents).mockImplementation(
      async function* ({ signal }) {
        yield titleEvent("first");
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            abortObserved();
            resolve();
          });
        });
        yield titleEvent("never-sent");
      }
    );

    const response = await getEvents(
      workspace.sId,
      conversation.sId,
      key.secret
    );
    if (!response.body) {
      throw new Error("Expected a streaming response body.");
    }

    const reader = response.body.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("first");

    // Cancelling the reader simulates a client disconnect, which Hono surfaces
    // through `s.onAbort` -> the AbortController passed to the event source.
    await reader.cancel();

    await vi.waitFor(() => expect(abortObserved).toHaveBeenCalled());
  });
});
