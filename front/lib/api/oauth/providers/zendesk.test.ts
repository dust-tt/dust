import { ZendeskOAuthProvider } from "@app/lib/api/oauth/providers/zendesk";
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
    provider: "zendesk",
    status: "pending",
  };
}

describe("ZendeskOAuthProvider.isExtraConfigValid", () => {
  const provider = new ZendeskOAuthProvider();

  it("accepts personal_actions with an mcp_server_id (subdomain inherited from admin)", () => {
    expect(
      provider.isExtraConfigValid(
        { mcp_server_id: "srv_123" },
        "personal_actions"
      )
    ).toBe(true);
  });

  it("requires a valid subdomain for personal_actions without an mcp_server_id", () => {
    expect(
      provider.isExtraConfigValid(
        { zendesk_subdomain: "mycompany" },
        "personal_actions"
      )
    ).toBe(true);
    expect(
      provider.isExtraConfigValid(
        { zendesk_subdomain: "Invalid_Domain!" },
        "personal_actions"
      )
    ).toBe(false);
  });

  it("requires a valid subdomain for platform_actions", () => {
    expect(
      provider.isExtraConfigValid(
        { zendesk_subdomain: "mycompany" },
        "platform_actions"
      )
    ).toBe(true);
    expect(provider.isExtraConfigValid({}, "platform_actions")).toBe(false);
  });

  it("rejects extra config keys for platform_actions", () => {
    expect(
      provider.isExtraConfigValid(
        { zendesk_subdomain: "mycompany", extra: "x" },
        "platform_actions"
      )
    ).toBe(false);
  });
});

describe("ZendeskOAuthProvider.getUpdatedExtraConfig", () => {
  beforeEach(() => {
    mocks.getConnectionMetadata.mockReset();
    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockReset();
  });

  it("inherits the subdomain from the workspace connection for personal actions", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockResolvedValue(
      new Ok("con_workspace")
    );
    mocks.getConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: makeConnection({ zendesk_subdomain: "admincompany" }),
      })
    );

    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "personal_actions",
      extraConfig: { mcp_server_id: "srv_123" },
    });

    // The admin-configured subdomain is stamped in, and the transient
    // mcp_server_id is dropped from the personal connection config.
    expect(updated.zendesk_subdomain).toBe("admincompany");
    expect(updated.mcp_server_id).toBeUndefined();
  });

  it("throws when the workspace connection has no subdomain", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    mocks.getWorkspaceOAuthConnectionIdForMCPServer.mockResolvedValue(
      new Ok("con_workspace")
    );
    mocks.getConnectionMetadata.mockResolvedValue(
      new Ok({
        connection: makeConnection({}),
      })
    );

    await expect(
      provider.getUpdatedExtraConfig(authenticator, {
        useCase: "personal_actions",
        extraConfig: { mcp_server_id: "srv_123" },
      })
    ).rejects.toThrow(/missing a subdomain/);
  });

  it("leaves config unchanged for personal actions without an mcp_server_id", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    const extraConfig = { zendesk_subdomain: "mycompany" };
    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "personal_actions",
      extraConfig,
    });

    expect(updated).toEqual(extraConfig);
    expect(
      mocks.getWorkspaceOAuthConnectionIdForMCPServer
    ).not.toHaveBeenCalled();
  });

  it("leaves config unchanged for platform actions", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    const extraConfig = { zendesk_subdomain: "mycompany" };
    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "platform_actions",
      extraConfig,
    });

    expect(updated).toEqual(extraConfig);
    expect(
      mocks.getWorkspaceOAuthConnectionIdForMCPServer
    ).not.toHaveBeenCalled();
  });
});
