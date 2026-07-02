import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: () => false,
  checkProgrammaticUsageLimits: vi.fn(),
}));

function postConversations(
  workspace: { sId: string },
  key: { secret: string },
  body: unknown
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/assistant/conversations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/w/[wId]/assistant/conversations", () => {
  it("returns 401 when an API key (no user) sends selectedMCPServerViewIds", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await postConversations(workspace, key, {
      title: "Test conversation",
      message: {
        content: "Hello",
        mentions: [],
        context: {
          username: "tester",
          timezone: "Europe/Paris",
          origin: "api",
          selectedMCPServerViewIds: ["msv_abcdef123456"],
        },
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Selecting MCP server views is only available to authenticated users.",
      },
    });
  });

  it("returns 401 when an API key (no user) sends clientSideMCPServerIds", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await postConversations(workspace, key, {
      title: "Test conversation",
      message: {
        content: "Hello",
        mentions: [],
        context: {
          username: "tester",
          timezone: "Europe/Paris",
          origin: "api",
          clientSideMCPServerIds: ["mcp_local_abc"],
        },
      },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Local MCP servers are only available to authenticated users.",
      },
    });
  });

  it("returns 400 when the request body fails schema validation", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await postConversations(workspace, key, {
      message: { content: "missing mentions and context" },
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("normalizes legacy visibility values on write while preserving the wire contract", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest();

    const response = await postConversations(workspace, key, {
      title: "Test conversation",
      visibility: "test",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // The public wire contract is preserved: legacy "test" round-trips as "test".
    expect(body.conversation.visibility).toBe("test");

    // Internally, "test" is stored under its renamed value "hidden".
    const stored = await ConversationResource.fetchById(
      auth,
      body.conversation.sId
    );
    assert(stored, "conversation not found");
    expect(stored.visibility).toBe("hidden");
  });

  it('defaults new conversations to the renamed "visible" visibility', async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest();

    const response = await postConversations(workspace, key, {
      title: "Test conversation",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // The public wire contract is preserved: the default round-trips as "unlisted".
    expect(body.conversation.visibility).toBe("unlisted");

    const stored = await ConversationResource.fetchById(
      auth,
      body.conversation.sId
    );
    assert(stored, "conversation not found");
    expect(stored.visibility).toBe("visible");
  });
});
