import { beforeEach, describe, expect, it, vi } from "vitest";

import { getResolvedAuthForMCPServer } from "@app/lib/actions/mcp_authentication";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getOAuthAPIConfig: vi.fn(() => ({
      url: "https://oauth-api.example.com",
      apiKey: "test-api-key",
    })),
  },
}));

const { mockGetOAuthConnectionAccessToken, mockGetCredentials } = vi.hoisted(
  () => ({
    mockGetOAuthConnectionAccessToken: vi.fn(),
    mockGetCredentials: vi.fn(),
  })
);

vi.mock("@app/types", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getOAuthConnectionAccessToken: mockGetOAuthConnectionAccessToken,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        getCredentials: mockGetCredentials,
      };
    }),
  };
});

describe("getResolvedAuthForMCPServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns oauth variant when connectionId is configured", async () => {
    const { authenticator, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const snowflakeServerId = internalMCPServerNameToSId({
      name: "snowflake",
      workspaceId: workspace.id,
      prefix: 123,
    });

    await MCPServerConnectionResource.makeNew(authenticator, {
      connectionId: "con_test",
      credentialId: null,
      connectionType: "workspace",
      serverType: "internal",
      internalMCPServerId: snowflakeServerId,
    });

    mockGetOAuthConnectionAccessToken.mockResolvedValue(
      new Ok({
        connection: {
          connection_id: "con_test",
          created: Date.now(),
          metadata: {
            snowflake_account: "acc",
            snowflake_warehouse: "wh",
          },
          provider: "snowflake",
          status: "finalized",
        },
        access_token: "token",
        access_token_expiry: null,
        scrubbed_raw_json: {},
      } as any)
    );

    const res = await getResolvedAuthForMCPServer(authenticator, {
      mcpServerId: snowflakeServerId,
      connectionType: "workspace",
    });

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.authType).toBe("oauth");
      if (res.value.authType !== "oauth") {
        throw new Error("Expected oauth auth type");
      }
      expect(res.value.access_token).toBe("token");
    }
  });

  it("returns keypair variant when credentialId is configured", async () => {
    const { authenticator, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const snowflakeServerId = internalMCPServerNameToSId({
      name: "snowflake",
      workspaceId: workspace.id,
      prefix: 123,
    });

    await MCPServerConnectionResource.makeNew(authenticator, {
      connectionId: null,
      credentialId: "cred_test",
      connectionType: "workspace",
      serverType: "internal",
      internalMCPServerId: snowflakeServerId,
    });

    mockGetCredentials.mockResolvedValue(
      new Ok({
        credential: {
          credential_id: "cred_test",
          created: Date.now(),
          provider: "snowflake",
          metadata: {
            workspace_id: workspace.sId,
            user_id: authenticator.getNonNullableUser().sId,
          },
          content: {
            auth_type: "keypair",
            account: "acc",
            username: "user",
            role: "role",
            warehouse: "wh",
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIB...\n-----END PRIVATE KEY-----",
          },
        },
      } as any)
    );

    const res = await getResolvedAuthForMCPServer(authenticator, {
      mcpServerId: snowflakeServerId,
      connectionType: "workspace",
    });

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.authType).toBe("keypair");
      if (res.value.authType !== "keypair") {
        throw new Error("Expected keypair auth type");
      }
      expect(res.value.credentials.username).toBe("user");
      expect(res.value.credentials.private_key).toContain("PRIVATE KEY");
    }
  });
});
