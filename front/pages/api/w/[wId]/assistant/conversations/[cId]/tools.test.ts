import type { RequestMethod } from "node-mocks-http";
import { assert, describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewResource } from "@app/lib/resources/conversation_mcp_server_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types";

import handler from "./tools";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  await FeatureFlagFactory.basic("jit_tools", workspace);

  const conversation = await ConversationFactory.create({
    auth: authenticator,
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });
  const systemSpace = await SpaceFactory.system(workspace);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;

  return {
    req,
    res,
    workspace,
    systemSpace,
    conversation,
    auth: authenticator,
  };
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]/tools", () => {
  it("should return empty tools list when no tools are enabled", async () => {
    const { req, res } = await setupTest("admin", "GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.tools).toEqual([]);
  });

  it("should return enabled tools for a conversation", async () => {
    const { req, res, workspace, conversation, auth } = await setupTest(
      "admin",
      "GET"
    );

    // Create MCP server views
    const remoteMCPServer1 = await RemoteMCPServerFactory.create(workspace);
    const remoteMCPServer2 = await RemoteMCPServerFactory.create(workspace);

    const mcpServerView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer1.sId
      );
    assert(mcpServerView1, "MCP server view not found");
    const mcpServerView2 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer2.sId
      );
    assert(mcpServerView2, "MCP server view not found");
    // Create conversation relationships - one enabled, one disabled
    await ConversationMCPServerViewResource.makeNew(auth, {
      conversation: conversation,
      mcpServerViewId: mcpServerView1.id,
      enabled: true,
    });
    await ConversationMCPServerViewResource.makeNew(auth, {
      conversation: conversation,
      mcpServerViewId: mcpServerView2.id,
      enabled: false,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.tools).toHaveLength(1);
    expect(responseData.tools[0].sId).toBe(mcpServerView1.sId);
  });

  it("should return 400 when conversation ID is missing", async () => {
    const { req, res } = await setupTest("admin", "GET");
    delete req.query.cId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toContain("cId");
  });

  it("should return 404 when conversation doesn't exist", async () => {
    const { req, res } = await setupTest("admin", "GET");
    req.query.cId = "non-existent-conversation";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });
});

describe("POST /api/w/[wId]/assistant/conversations/[cId]/tools", () => {
  describe("add action", () => {
    it("should add a new tool to conversation", async () => {
      const { req, res, workspace, conversation, auth } = await setupTest(
        "admin",
        "POST"
      );

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const globalSpace = await SpaceFactory.global(workspace);
      const mcpServerView = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      req.body = {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      };

      await handler(req, res);

      const responseData = res._getJSONData();
      expect(res._getStatusCode()).toBe(200);
      expect(responseData.success).toBe(true);

      // Verify the relationship was created
      const relationship =
        await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
          auth,
          conversation.id,
          mcpServerView.id
        );
      expect(relationship).not.toBeNull();
      expect(relationship!.enabled).toBe(true);
    });

    it("should enable existing disabled tool", async () => {
      const { req, res, workspace, conversation, auth } = await setupTest(
        "admin",
        "POST"
      );

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const globalSpace = await SpaceFactory.global(workspace);
      const mcpServerView = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      // Create disabled relationship
      await ConversationMCPServerViewResource.makeNew(auth, {
        conversation: conversation,
        mcpServerViewId: mcpServerView.id,
        enabled: false,
      });

      req.body = {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.success).toBe(true);

      // Verify the relationship is now enabled
      const relationship =
        await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
          auth,
          conversation.id,
          mcpServerView.id
        );
      expect(relationship!.enabled).toBe(true);
    });

    it("should handle already enabled tool gracefully", async () => {
      const { req, res, workspace, conversation, auth } = await setupTest(
        "admin",
        "POST"
      );

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const globalSpace = await SpaceFactory.global(workspace);
      const mcpServerView = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      // Create enabled relationship
      await ConversationMCPServerViewResource.makeNew(auth, {
        conversation: conversation,
        mcpServerViewId: mcpServerView.id,
        enabled: true,
      });

      req.body = {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.success).toBe(true);
    });

    it("should return 404 when MCP server view doesn't exist", async () => {
      const { req, res } = await setupTest("admin", "POST");

      req.body = {
        action: "add",
        mcp_server_view_id: "non-existent-view",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("mcp_server_view_not_found");
    });
  });

  describe("delete action", () => {
    it("should disable existing tool", async () => {
      const { req, res, workspace, conversation, auth } = await setupTest(
        "admin",
        "POST"
      );

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const globalSpace = await SpaceFactory.global(workspace);
      const mcpServerView = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      // Create enabled relationship
      await ConversationMCPServerViewResource.makeNew(auth, {
        conversation: conversation,
        mcpServerViewId: mcpServerView.id,
        enabled: true,
      });

      req.body = {
        action: "delete",
        mcp_server_view_id: mcpServerView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.success).toBe(true);

      // Verify the relationship is now disabled
      const relationship =
        await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
          auth,
          conversation.id,
          mcpServerView.id
        );
      expect(relationship!.enabled).toBe(false);
    });

    it("should handle non-existent relationship gracefully", async () => {
      const { req, res, workspace, auth } = await setupTest("admin", "POST");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const globalSpace = await SpaceFactory.global(workspace);
      const mcpServerView = await MCPServerViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });

      req.body = {
        action: "delete",
        mcp_server_view_id: mcpServerView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.success).toBe(true);
    });

    it("should return 404 when MCP server view doesn't exist", async () => {
      const { req, res } = await setupTest("admin", "POST");

      req.body = {
        action: "delete",
        mcp_server_view_id: "non-existent-view",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("mcp_server_view_not_found");
    });
  });

  describe("validation", () => {
    it("should return 400 for invalid request body", async () => {
      const { req, res } = await setupTest("admin", "POST");

      req.body = null;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("invalid_request_error");
    });

    it("should return 400 for invalid action", async () => {
      const { req, res } = await setupTest("admin", "POST");

      req.body = {
        action: "invalid",
        mcp_server_view_id: "some-id",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("invalid_request_error");
    });

    it("should return 400 for missing mcp_server_view_id", async () => {
      const { req, res } = await setupTest("admin", "POST");

      req.body = {
        action: "add",
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("invalid_request_error");
    });

    it("should return 400 for non-string mcp_server_view_id", async () => {
      const { req, res } = await setupTest("admin", "POST");

      req.body = {
        action: "add",
        mcp_server_view_id: 123,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = res._getJSONData();
      expect(responseData.error.type).toBe("invalid_request_error");
    });
  });

  describe("permissions", () => {
    it("should work for users with access to conversation", async () => {
      const { req, res, workspace, auth } = await setupTest("user", "POST");

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const globalSpace = await SpaceFactory.global(workspace);
      const mcpServerView = await MCPServerViewResource.create(
        await Authenticator.internalAdminForWorkspace(workspace.sId),
        {
          systemView,
          space: globalSpace,
        }
      );

      req.body = {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = res._getJSONData();
      expect(responseData.success).toBe(true);
    });
  });
});

describe("Method Support /api/w/[wId]/assistant/conversations/[cId]/tools", () => {
  it("should return 405 for unsupported methods", async () => {
    const { req, res } = await setupTest("admin", "DELETE");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("method_not_supported_error");
    expect(responseData.error.message).toContain("GET or POST expected");
  });
});
