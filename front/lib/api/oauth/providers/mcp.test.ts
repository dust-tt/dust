import { MCPOAuthProvider } from "@app/lib/api/oauth/providers/mcp";
import { MCPOAuthStaticOAuthProvider } from "@app/lib/api/oauth/providers/mcp_static";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectionMetadata: vi.fn(),
  getWorkspaceOAuthConnectionIdForMCPServer: vi.fn(),
}));

vi.mock("@app/lib/api/oauth/mcp_server_connection_auth", () => ({
  getWorkspaceOAuthConnectionIdForMCPServer:
    mocks.getWorkspaceOAuthConnectionIdForMCPServer,
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();

  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getConnectionMetadata: mocks.getConnectionMetadata,
      };
    }),
  };
});

function makeConnection(metadata: Record<string, string>): OAuthConnectionType {
  return {
    connection_id: "con_workspace",
    created: Date.now(),
    metadata,
    provider: "mcp",
    status: "pending",
  };
}

describe("MCPOAuthProvider.getUpdatedExtraConfig", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockReset();
  });

  it("stamps platform action metadata from the final token endpoint and ignores caller overrides", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new MCPOAuthProvider();

    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "platform_actions",
      extraConfig: {
        client_id: "client",
        client_secret: "secret",
        token_endpoint: "https://unverified.example.com/token",
        authorization_endpoint: "https://unverified.example.com/authorize",
        use_static_ip_proxy: "true",
      },
    });

    expect(updated.client_secret).toBeUndefined();
    expect(updated.use_static_ip_proxy).toBe("false");
    expect(updated.token_endpoint).toBe("https://unverified.example.com/token");
    expect(provider.isExtraConfigValidPostRelatedCredential(updated)).toBe(
      true
    );
  });

  it("stamps static IP when the OAuth resource is a hardcoded official MCP URL", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new MCPOAuthProvider();

    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "platform_actions",
      extraConfig: {
        client_id: "client",
        client_secret: "secret",
        token_endpoint: "https://oauth2.googleapis.com/token",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        resource: "https://bigquery.googleapis.com/mcp",
        use_static_ip_proxy: "false",
      },
    });

    expect(updated.use_static_ip_proxy).toBe("true");
  });

  it.each([
    "personal_actions",
    "platform_actions",
  ] as const)("keeps workspace connection metadata authoritative for %s with mcp_server_id", async (useCase) => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new MCPOAuthProvider();

    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockResolvedValue(
      new Ok("con_workspace")
    );
    mocks.getConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: makeConnection({
          client_id: "workspace-client",
          token_endpoint: "https://unverified.example.com/token",
          authorization_endpoint: "https://unverified.example.com/authorize",
          scope: "workspace-scope",
          resource: "workspace-resource",
          token_endpoint_auth_method: "client_secret_basic",
        }),
      })
    );

    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase,
      extraConfig: {
        mcp_server_id: "srv_123",
        client_id: "spoofed-client",
        token_endpoint: "https://spoofed.example.com/token",
        authorization_endpoint: "https://spoofed.example.com/authorize",
        scope: "spoofed-scope",
        use_static_ip_proxy: "true",
      },
    });

    expect(updated.client_id).toBe("workspace-client");
    expect(updated.token_endpoint).toBe("https://unverified.example.com/token");
    expect(updated.authorization_endpoint).toBe(
      "https://unverified.example.com/authorize"
    );
    expect(updated.scope).toBe("workspace-scope");
    expect(updated.mcp_server_id).toBeUndefined();
    expect(updated.use_static_ip_proxy).toBe("false");
    expect(provider.isExtraConfigValidPostRelatedCredential(updated)).toBe(
      true
    );
  });

  it("falls through to caller credentials for platform_actions when workspace connection is missing", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new MCPOAuthProvider();

    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockResolvedValue(
      new Err({
        kind: "connection_not_found",
        message: "Failed to find MCP server connection",
      })
    );

    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "platform_actions",
      extraConfig: {
        mcp_server_id: "srv_missing",
        client_id: "discovered-client",
        client_secret: "secret",
        token_endpoint: "https://discovered.example.com/token",
        authorization_endpoint: "https://discovered.example.com/authorize",
      },
    });

    expect(updated.client_id).toBe("discovered-client");
    expect(updated.client_secret).toBeUndefined();
    expect(updated.mcp_server_id).toBeUndefined();
    expect(updated.token_endpoint).toBe("https://discovered.example.com/token");
    expect(provider.isExtraConfigValidPostRelatedCredential(updated)).toBe(
      true
    );
  });

  it("accepts platform_actions with mcp_server_id alone", () => {
    const provider = new MCPOAuthProvider();
    expect(
      provider.isExtraConfigValid(
        { mcp_server_id: "srv_123" },
        "platform_actions"
      )
    ).toBe(true);
    expect(
      new MCPOAuthStaticOAuthProvider().isExtraConfigValid(
        { mcp_server_id: "srv_123" },
        "platform_actions"
      )
    ).toBe(true);
  });
});

describe("MCPOAuthProvider.getRelatedCredential", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockReset();
  });

  it("reuses from_connection_id for platform_actions Refresh", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new MCPOAuthProvider();

    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockResolvedValue(
      new Ok("con_workspace")
    );
    mocks.getConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: {
          ...makeConnection({
            client_id: "workspace-client",
            token_endpoint: "https://example.com/token",
            authorization_endpoint: "https://example.com/authorize",
          }),
          redirect_uri: "https://eu.dust.tt/oauth/mcp/finalize",
        },
      })
    );

    const related = await provider.getRelatedCredential(authenticator, {
      useCase: "platform_actions",
      workspaceId: "w_123",
      userId: "u_123",
      extraConfig: { mcp_server_id: "srv_123" },
    });

    expect(related.isOk()).toBe(true);
    if (related.isOk()) {
      expect(related.value.content).toEqual({
        from_connection_id: "con_workspace",
      });
      expect(related.value.redirectUri).toBe(
        "https://eu.dust.tt/oauth/mcp/finalize"
      );
    }
  });
});

describe("MCPOAuthProvider.setupUri", () => {
  it.each([
    { provider: new MCPOAuthProvider(), expectedProvider: "mcp" },
    {
      provider: new MCPOAuthStaticOAuthProvider(),
      expectedProvider: "mcp_static",
    },
  ])("uses the $expectedProvider callback path", ({
    provider,
    expectedProvider,
  }) => {
    const connection = makeConnection({
      client_id: "test-client",
      authorization_endpoint: "https://example.com/authorize",
      code_challenge: "test-challenge",
      scope: "sql offline_access",
    });
    connection.provider = provider.provider;

    const authorizationUrl = new URL(
      provider.setupUri({ connection, useCase: "platform_actions" })
    );
    const redirectUri = authorizationUrl.searchParams.get("redirect_uri");

    expect(redirectUri).not.toBeNull();
    expect(new URL(redirectUri ?? "").pathname).toBe(
      `/oauth/${expectedProvider}/finalize`
    );
    expect(authorizationUrl.searchParams.get("state")).toBe(
      connection.connection_id
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      "test-challenge"
    );
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      "sql offline_access"
    );
  });
});
