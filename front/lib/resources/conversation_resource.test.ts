import { assert, describe, expect, it } from "vitest";

import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types";

describe("ConversationResource", () => {
  describe("fetchMCPServerViews", () => {
    it("should fetch all MCP server views for a conversation", async () => {
      const { workspace, authenticator, globalSpace } =
        await createResourceTest({ role: "admin" });

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create multiple MCP server views
      const remoteMCPServer1 = await RemoteMCPServerFactory.create(workspace);
      const remoteMCPServer2 = await RemoteMCPServerFactory.create(workspace);

      const systemView1 =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer1.sId
        );
      assert(systemView1, "MCP server view not found");
      const mcpServerView1 = await MCPServerViewResource.create(authenticator, {
        systemView: systemView1,
        space: globalSpace,
      });
      const systemView2 =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer2.sId
        );
      assert(systemView2, "MCP server view not found");
      const mcpServerView2 = await MCPServerViewResource.create(authenticator, {
        systemView: systemView2,
        space: globalSpace,
      });
      assert(mcpServerView1, "MCP server view not found");
      assert(mcpServerView2, "MCP server view not found");

      // Create relationships
      await ConversationResource.upsertMCPServerViews(authenticator, {
        conversation: conversation,
        mcpServerViews: [mcpServerView1],
        enabled: true,
      });
      await ConversationResource.upsertMCPServerViews(authenticator, {
        conversation: conversation,
        mcpServerViews: [mcpServerView2],
        enabled: false,
      });

      const results = await ConversationResource.fetchMCPServerViews(
        authenticator,
        conversation
      );

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.mcpServerViewId === mcpServerView1.id)).toBe(
        true
      );
      expect(results.some((r) => r.mcpServerViewId === mcpServerView2.id)).toBe(
        true
      );
    });

    it("should filter by enabled status when onlyEnabled=true", async () => {
      const { workspace, authenticator, globalSpace } =
        await createResourceTest({ role: "admin" });

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(systemView, "MCP server view not found");
      const mcpServerView = await MCPServerViewResource.create(authenticator, {
        systemView,
        space: globalSpace,
      });

      // Create one enabled and one disabled relationship
      await ConversationResource.upsertMCPServerViews(authenticator, {
        conversation: conversation,
        mcpServerViews: [mcpServerView],
        enabled: true,
      });

      const remoteMCPServer2 = await RemoteMCPServerFactory.create(workspace);
      const systemView2 =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer2.sId
        );
      assert(systemView2, "MCP server view not found");
      const mcpServerView2 = await MCPServerViewResource.create(authenticator, {
        systemView: systemView2,
        space: globalSpace,
      });

      await ConversationResource.upsertMCPServerViews(authenticator, {
        conversation: conversation,
        mcpServerViews: [mcpServerView2],
        enabled: false,
      });

      const allResults = await ConversationResource.fetchMCPServerViews(
        authenticator,
        conversation
      );
      const enabledResults = await ConversationResource.fetchMCPServerViews(
        authenticator,
        conversation,
        true
      );

      expect(allResults).toHaveLength(2);
      expect(enabledResults).toHaveLength(1);
      expect(enabledResults[0].enabled).toBe(true);
    });
  });
});
