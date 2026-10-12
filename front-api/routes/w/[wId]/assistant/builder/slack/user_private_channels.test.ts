import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the external boundaries (Slack Web API + OAuth token service). Keep the
// rest of each module intact so unrelated exports (e.g. SLACK_API_PAGE_SIZE)
// still resolve.
vi.mock(
  "@app/lib/api/actions/servers/slack/helpers",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@app/lib/api/actions/servers/slack/helpers")
    >()),
    getSlackClient: vi.fn(),
  })
);

vi.mock("@app/lib/api/oauth_access_token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/oauth_access_token")>()),
  getOAuthConnectionAccessToken: vi.fn(),
}));

import { getSlackClient } from "@app/lib/api/actions/servers/slack/helpers";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";

const URL_PATH = "assistant/builder/slack/user_private_channels";

function get(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/${URL_PATH}`);
}

// Marks Slack Tools as activated in the workspace by making the internal MCP
// server listing include a "slack" server.
function enableSlackTools() {
  vi.spyOn(
    InternalMCPServerInMemoryResource,
    "listByWorkspace"
  ).mockResolvedValue([
    { toJSON: () => ({ name: "slack" }) },
  ] as unknown as Awaited<
    ReturnType<typeof InternalMCPServerInMemoryResource.listByWorkspace>
  >);
}

// Makes the current user look connected to personal Slack Tools.
function mockPersonalConnection(connectionId: string) {
  vi.spyOn(
    MCPServerConnectionResource,
    "findByInternalServerName"
  ).mockResolvedValue({
    connectionId,
  } as unknown as MCPServerConnectionResource);
}

// Returns an OAuth access-token result carrying the given token + team id.
function oauthResult(accessToken: string, teamId: string | null) {
  return new Ok({
    access_token: accessToken,
    access_token_expiry: null,
    connection: {
      metadata: teamId ? { team_id: teamId } : {},
    },
  }) as unknown as Awaited<ReturnType<typeof getOAuthConnectionAccessToken>>;
}

// Builds a fake Slack client whose users.conversations returns `channels`.
function slackClientReturning(channels: { id: string; name: string }[]) {
  return {
    users: {
      conversations: vi.fn().mockResolvedValue({
        ok: true,
        channels,
        response_metadata: { next_cursor: undefined },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof getSlackClient>>;
}

describe("GET /api/w/:wId/assistant/builder/slack/user_private_channels", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await get(workspace);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns tool_unavailable when Slack Tools is not activated", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // No Slack internal MCP server in the workspace.
    vi.spyOn(
      InternalMCPServerInMemoryResource,
      "listByWorkspace"
    ).mockResolvedValue([]);

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "tool_unavailable",
      channels: [],
    });
  });

  it("returns not_connected when the admin has no personal Slack connection", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    enableSlackTools();
    // No personal connection registered for this user.

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "not_connected",
      channels: [],
    });
  });

  it("returns the intersection of the admin's and the bot's private channels", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    enableSlackTools();
    mockPersonalConnection("personal-conn");

    // The bot is present on the workspace via a Slack data source; the bot
    // connector resolves to its own OAuth connection.
    vi.spyOn(DataSourceResource, "listByConnectorProvider").mockImplementation(
      ((_auth: unknown, provider: string) =>
        Promise.resolve(
          provider === "slack" ? [{ connectorId: "conn-slack" }] : []
        )) as unknown as typeof DataSourceResource.listByConnectorProvider
    );

    vi.spyOn(ConnectorsAPI.prototype, "getConnector").mockResolvedValue(
      new Ok({ connectionId: "bot-conn" }) as unknown as Awaited<
        ReturnType<ConnectorsAPI["getConnector"]>
      >
    );

    // Personal token → the admin's channels; bot token → the bot's channels.
    vi.mocked(getOAuthConnectionAccessToken).mockImplementation(
      async ({ connectionId }) =>
        connectionId === "personal-conn"
          ? oauthResult("user-token", "T123")
          : oauthResult("bot-token", null)
    );

    vi.mocked(getSlackClient).mockImplementation(async (accessToken) =>
      accessToken === "user-token"
        ? slackClientReturning([
            { id: "C1", name: "alpha" },
            { id: "C2", name: "beta" },
            { id: "C3", name: "gamma" },
          ])
        : slackClientReturning([
            { id: "C2", name: "beta" },
            { id: "C3", name: "gamma" },
            { id: "C4", name: "delta" },
          ])
    );

    const response = await get(workspace);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    // Only channels the admin and the bot both belong to, sorted by name.
    expect(body.channels).toEqual([
      {
        slackChannelId: "C2",
        slackChannelName: "#beta",
        sourceUrl: "https://app.slack.com/client/T123/C2",
      },
      {
        slackChannelId: "C3",
        slackChannelName: "#gamma",
        sourceUrl: "https://app.slack.com/client/T123/C3",
      },
    ]);
  });

  it("returns 500 when the personal Slack token cannot be fetched", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    enableSlackTools();
    mockPersonalConnection("personal-conn");

    vi.mocked(getOAuthConnectionAccessToken).mockResolvedValue(
      new Err({
        code: "connection_not_found",
        message: "token exchange failed",
      }) as unknown as Awaited<ReturnType<typeof getOAuthConnectionAccessToken>>
    );

    const response = await get(workspace);

    expect(response.status).toBe(500);
    expect((await response.json()).error.type).toBe("internal_server_error");
  });
});
