import { ZendeskOAuthProvider } from "@app/lib/api/oauth/providers/zendesk";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceOAuthConnectionForMCPServer: vi.fn(),
}));

vi.mock(
  "@app/lib/api/oauth/mcp_server_connection_auth",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/oauth/mcp_server_connection_auth")
      >();
    return {
      ...actual,
      getWorkspaceOAuthConnectionForMCPServer:
        mocks.getWorkspaceOAuthConnectionForMCPServer,
    };
  }
);

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

  it("accepts platform_actions with an mcp_server_id (Refresh reuses workspace connection)", () => {
    expect(
      provider.isExtraConfigValid(
        { mcp_server_id: "srv_123" },
        "platform_actions"
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

  it("requires a valid subdomain for platform_actions without mcp_server_id", () => {
    expect(
      provider.isExtraConfigValid(
        { zendesk_subdomain: "mycompany" },
        "platform_actions"
      )
    ).toBe(true);
    expect(provider.isExtraConfigValid({}, "platform_actions")).toBe(false);
  });

  it("rejects extra config keys for platform_actions without mcp_server_id", () => {
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
    mocks.getWorkspaceOAuthConnectionForMCPServer.mockReset();
  });

  it.each([
    "personal_actions",
    "platform_actions",
  ] as const)("inherits the subdomain from the workspace connection for %s", async (useCase) => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    mocks.getWorkspaceOAuthConnectionForMCPServer.mockResolvedValue(
      new Ok(makeConnection({ zendesk_subdomain: "admincompany" }))
    );

    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase,
      extraConfig: { mcp_server_id: "srv_123" },
    });

    expect(updated.zendesk_subdomain).toBe("admincompany");
    expect(updated.mcp_server_id).toBeUndefined();
  });

  it("throws when the workspace connection has no subdomain", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    mocks.getWorkspaceOAuthConnectionForMCPServer.mockResolvedValue(
      new Ok(makeConnection({}))
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
      mocks.getWorkspaceOAuthConnectionForMCPServer
    ).not.toHaveBeenCalled();
  });

  it("falls through for platform_actions when workspace connection is missing", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new ZendeskOAuthProvider();

    mocks.getWorkspaceOAuthConnectionForMCPServer.mockResolvedValue(
      new Err({
        kind: "connection_not_found",
        message: "Failed to find MCP server connection",
      })
    );

    const extraConfig = {
      mcp_server_id: "srv_missing",
      zendesk_subdomain: "mycompany",
    };
    const updated = await provider.getUpdatedExtraConfig(authenticator, {
      useCase: "platform_actions",
      extraConfig,
    });

    expect(updated).toEqual(extraConfig);
  });
});
