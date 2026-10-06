import { SnowflakeOAuthProvider } from "@app/lib/api/oauth/providers/snowflake";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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

const VALID_CONFIG = {
  client_id: "client-id",
  client_secret: "client-secret",
  snowflake_account: "abc123.us-east-1",
  snowflake_role: "ANALYST",
  snowflake_warehouse: "COMPUTE_WH",
};

describe("SnowflakeOAuthProvider.isExtraConfigValid", () => {
  it("accepts a well-formed account identifier", () => {
    const provider = new SnowflakeOAuthProvider();

    expect(provider.isExtraConfigValid(VALID_CONFIG, "platform_actions")).toBe(
      true
    );
    expect(provider.isExtraConfigValid(VALID_CONFIG, "personal_actions")).toBe(
      true
    );
  });

  it("rejects account identifiers that would change the URL host", () => {
    const provider = new SnowflakeOAuthProvider();

    for (const snowflake_account of [
      "evil.example/x?",
      "attacker.internal:8443/p?",
      "user:pw@host/?",
      "evil-1.example#",
      "evil-1.example\\x",
    ]) {
      for (const useCase of ["platform_actions", "personal_actions"] as const) {
        expect(
          provider.isExtraConfigValid(
            { ...VALID_CONFIG, snowflake_account },
            useCase
          )
        ).toBe(false);
      }
    }
  });

  it("validates admin credentials even when mcp_server_id is present", () => {
    const provider = new SnowflakeOAuthProvider();
    const config = { ...VALID_CONFIG, mcp_server_id: "ims_123" };

    expect(provider.isExtraConfigValid(config, "platform_actions")).toBe(true);
    expect(
      provider.isExtraConfigValid(
        { mcp_server_id: "ims_123" },
        "platform_actions"
      )
    ).toBe(true);
    expect(
      provider.isExtraConfigValid(
        { ...config, snowflake_account: "evil.example/x?" },
        "platform_actions"
      )
    ).toBe(false);
  });
});

describe("SnowflakeOAuthProvider admin setup with mcp_server_id", () => {
  const typedConfig = { ...VALID_CONFIG, mcp_server_id: "ims_123" };

  beforeEach(() => {
    mocks.getWorkspaceOAuthConnectionForMCPServer.mockReset();
  });

  it("reuses the workspace connection on Refresh", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new SnowflakeOAuthProvider();
    mocks.getWorkspaceOAuthConnectionForMCPServer.mockResolvedValue(
      new Ok({
        connection_id: "con_workspace",
        created: Date.now(),
        metadata: {
          client_id: "ws-client-id",
          snowflake_account: "ws123.eu-west-1",
          snowflake_role: "WS_ROLE",
          snowflake_warehouse: "WS_WH",
        },
        provider: "snowflake",
        status: "finalized",
        redirect_uri: "https://dust.tt/oauth/snowflake/finalize",
      })
    );
    const args = {
      extraConfig: { mcp_server_id: "ims_123" },
      useCase: "platform_actions" as const,
    };

    const credential = await provider.getRelatedCredential(authenticator, {
      ...args,
      workspaceId: "w",
      userId: "u",
    });
    const updated = await provider.getUpdatedExtraConfig(authenticator, args);

    expect(credential.isOk() && credential.value.content).toEqual({
      from_connection_id: "con_workspace",
    });
    expect(updated).toEqual({
      client_id: "ws-client-id",
      snowflake_account: "ws123.eu-west-1",
      snowflake_role: "WS_ROLE",
      snowflake_warehouse: "WS_WH",
    });
  });

  it("uses the typed credentials on first connect", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const provider = new SnowflakeOAuthProvider();
    mocks.getWorkspaceOAuthConnectionForMCPServer.mockResolvedValue(
      new Err({ kind: "connection_not_found", message: "not found" })
    );
    const args = {
      extraConfig: typedConfig,
      useCase: "platform_actions" as const,
    };

    const credential = await provider.getRelatedCredential(authenticator, {
      ...args,
      workspaceId: "w",
      userId: "u",
    });
    const updated = await provider.getUpdatedExtraConfig(authenticator, args);

    expect(credential.isOk() && credential.value.content).toEqual(VALID_CONFIG);
    const { client_secret: _clientSecret, ...withoutSecret } = typedConfig;
    expect(updated).toEqual(withoutSecret);
  });
});
