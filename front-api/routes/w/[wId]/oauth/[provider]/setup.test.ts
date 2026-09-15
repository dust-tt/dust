import config from "@app/lib/api/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthAPI } from "@app/types/oauth/oauth_api";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionMetadata: vi.fn(),
  getAccessToken: vi.fn(),
  createConnection: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();

  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
        getAccessToken: mocks.getAccessToken,
        createConnection: mocks.createConnection,
      };
    }),
  };
});

function getSetup(workspace: { sId: string }, mcpServerId: string) {
  const extraConfig = encodeURIComponent(
    JSON.stringify({ mcp_server_id: mcpServerId })
  );
  return honoApp.request(
    `/api/w/${workspace.sId}/oauth/hubspot/setup?useCase=personal_actions&extraConfig=${extraConfig}`
  );
}

describe("OAuth setup handler", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.getAccessToken.mockReset();
    mocks.createConnection.mockReset();
    mocks.createConnection.mockImplementation(
      ({
        provider,
        metadata,
        redirectUri,
      }: Parameters<OAuthAPI["createConnection"]>[0]) =>
        new Ok({
          connection: {
            connection_id: "con_personal",
            created: Date.now(),
            provider,
            status: "pending",
            metadata,
            redirect_uri: redirectUri,
          },
        })
    );
    vi.spyOn(config, "getAppUrl").mockReturnValue("https://app.dust.tt");
    vi.spyOn(config, "getLegacyOAuthRedirectBaseUrl").mockReturnValue(
      "https://eu.dust.tt"
    );
    vi.spyOn(config, "getOAuthFreshserviceClientId").mockReturnValue(
      "workspace-client"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { provider: "mcp", redirectUri: "https://dust.tt/oauth/mcp/finalize" },
    { provider: "mcp", redirectUri: "https://eu.dust.tt/oauth/mcp/finalize" },
    {
      provider: "mcp_static",
      redirectUri: "https://eu.dust.tt/oauth/mcp_static/finalize",
    },
    {
      provider: "snowflake",
      redirectUri: "https://eu.dust.tt/oauth/snowflake/finalize",
    },
    {
      provider: "salesforce",
      redirectUri: "https://eu.dust.tt/oauth/salesforce/finalize",
    },
    {
      provider: "servicenow",
      redirectUri: "https://eu.dust.tt/oauth/servicenow/finalize",
    },
    {
      provider: "ukg_ready",
      redirectUri: "https://eu.dust.tt/oauth/ukg_ready/finalize",
    },
    {
      provider: "freshservice",
      redirectUri: "https://eu.dust.tt/oauth/freshservice/finalize",
    },
    {
      provider: "gmail",
      redirectUri: "https://eu.dust.tt/oauth/gmail/finalize",
    },
    { provider: "mcp", redirectUri: "https://app.dust.tt/oauth/mcp/finalize" },
    { provider: "mcp", redirectUri: null },
    { provider: "mcp_static", redirectUri: null },
  ] as const)("keeps $provider credentials paired with the stored callback $redirectUri", async ({
    provider,
    redirectUri,
  }) => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const workspaceConnection = await MCPServerConnectionFactory.remote(
      auth,
      remoteServer,
      "workspace"
    );
    const connection: OAuthConnectionType = {
      connection_id: workspaceConnection.connectionId ?? "",
      created: Date.now(),
      provider,
      status: "finalized",
      redirect_uri: redirectUri,
      metadata: {
        client_id: "workspace-client",
        authorization_endpoint: "https://mcp.example.com/authorize",
        token_endpoint: "https://mcp.example.com/token",
        instance_url: "https://example.my.salesforce.com",
        servicenow_instance_url: "https://example.service-now.com",
        snowflake_account: "example",
        snowflake_role: "ANALYST",
        snowflake_warehouse: "COMPUTE_WH",
        ukg_ready_company_id: "example",
        freshservice_domain: "example.freshservice.com",
        freshworks_org_url: "https://example.myfreshworks.com",
      },
    };
    mocks.getConnectionMetadata.mockResolvedValue(new Ok({ connection }));
    mocks.getAccessToken.mockResolvedValue(
      new Ok({ connection, access_token: "test-token" })
    );

    const params = new URLSearchParams({
      useCase: "personal_actions",
      extraConfig: JSON.stringify({
        mcp_server_id: remoteServer.sId,
        redirect_uri: "https://untrusted.example.com/callback",
        client_id: "untrusted-client",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
      }),
    });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/oauth/${provider}/setup?${params}`
    );

    expect(response.status).toBe(200);
    const expectedRedirect =
      redirectUri ?? `https://eu.dust.tt/oauth/${provider}/finalize`;
    expect(mocks.createConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        redirectUri: expectedRedirect,
        relatedCredential: {
          content: {
            from_connection_id: workspaceConnection.connectionId,
            ...(provider === "freshservice" && {
              freshservice_domain: "example.freshservice.com",
            }),
          },
          metadata: expect.any(Object),
        },
      })
    );
    const { redirectUrl } = await response.json();
    const authorizationUrl = new URL(redirectUrl);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      expectedRedirect
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe(
      "workspace-client"
    );
    expect(authorizationUrl.searchParams.get("state")).toBe("con_personal");
  });

  it.each([
    {
      provider: "mcp",
      legacyBase: "https://dust.tt",
      callbackBase: "https://dust.tt",
    },
    {
      provider: "mcp",
      legacyBase: "https://eu.dust.tt",
      callbackBase: "https://eu.dust.tt",
    },
    {
      provider: "mcp_static",
      legacyBase: "https://dust.tt",
      callbackBase: "https://dust.tt",
    },
    {
      provider: "mcp_static",
      legacyBase: "https://eu.dust.tt",
      callbackBase: "https://eu.dust.tt",
    },
    {
      provider: "mcp_static",
      legacyBase: "https://legacy.example.com",
      callbackBase: "https://legacy.example.com",
    },
    {
      provider: "gmail",
      legacyBase: "https://eu.dust.tt",
      callbackBase: "https://app.dust.tt",
    },
    {
      provider: "salesforce",
      legacyBase: "https://eu.dust.tt",
      callbackBase: "https://app.dust.tt",
    },
  ] as const)("uses $callbackBase for a new $provider workspace client despite caller overrides", async ({
    provider,
    legacyBase,
    callbackBase,
  }) => {
    vi.mocked(config.getLegacyOAuthRedirectBaseUrl).mockReturnValue(legacyBase);
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const callbackResponse = await honoApp.request(
      `/api/w/${workspace.sId}/oauth/${provider}/redirect_uri`
    );
    expect(callbackResponse.status).toBe(200);
    const advertisedCallback = await callbackResponse.json();
    expect(advertisedCallback.redirectUri).toBe(
      `${callbackBase}/oauth/${provider}/finalize`
    );
    const params = new URLSearchParams({
      useCase: "platform_actions",
      extraConfig: JSON.stringify({
        client_id: "new-client",
        client_secret: "new-secret",
        authorization_endpoint: "https://mcp.example.com/authorize",
        token_endpoint: "https://mcp.example.com/token",
        redirect_uri: "https://untrusted.example.com/callback",
        instance_url: "https://example.my.salesforce.com",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
      }),
    });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/oauth/${provider}/setup?${params}`
    );

    expect(response.status).toBe(200);
    const expectedRedirect = `${callbackBase}/oauth/${provider}/finalize`;
    expect(mocks.createConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        redirectUri: expectedRedirect,
        relatedCredential: {
          content: { client_id: "new-client", client_secret: "new-secret" },
          metadata: expect.any(Object),
        },
      })
    );
    const { redirectUrl } = await response.json();
    const authorizationUrl = new URL(redirectUrl);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      expectedRedirect
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe("new-client");
  });

  it.each([
    ["google_drive", "connection", "https://dust.tt", "https://dust.tt"],
    ["google_drive", "connection", "https://eu.dust.tt", "https://eu.dust.tt"],
    [
      "google_drive",
      "connection",
      "https://app.dust.tt",
      "https://app.dust.tt",
    ],
    ["notion", "connection", "https://eu.dust.tt", "https://eu.dust.tt"],
    ["notion", "platform_actions", "https://eu.dust.tt", "https://app.dust.tt"],
    ["slack", "bot", "https://eu.dust.tt", "https://app.dust.tt"],
    [
      "slack_tools",
      "platform_actions",
      "https://eu.dust.tt",
      "https://app.dust.tt",
    ],
  ] as const)("uses the same advertised, saved, and authorization callback for %s/%s with base %s", async (provider, useCase, legacyBase, callbackBase) => {
    vi.mocked(config.getLegacyOAuthRedirectBaseUrl).mockReturnValue(legacyBase);
    vi.spyOn(config, "getOAuthGoogleDriveClientId").mockReturnValue(
      "drive-client"
    );
    vi.spyOn(config, "getOAuthNotionClientId").mockReturnValue(
      "notion-connector-client"
    );
    vi.spyOn(config, "getOAuthNotionPlatformActionsClientId").mockReturnValue(
      "notion-tools-client"
    );
    vi.spyOn(config, "getOAuthSlackBotClientId").mockReturnValue(
      "slack-bot-client"
    );
    vi.spyOn(config, "getOAuthSlackToolsClientId").mockReturnValue(
      "slack-tools-client"
    );
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const callbackResponse = await honoApp.request(
      `/api/w/${workspace.sId}/oauth/${provider}/redirect_uri?useCase=${useCase}`
    );
    expect(callbackResponse.status).toBe(200);
    const expectedRedirect = `${callbackBase}/oauth/${provider}/finalize`;
    expect(await callbackResponse.json()).toEqual({
      redirectUri: expectedRedirect,
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/oauth/${provider}/setup?useCase=${useCase}`
    );
    expect(response.status).toBe(200);
    expect(mocks.createConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        redirectUri: expectedRedirect,
        metadata: expect.objectContaining({ use_case: useCase }),
      })
    );
    const { redirectUrl } = await response.json();
    expect(new URL(redirectUrl).searchParams.get("redirect_uri")).toBe(
      expectedRedirect
    );
  });

  it.each([
    "unknown/redirect_uri",
    "notion/redirect_uri?useCase=unknown",
  ])("rejects invalid callback requests: %s", async (path) => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/oauth/${path}`
    );
    expect(response.status).toBe(400);
  });

  it("returns a 404 when the workspace connection for the MCP server is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });

    // A server without any workspace-level connection.
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const response = await getSetup(workspace, remoteServer.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message:
          "This tool has no workspace-level connection. Ask a workspace admin to connect the " +
          "tool before setting up your personal connection.",
      },
    });
    expect(mocks.getConnectionMetadata).not.toHaveBeenCalled();
  });

  it("returns a 404 when the workspace connection references a connection the OAuth service no longer has", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // The front row exists but its connectionId dangles in the OAuth service
    // (e.g. after a workspace relocation).
    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    await MCPServerConnectionFactory.remote(auth, remoteServer, "workspace");

    mocks.getConnectionMetadata.mockResolvedValue(
      new Err({
        code: "connection_not_found",
        message: "Requested connection was not found",
      })
    );

    const response = await getSetup(workspace, remoteServer.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message:
          "This tool's workspace connection no longer exists. Ask a workspace admin to " +
          "reconnect the tool before setting up your personal connection.",
      },
    });
  });
});
