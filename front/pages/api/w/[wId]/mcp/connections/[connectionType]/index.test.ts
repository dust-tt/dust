import { describe, expect, it } from "vitest";

import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";

import handler from "./index";

describe("MCP Connections API Handler", () => {
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
});
