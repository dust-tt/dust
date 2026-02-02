import { beforeEach, describe, expect, it, vi } from "vitest";

import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { Ok } from "@app/types";

import handler from "./index";

// Mock config for OAuth API.
vi.mock("@app/lib/api/config", () => ({
  default: {
    getOAuthAPIConfig: vi.fn(() => ({
      url: "https://oauth-api.example.com",
      apiKey: "test-api-key",
    })),
  },
}));

const mockGetCredentials = vi.fn();

vi.mock("@app/types", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        getCredentials: mockGetCredentials,
      };
    }),
  };
});

describe("MCP Connections API Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return personal connections filtered by user ID", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
      });
    req.query.connectionType = "personal";

    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    // Create two connections for the same server, one newer than the other
    await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "personal"
    );
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "personal"
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connections).toHaveLength(1);
    expect(response.connections[0].sId).toBe(connection2.sId); // Should return the latest connection.
  });

  it("should return workspace connections", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });
    req.query.connectionType = "workspace";

    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const now = new Date();

    // Create two workspace connections for the same server.
    await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "workspace",
      new Date(now.getTime() - 60000) // 1 min ago.
    );
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "workspace",
      now
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connections).toHaveLength(1);
    expect(response.connections[0].sId).toBe(connection2.sId); // Should return the latest connection.
  });

  it("should handle different server IDs correctly", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
      });
    req.query.connectionType = "personal";

    const remoteServer1 = await RemoteMCPServerFactory.create(workspace);
    const remoteServer2 = await RemoteMCPServerFactory.create(workspace);

    // Create connections for different servers.
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer1,
      "personal"
    );
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer2,
      "personal"
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connections).toHaveLength(2);
    expect(
      response.connections.map((c: MCPServerConnectionType) => c.sId).sort()
    ).toEqual([connection1.sId, connection2.sId].sort());
  });

  it("should handle internal server connections", async () => {
    const { req, res, authenticator } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.connectionType = "personal";

    const now = new Date();

    // Create two internal connections for the same server.
    await MCPServerConnectionFactory.internal(
      authenticator,
      "internal_server_1",
      "personal",
      new Date(now.getTime() - 60000) // 1 min ago.
    );
    const connection2 = await MCPServerConnectionFactory.internal(
      authenticator,
      "internal_server_1",
      "personal",
      now
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connections).toHaveLength(1);
    expect(response.connections[0].sId).toBe(connection2.sId); // Should return the latest connection.
  });

  it("should return 400 for invalid connection type", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.connectionType = "invalid";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid connection type",
      },
    });
  });

  it("should not leak personal connections across workspaces", async () => {
    // Create first workspace and its connections.
    const { workspace: workspace1, authenticator: authenticator1 } =
      await createPrivateApiMockRequest({
        method: "GET",
      });

    const remoteServer1 = await RemoteMCPServerFactory.create(workspace1);
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator1,
      remoteServer1,
      "personal"
    );

    // Create second workspace and its connections.
    const {
      req,
      res,
      workspace: workspace2,
      authenticator: authenticator2,
    } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.connectionType = "personal";
    const remoteServer2 = await RemoteMCPServerFactory.create(workspace2);
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator2,
      remoteServer2,
      "personal"
    );

    // Query connections from workspace2.
    await handler(req, res);

    // Should only see connections from workspace2.
    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connections).toHaveLength(1);
    expect(response.connections[0].sId).toBe(connection2.sId);
    expect(response.connections[0].sId).not.toBe(connection1.sId);
  });

  it("should not leak workspace connections across workspaces", async () => {
    // Create first workspace and its connections.
    const { workspace: workspace1, authenticator: authenticator1 } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });
    const remoteServer1 = await RemoteMCPServerFactory.create(workspace1);
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator1,
      remoteServer1,
      "workspace"
    );

    // Create second workspace and its connections.
    const {
      req,
      res,
      workspace: workspace2,
      authenticator: authenticator2,
    } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    req.query.connectionType = "workspace";
    const remoteServer2 = await RemoteMCPServerFactory.create(workspace2);
    const connection2 = await MCPServerConnectionFactory.remote(
      authenticator2,
      remoteServer2,
      "workspace"
    );

    // Query connections from workspace2.
    await handler(req, res);

    // Should only see connections from workspace2.
    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connections).toHaveLength(1);
    expect(response.connections[0].sId).toBe(connection2.sId);
    expect(response.connections[0].sId).not.toBe(connection1.sId);
  });

  describe("POST", () => {
    it("rejects missing auth reference", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
      });
      req.query.connectionType = "personal";

      const remoteServer = await RemoteMCPServerFactory.create(workspace);
      req.body = {
        mcpServerId: remoteServer.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Missing authentication reference.",
        },
      });
    });

    it("rejects providing both connectionId and credentialId", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      req.query.connectionType = "workspace";

      const remoteServer = await RemoteMCPServerFactory.create(workspace);
      req.body = {
        mcpServerId: remoteServer.sId,
        connectionId: "not_a_con_id",
        credentialId: "cred_123",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Provide either connectionId or credentialId, not both.",
        },
      });
    });

    it("rejects credentialId for personal connections", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
      });
      req.query.connectionType = "personal";

      const remoteServer = await RemoteMCPServerFactory.create(workspace);
      req.body = {
        mcpServerId: remoteServer.sId,
        credentialId: "cred_123",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Personal MCP server connections are OAuth-only.",
        },
      });
    });

    it("rejects credentialId for non-Snowflake servers", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      req.query.connectionType = "workspace";

      const remoteServer = await RemoteMCPServerFactory.create(workspace);
      req.body = {
        mcpServerId: remoteServer.sId,
        credentialId: "cred_123",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message:
            "Key-pair authentication is only supported for workspace connections to the internal Snowflake MCP server.",
        },
      });
    });

	    it("validates credential ownership for Snowflake keypair connections", async () => {
	      const { req, res, workspace } = await createPrivateApiMockRequest({
	        method: "POST",
	        role: "admin",
	      });
      req.query.connectionType = "workspace";

      const snowflakeServerId = internalMCPServerNameToSId({
        name: "snowflake",
        workspaceId: workspace.id,
        prefix: 123,
      });

      mockGetCredentials.mockResolvedValue(
        new Ok({
          credential: {
            credential_id: "cred_123",
            created: Date.now(),
            provider: "snowflake",
            metadata: {
              workspace_id: workspace.sId,
              user_id: "usr_other",
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

      req.body = {
        mcpServerId: snowflakeServerId,
        credentialId: "cred_123",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Invalid credential.",
        },
      });
    });

    it("rejects non-keypair Snowflake credentials for keypair connections", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      req.query.connectionType = "workspace";

      const snowflakeServerId = internalMCPServerNameToSId({
        name: "snowflake",
        workspaceId: workspace.id,
        prefix: 123,
      });

      mockGetCredentials.mockResolvedValue(
        new Ok({
          credential: {
            credential_id: "cred_123",
            created: Date.now(),
            provider: "snowflake",
            metadata: {
              workspace_id: workspace.sId,
              user_id: user.sId,
            },
            content: {
              auth_type: "password",
              account: "acc",
              username: "user",
              role: "role",
              warehouse: "wh",
              password: "not-used",
            },
          },
        } as any)
      );

      req.body = {
        mcpServerId: snowflakeServerId,
        credentialId: "cred_123",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message:
            "The provided credential is not a Snowflake key-pair credential.",
        },
      });
    });

    it("creates a keypair Snowflake workspace connection when credential is valid", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });
      req.query.connectionType = "workspace";

      const snowflakeServerId = internalMCPServerNameToSId({
        name: "snowflake",
        workspaceId: workspace.id,
        prefix: 123,
      });

      mockGetCredentials.mockResolvedValue(
        new Ok({
          credential: {
            credential_id: "cred_123",
            created: Date.now(),
            provider: "snowflake",
            metadata: {
              workspace_id: workspace.sId,
              user_id: user.sId,
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

      req.body = {
        mcpServerId: snowflakeServerId,
        credentialId: "cred_123",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.success).toBe(true);
      expect(data.connection.authType).toBe("keypair");
    });

    it("requires admin for workspace connections", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
      });
      req.query.connectionType = "workspace";

      const remoteServer = await RemoteMCPServerFactory.create(workspace);
      req.body = {
        mcpServerId: remoteServer.sId,
        connectionId: "not_a_con_id",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "app_auth_error",
          message:
            "Only workspace admins can create workspace-wide MCP server connections.",
        },
      });
    });
  });
});
