import { MCPOAuthProvider } from "@app/lib/api/oauth/providers/mcp";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Ok } from "@app/types/shared/result";
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

  it("keeps workspace connection metadata authoritative for personal actions", async () => {
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
      useCase: "personal_actions",
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
    expect(updated.use_static_ip_proxy).toBe("false");
    expect(provider.isExtraConfigValidPostRelatedCredential(updated)).toBe(
      true
    );
  });
});
