import { describe, expect } from "vitest";
import { it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./index";

describe("MCP Connection API Handler", () => {
  it("GET should return the connection", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
      });

    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const connection = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "personal"
    );

    req.query.connectionType = "personal";
    req.query.cId = connection.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response.connection.sId).toBe(connection.sId);
  });

  it("GET cannot return a connection from another workspace", async () => {
    // Create first workspace and its connection
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

    // Create second workspace and try to access connection1
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.connectionType = "personal";
    req.query.cId = connection1.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  });

  it("GET cannot return a connection from another user in the same workspace", async () => {
    const { workspace, authenticator: authenticator1 } =
      await createPrivateApiMockRequest({
        method: "GET",
      });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    // Create connection for first user
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator1,
      remoteServer,
      "personal"
    );

    // Create second user in the same workspace
    await UserFactory.basic();
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.cId = connection1.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  });

  it("DELETE personal connection deletes all personal connections for the same server of the same user", async () => {
    const {
      req: deleteReq,
      res: deleteRes,
      workspace,
      authenticator,
    } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    // Create two personal connections for the same server
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "personal"
    );
    await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "personal"
    );

    // Create an extra one for the same server, but for a different user
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    const authenticator2 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );
    await MCPServerConnectionFactory.remote(
      authenticator2,
      remoteServer,
      "personal"
    );

    // Delete the first connection
    deleteReq.query.connectionType = "personal";
    deleteReq.query.cId = connection1.sId;
    await handler(deleteReq, deleteRes);

    expect(deleteRes._getStatusCode()).toBe(200);
    expect(deleteRes._getJSONData()).toEqual({ success: true });

    const remainingPersonalConnections =
      await MCPServerConnectionResource.listByWorkspace(authenticator, {
        connectionType: "personal",
      });
    expect(remainingPersonalConnections).toHaveLength(0);

    const remainingUser2PersonalConnections =
      await MCPServerConnectionResource.listByWorkspace(authenticator2, {
        connectionType: "personal",
      });
    expect(remainingUser2PersonalConnections).toHaveLength(1);
  });

  it("DELETE workspace connection deletes all connections for the same server", async () => {
    const {
      req: deleteReq,
      res: deleteRes,
      workspace,
      authenticator,
    } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    // Create both personal and workspace connections for the same server
    await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "personal"
    );

    const workspaceConnection = await MCPServerConnectionFactory.remote(
      authenticator,
      remoteServer,
      "workspace"
    );

    // Delete the workspace connection
    deleteReq.query.connectionType = "workspace";
    deleteReq.query.cId = workspaceConnection.sId;
    await handler(deleteReq, deleteRes);

    expect(deleteRes._getStatusCode()).toBe(200);
    expect(deleteRes._getJSONData()).toEqual({ success: true });

    // Verify both connections are deleted
    const remainingWorkspaceConnections =
      await MCPServerConnectionResource.listByWorkspace(authenticator, {
        connectionType: "workspace",
      });
    expect(remainingWorkspaceConnections).toHaveLength(0);

    const remainingPersonalConnections =
      await MCPServerConnectionResource.listByWorkspace(authenticator, {
        connectionType: "personal",
      });
    expect(remainingPersonalConnections).toHaveLength(0);
  });

  it("GET a non-existing connection should return 404", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.connectionType = "personal";
    req.query.cId = "non_existing_connection_id";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "mcp_server_connection_not_found",
        message: "Connection not found",
      },
    });
  });

  it("DELETE a workspace connection as non-admin should return 500", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user", // Explicitly set as non-admin
    });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    const workspaceConnection = await MCPServerConnectionFactory.remote(
      adminAuthenticator,
      remoteServer,
      "workspace"
    );

    req.query.connectionType = "workspace";
    req.query.cId = workspaceConnection.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to delete connection",
      },
    });
  });

  it("DELETE a personal connection as non-admin and wrong user should return 404", async () => {
    // Create first user and their connection
    const { workspace, authenticator: authenticator1 } =
      await createPrivateApiMockRequest({
        method: "GET",
      });
    const remoteServer = await RemoteMCPServerFactory.create(workspace);
    const connection1 = await MCPServerConnectionFactory.remote(
      authenticator1,
      remoteServer,
      "personal"
    );

    // Create second user and try to delete first user's connection
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    const { req, res } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    req.query.connectionType = "personal";
    req.query.cId = connection1.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });
});
