import { describe, expect } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("MCP Connection API Handler", () => {
  itInTransaction("GET should return the connection", async (t) => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
      });
    await SpaceFactory.system(workspace, t);
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

  itInTransaction(
    "GET cannot return a connection from another workspace",
    async (t) => {
      // Create first workspace and its connection
      const { workspace: workspace1, authenticator: authenticator1 } =
        await createPrivateApiMockRequest({
          method: "GET",
        });
      await SpaceFactory.system(workspace1, t);
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
    }
  );

  itInTransaction(
    "GET cannot return a connection from another user in the same workspace",
    async (t) => {
      const { workspace, authenticator: authenticator1 } =
        await createPrivateApiMockRequest({
          method: "GET",
        });
      await SpaceFactory.system(workspace, t);
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
    }
  );

  itInTransaction(
    "DELETE personal connection deletes all personal connections for the same server of the same user",
    async (t) => {
      const {
        req: deleteReq,
        res: deleteRes,
        workspace,
        authenticator,
      } = await createPrivateApiMockRequest({
        method: "DELETE",
      });
      await SpaceFactory.system(workspace, t);
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
      await MembershipFactory.associate(workspace, user2, "user");
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
        await MCPServerConnectionResource.listByWorkspace({
          auth: authenticator,
          connectionType: "personal",
        });
      expect(remainingPersonalConnections).toHaveLength(0);

      const remainingUser2PersonalConnections =
        await MCPServerConnectionResource.listByWorkspace({
          auth: authenticator2,
          connectionType: "personal",
        });
      expect(remainingUser2PersonalConnections).toHaveLength(1);
    }
  );

  itInTransaction(
    "DELETE workspace connection deletes all connections for the same server",
    async (t) => {
      const {
        req: deleteReq,
        res: deleteRes,
        workspace,
        authenticator,
      } = await createPrivateApiMockRequest({
        method: "DELETE",
        role: "admin",
      });
      await SpaceFactory.system(workspace, t);
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
        await MCPServerConnectionResource.listByWorkspace({
          auth: authenticator,
          connectionType: "workspace",
        });
      expect(remainingWorkspaceConnections).toHaveLength(0);

      const remainingPersonalConnections =
        await MCPServerConnectionResource.listByWorkspace({
          auth: authenticator,
          connectionType: "personal",
        });
      expect(remainingPersonalConnections).toHaveLength(0);
    }
  );

  itInTransaction(
    "GET a non-existing connection should return 404",
    async () => {
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
    }
  );

  itInTransaction(
    "DELETE a workspace connection as non-admin should return 500",
    async (t) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "DELETE",
        role: "user", // Explicitly set as non-admin
      });
      await SpaceFactory.system(workspace, t);
      const remoteServer = await RemoteMCPServerFactory.create(workspace);

      const admin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, admin, "admin");
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
    }
  );

  itInTransaction(
    "DELETE a personal connection as non-admin and wrong user should return 404",
    async (t) => {
      // Create first user and their connection
      const { workspace, authenticator: authenticator1 } =
        await createPrivateApiMockRequest({
          method: "GET",
        });
      await SpaceFactory.system(workspace, t);
      const remoteServer = await RemoteMCPServerFactory.create(workspace);
      const connection1 = await MCPServerConnectionFactory.remote(
        authenticator1,
        remoteServer,
        "personal"
      );

      // Create second user and try to delete first user's connection
      const user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user2, "user");

      const { req, res } = await createPrivateApiMockRequest({
        method: "DELETE",
        role: "user",
      });
      req.query.connectionType = "personal";
      req.query.cId = connection1.sId;
      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    }
  );
});
