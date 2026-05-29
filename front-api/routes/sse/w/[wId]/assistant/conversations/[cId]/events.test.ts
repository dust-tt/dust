import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import {
  asyncIteratorFrom,
  parseSseDataPayloads,
} from "@front-api/tests/utils/sse";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Smoke coverage only: the streaming/transform/abort/error logic lives in and
// is tested against the v1 sibling. These tests confirm the private route wires
// workspace auth + the private (allow-list) transform.

vi.mock("@app/lib/api/assistant/pubsub", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/assistant/pubsub")>();
  return {
    ...mod,
    getConversationEvents: vi.fn(),
  };
});

import { getConversationEvents } from "@app/lib/api/assistant/pubsub";

function getEvents(workspaceId: string, conversationId: string) {
  return honoApp.request(
    `/api/sse/w/${workspaceId}/assistant/conversations/${conversationId}/events`
  );
}

describe("GET /api/sse/w/[wId]/assistant/conversations/[cId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await getEvents(workspace.sId, "conv_unknown");

    expect(response.status).toBe(404);
  });

  it("streams allowed events to the client", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const titleEvent: { eventId: string; data: ConversationEvents } = {
      eventId: "title",
      data: { type: "conversation_title", created: 0, title: "hello" },
    };
    vi.mocked(getConversationEvents).mockImplementation(
      asyncIteratorFrom([titleEvent])
    );

    const response = await getEvents(workspace.sId, conversation.sId);

    expect(response.status).toBe(200);
    const payloads = parseSseDataPayloads(await response.text());
    expect(payloads.map((p) => JSON.parse(p).data.title)).toEqual(["hello"]);
  });
});
