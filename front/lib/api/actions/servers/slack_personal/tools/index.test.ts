import type { BaseToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  executeReadThreadMessages,
  getSlackClient,
} from "@app/lib/api/actions/servers/slack/helpers";
import {
  createSlackPersonalTools,
  slackSearch,
} from "@app/lib/api/actions/servers/slack_personal/tools";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { WebClient } from "@slack/web-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/actions/servers/slack/helpers",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/actions/servers/slack/helpers")
      >();

    return {
      ...actual,
      executeReadThreadMessages: vi.fn(),
      getSlackClient: vi.fn(),
    };
  }
);

function makeAuth() {
  return new Authenticator({
    authMethod: "internal",
    groupModelIds: [],
    permissions: GroupPermissions.empty(),
    role: "none",
  });
}

function makeHandlerExtra(token = "test-token"): BaseToolHandlerExtra {
  return {
    authInfo: {
      token,
      clientId: "",
      scopes: [],
    },
    requestId: "slack-personal-tools-test",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
}

function expectAuthenticationScope(
  result: Awaited<
    ReturnType<
      ReturnType<
        typeof createSlackPersonalTools
      >["commonTools"][number]["handler"]
    >
  >,
  scope: string
) {
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    expect(result.value).toContainEqual({
      type: "resource",
      resource: expect.objectContaining({
        type: "tool_personal_auth_required",
        provider: "slack_tools",
        scope,
      }),
    });
  }
}

describe("Slack personal tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards Slack's required scope to the authentication flow", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.reactions, "get").mockRejectedValue(
      Object.assign(new Error("An API error occurred: missing_scope"), {
        data: {
          ok: false,
          error: "missing_scope",
          needed: "reactions:read",
          provided: "channels:history,channels:read",
        },
      })
    );
    vi.mocked(getSlackClient).mockResolvedValue(slackClient);

    const auth = makeAuth();
    const getReactionsTool = createSlackPersonalTools(
      auth,
      "ims_test"
    ).commonTools.find((tool) => tool.name === "get_reactions");
    expect(getReactionsTool).toBeDefined();
    if (!getReactionsTool) {
      throw new Error("get_reactions tool not found");
    }

    const result = await getReactionsTool.handler(
      {
        channel: "C123",
        timestamp: "123.456",
        full: true,
      },
      makeHandlerExtra()
    );

    expectAuthenticationScope(result, "reactions:read");
  });

  it("preserves the required scope returned by Slack search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: "missing_scope",
            needed: "search:read.public",
            provided: "channels:history,channels:read",
          }),
          { status: 200 }
        )
      )
    );

    await expect(slackSearch("incident", "test-token")).rejects.toMatchObject({
      data: {
        error: "missing_scope",
        needed: "search:read.public",
      },
    });
  });

  it("pauses thread reads with Slack's required scope", async () => {
    vi.mocked(executeReadThreadMessages).mockRejectedValue(
      Object.assign(new Error("An API error occurred: missing_scope"), {
        data: {
          ok: false,
          error: "missing_scope",
          needed: "channels:history",
          provided: "channels:read",
        },
      })
    );

    const auth = makeAuth();
    const readThreadTool = createSlackPersonalTools(
      auth,
      "ims_test"
    ).commonTools.find((tool) => tool.name === "read_thread_messages");
    expect(readThreadTool).toBeDefined();
    if (!readThreadTool) {
      throw new Error("read_thread_messages tool not found");
    }

    const result = await readThreadTool.handler(
      {
        channel: "C123",
        threadTs: "123.456",
      },
      makeHandlerExtra()
    );

    expectAuthenticationScope(result, "channels:history");
  });
});
