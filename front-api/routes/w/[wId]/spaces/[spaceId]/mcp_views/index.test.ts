import { Authenticator } from "@app/lib/auth";
import { emailRecipientFromUser } from "@app/lib/notifications/transactional_emails";
import { notifyAdminsMCPGlobalSharingReconfiguration } from "@app/lib/notifications/triggers/mcp-global-sharing-reconfiguration";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/notifications/triggers/mcp-global-sharing-reconfiguration",
  async (importOriginal) => ({
    ...(await importOriginal()),
    notifyAdminsMCPGlobalSharingReconfiguration: vi.fn(),
  })
);

describe("GET /api/w/:wId/spaces/:spaceId/mcp_views/not_activated", () => {
  it("returns activable MCP server views", async () => {
    const { workspace, globalGroup, globalSpace } =
      await createPrivateApiMockRequest({ role: "admin" });

    const space = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(space, globalGroup);

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

    await FeatureFlagFactory.basic(auth, "http_client_tool");
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      { name: "http_client", useCase: null }
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
      role: "user",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const regularSpace = await SpaceFactory.regular(workspace);
    const [memberGroup] = await regularSpace.fetchRegularAutoGroups(adminAuth);
    if (!memberGroup) {
      throw new Error("Expected the space member group to exist.");
    }
    await memberGroup.dangerouslyAddMember(adminAuth, {
      user: user.toJSON(),
    });
    await FeatureFlagFactory.basic(adminAuth, "http_client_tool");

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      adminAuth,
      { name: "http_client", useCase: null }
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
    expect(body.error.type).toBe("workspace_auth_error");
    expect(body.error.message).toBe(ENSURE_IS_ADMIN_ERROR_MESSAGE);
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
        type: "mcp_server_view_not_found",
        message: "MCP Server View not found",
      },
    });
  });
});

describe("POST /api/w/:wId/spaces/:spaceId/mcp_views", () => {
  beforeEach(() => {
    vi.mocked(notifyAdminsMCPGlobalSharingReconfiguration).mockReset();
    vi.mocked(notifyAdminsMCPGlobalSharingReconfiguration).mockResolvedValue(
      new Ok(undefined)
    );
  });

  async function setupToolUsedByAgentInRegularSpace() {
    const { workspace, user, auth, globalGroup, globalSpace } =
      await createPrivateApiMockRequest({ role: "admin" });

    const regularSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(regularSpace, globalGroup);

    const mcpServer = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server",
      url: "https://test-server.example.com",
    });
    const regularView = await MCPServerViewFactory.create(
      workspace,
      mcpServer.sId,
      regularSpace
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Affected Agent",
    });
    await AgentMCPServerConfigurationFactory.create(auth, regularSpace, {
      agent,
      mcpServerView: regularView,
    });

    return { workspace, user, globalSpace, mcpServer };
  }

  it("notifies active admins when sharing a tool globally affects agents", async () => {
    const { workspace, user, globalSpace, mcpServer } =
      await setupToolUsedByAgentInRegularSpace();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${globalSpace.sId}/mcp_views`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerId: mcpServer.sId }),
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.serverView.spaceId).toBe(globalSpace.sId);

    expect(notifyAdminsMCPGlobalSharingReconfiguration).toHaveBeenCalledTimes(
      1
    );
    expect(
      vi.mocked(notifyAdminsMCPGlobalSharingReconfiguration).mock.calls[0][0]
    ).toEqual({
      admins: [emailRecipientFromUser(user.toJSON())],
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      toolName: expect.any(String),
      agentNames: ["Affected Agent"],
    });
  });

  it("still creates the view when the notification fails", async () => {
    vi.mocked(notifyAdminsMCPGlobalSharingReconfiguration).mockResolvedValue(
      new Err(new Error("Novu is down"))
    );
    const { workspace, globalSpace, mcpServer } =
      await setupToolUsedByAgentInRegularSpace();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${globalSpace.sId}/mcp_views`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerId: mcpServer.sId }),
      }
    );

    expect(response.status).toBe(200);
    expect(notifyAdminsMCPGlobalSharingReconfiguration).toHaveBeenCalledTimes(
      1
    );
  });

  it("does not notify when sharing to a regular space", async () => {
    const { workspace, mcpServer } = await setupToolUsedByAgentInRegularSpace();
    const otherSpace = await SpaceFactory.regular(workspace);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${otherSpace.sId}/mcp_views`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpServerId: mcpServer.sId }),
      }
    );

    expect(response.status).toBe(200);
    expect(notifyAdminsMCPGlobalSharingReconfiguration).not.toHaveBeenCalled();
  });
});
