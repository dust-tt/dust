import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

describe("MCPServerConnectionResource", () => {
  describe("findByMCPServer", () => {
    it("should return error for non-related authenticator trying to access personal connection", async () => {
      // Create first workspace and its connection
      const { workspace: workspace1, authenticator: authenticator1 } =
        await createPrivateApiMockRequest({
          method: "GET",
        });
      const remoteServer1 = await RemoteMCPServerFactory.create(workspace1);
      await MCPServerConnectionFactory.remote(
        authenticator1,
        remoteServer1,
        "personal"
      );

      // Create second workspace and try to access connection1
      const { authenticator: authenticator2 } =
        await createPrivateApiMockRequest({
          method: "GET",
        });

      const result = await MCPServerConnectionResource.findByMCPServer(
        authenticator2,
        {
          mcpServerId: remoteServer1.sId,
          connectionType: "personal",
        }
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Connection not found");
      }
    });

    it("should allow any workspace member to access workspace connection", async () => {
      const { workspace, authenticator: adminAuthenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });
      const remoteServer = await RemoteMCPServerFactory.create(workspace);

      // Create workspace connection as admin
      const workspaceConnection = await MCPServerConnectionFactory.remote(
        adminAuthenticator,
        remoteServer,
        "workspace"
      );

      // Create a regular user in the same workspace
      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });
      const regularUserAuthenticator =
        await Authenticator.fromUserIdAndWorkspaceId(
          regularUser.sId,
          workspace.sId
        );

      // Try to access workspace connection as regular user
      const result = await MCPServerConnectionResource.findByMCPServer(
        regularUserAuthenticator,
        {
          mcpServerId: remoteServer.sId,
          connectionType: "workspace",
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sId).toBe(workspaceConnection.sId);
      }
    });

    it("should only allow related authenticator to access personal connection", async () => {
      const { workspace, authenticator: authenticator1 } =
        await createPrivateApiMockRequest({
          method: "GET",
        });
      const remoteServer = await RemoteMCPServerFactory.create(workspace);

      // Create personal connection for first user
      const connection1 = await MCPServerConnectionFactory.remote(
        authenticator1,
        remoteServer,
        "personal"
      );

      // Create second user in the same workspace
      const user2 = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user2, { role: "user" });
      const authenticator2 = await Authenticator.fromUserIdAndWorkspaceId(
        user2.sId,
        workspace.sId
      );

      // Try to access connection as second user
      const result = await MCPServerConnectionResource.findByMCPServer(
        authenticator2,
        {
          mcpServerId: remoteServer.sId,
          connectionType: "personal",
        }
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Connection not found");
      }

      // Verify original user can still access their connection
      const originalUserResult =
        await MCPServerConnectionResource.findByMCPServer(authenticator1, {
          mcpServerId: remoteServer.sId,
          connectionType: "personal",
        });

      expect(originalUserResult.isOk()).toBe(true);
      if (originalUserResult.isOk()) {
        expect(originalUserResult.value.sId).toBe(connection1.sId);
      }
    });
  });
});
