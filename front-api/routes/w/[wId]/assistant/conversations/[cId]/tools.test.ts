import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth, globalSpace, systemSpace } =
    await createPrivateApiMockRequest({ role });

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });

  return { auth, conversation, globalSpace, systemSpace, workspace };
}

function getTools(workspace: { sId: string }, cId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/tools`
  );
}

function postTools(workspace: { sId: string }, cId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/tools`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/tools", () => {
  it("should return empty tools list when no tools are enabled", async () => {
    const { workspace, conversation } = await setupTest("admin");

    const response = await getTools(workspace, conversation.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).tools).toEqual([]);
  });

  it("should return enabled tools for a conversation", async () => {
    const { workspace, globalSpace, conversation, auth } =
      await setupTest("admin");

    const remoteMCPServer1 = await RemoteMCPServerFactory.create(workspace);
    const remoteMCPServer2 = await RemoteMCPServerFactory.create(workspace);

    const systemView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer1.sId
      );
    assert(systemView1, "MCP server view not found");
    const { view: mcpServerView1 } = await MCPServerViewResource.create(auth, {
      systemView: systemView1,
      space: globalSpace,
    });
    const systemView2 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer2.sId
      );
    assert(systemView2, "MCP server view not found");
    const { view: mcpServerView2 } = await MCPServerViewResource.create(auth, {
      systemView: systemView2,
      space: globalSpace,
    });

    await ConversationResource.upsertMCPServerViews(auth, {
      conversation,
      mcpServerViews: [mcpServerView1],
      enabled: true,
      source: "conversation",
      agentConfigurationId: null,
    });
    await ConversationResource.upsertMCPServerViews(auth, {
      conversation,
      mcpServerViews: [mcpServerView2],
      enabled: false,
      source: "conversation",
      agentConfigurationId: null,
    });

    const response = await getTools(workspace, conversation.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.tools).toHaveLength(1);
    expect(responseData.tools[0].sId).toBe(mcpServerView1.sId);
  });

  it("should return 404 when conversation doesn't exist", async () => {
    const { workspace } = await setupTest("admin");

    const response = await getTools(workspace, "non-existent-conversation");

    expect(response.status).toBe(404);
  });
});

describe("POST /api/w/:wId/assistant/conversations/:cId/tools", () => {
  describe("add action", () => {
    it("should add a new tool to conversation", async () => {
      const { workspace, conversation, auth, globalSpace } =
        await setupTest("admin");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const relationship = await ConversationResource.fetchMCPServerViews(
        auth,
        conversation
      );
      expect(relationship).toHaveLength(1);
      expect(relationship[0].enabled).toBe(true);
    });

    it("should enable existing disabled tool", async () => {
      const { workspace, conversation, auth, globalSpace } =
        await setupTest("admin");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      await ConversationResource.upsertMCPServerViews(auth, {
        conversation,
        mcpServerViews: [mcpServerView],
        enabled: false,
        source: "conversation",
        agentConfigurationId: null,
      });

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const relationship = await ConversationResource.fetchMCPServerViews(
        auth,
        conversation
      );
      expect(relationship).toHaveLength(1);
      expect(relationship[0].enabled).toBe(true);
    });

    it("should handle already enabled tool gracefully", async () => {
      const { workspace, conversation, auth, globalSpace } =
        await setupTest("admin");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      await ConversationResource.upsertMCPServerViews(auth, {
        conversation,
        mcpServerViews: [mcpServerView],
        enabled: true,
        source: "conversation",
        agentConfigurationId: null,
      });

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);
    });

    it("should return 404 when MCP server view doesn't exist", async () => {
      const { workspace, conversation } = await setupTest("admin");

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
        mcp_server_view_id: "non-existent-view",
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe(
        "mcp_server_view_not_found"
      );
    });
  });

  describe("delete action", () => {
    it("should disable existing tool", async () => {
      const { workspace, conversation, auth, globalSpace } =
        await setupTest("admin");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      await ConversationResource.upsertMCPServerViews(auth, {
        conversation,
        mcpServerViews: [mcpServerView],
        enabled: true,
        source: "conversation",
        agentConfigurationId: null,
      });

      const response = await postTools(workspace, conversation.sId, {
        action: "delete",
        mcp_server_view_id: mcpServerView.sId,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const relationship = await ConversationResource.fetchMCPServerViews(
        auth,
        conversation
      );
      expect(relationship).toHaveLength(1);
      expect(relationship[0].enabled).toBe(false);
    });

    it("should handle non-existent relationship gracefully", async () => {
      const { workspace, conversation, auth, globalSpace } =
        await setupTest("admin");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      const response = await postTools(workspace, conversation.sId, {
        action: "delete",
        mcp_server_view_id: mcpServerView.sId,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);
    });

    it("should return 404 when MCP server view doesn't exist", async () => {
      const { workspace, conversation } = await setupTest("admin");

      const response = await postTools(workspace, conversation.sId, {
        action: "delete",
        mcp_server_view_id: "non-existent-view",
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe(
        "mcp_server_view_not_found"
      );
    });
  });

  describe("validation", () => {
    it("should return 400 for invalid request body", async () => {
      const { workspace, conversation } = await setupTest("admin");

      const response = await honoApp.request(
        `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/tools`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "null",
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("should return 400 for invalid action", async () => {
      const { workspace, conversation } = await setupTest("admin");

      const response = await postTools(workspace, conversation.sId, {
        action: "invalid",
        mcp_server_view_id: "some-id",
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("should return 400 for missing mcp_server_view_id", async () => {
      const { workspace, conversation } = await setupTest("admin");

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("should return 400 for non-string mcp_server_view_id", async () => {
      const { workspace, conversation } = await setupTest("admin");

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
        mcp_server_view_id: 123,
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });
  });

  describe("permissions", () => {
    it("should work for users with access to conversation", async () => {
      const { workspace, conversation, globalSpace } = await setupTest("user");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          adminAuth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const { view: mcpServerView } = await MCPServerViewResource.create(
        adminAuth,
        {
          systemView,
          space: globalSpace,
        }
      );

      const response = await postTools(workspace, conversation.sId, {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);
    });
  });
});
