import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/spaces/:spaceId/mcp_views/not_activated", () => {
  it("returns activable MCP server views", async () => {
    const { workspace, globalGroup, globalSpace } =
      await createPrivateApiMockRequest({ role: "admin" });

    const space = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(space, globalGroup);

    const mcpServer1 = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server 1",
      url: "https://test-server-1.example.com",
      tools: [
        {
          name: "tool-1",
          description: "Tool 1 description",
          inputSchema: undefined,
        },
      ],
    });
    const mcpServer2 = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server 2",
      url: "https://test-server-2.example.com",
      tools: [
        {
          name: "tool-2",
          description: "Tool 2 description",
          inputSchema: undefined,
        },
      ],
    });
    await MCPServerViewFactory.create(workspace, mcpServer1.sId, globalSpace);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${space.sId}/mcp_views/not_activated`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.serverViews).toHaveLength(1);
    expect(body.serverViews[0].server.sId).toBe(mcpServer2.toJSON().sId);
  });
});

describe("DELETE /api/w/:wId/spaces/:spaceId/mcp_views/:svId", () => {
  it("deletes a server view", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagFactory.basic(auth, "dev_mcp_actions");
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      { name: "primitive_types_debugger", useCase: null }
    );
    const serverView = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      globalSpace
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${globalSpace.sId}/mcp_views/${serverView.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });

    const deleted = await MCPServerViewResource.fetchById(auth, serverView.sId);
    expect(deleted).toBe(null);
  });

  it("returns 403 when user is not authorized to delete a server view", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "builder",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const regularSpace = await SpaceFactory.regular(workspace);
    await regularSpace.groups[0].dangerouslyAddMember(adminAuth, {
      user: user.toJSON(),
    });
    await FeatureFlagFactory.basic(adminAuth, "dev_mcp_actions");

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      adminAuth,
      { name: "primitive_types_debugger", useCase: null }
    );
    const serverView = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      regularSpace
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${regularSpace.sId}/mcp_views/${serverView.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe("mcp_auth_error");
    expect(body.error.message).toBe(
      "User is not authorized to remove tools from a space."
    );
  });

  it("returns 404 when server view doesn't exist", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const fakeId = makeSId("mcp_server_view", {
      id: 1000,
      workspaceId: workspace.id,
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${globalSpace.sId}/mcp_views/${fakeId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "MCP Server View not found",
      },
    });
  });
});
