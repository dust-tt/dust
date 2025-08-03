import { assert, describe, expect, it } from "vitest";

import { ConversationMCPServerViewResource } from "@app/lib/resources/conversation_mcp_server_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { GLOBAL_AGENTS_SID } from "@app/types";

describe("ConversationMCPServerViewResource", () => {
  describe("makeNew", () => {
    it("should create a new conversation MCP server view", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      // Create a conversation
      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create a remote MCP server and view
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );

      assert(mcpServerView, "MCP server view not found");

      // Create the conversation MCP server view relationship
      const result = await ConversationMCPServerViewResource.makeNew(
        authenticator,
        {
          conversation: conversation,
          mcpServerViewId: mcpServerView.id,
          enabled: true,
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resource = result.value;
        expect(resource.workspaceId).toBe(workspace.id);
        expect(resource.conversationId).toBe(conversation.id);
        expect(resource.mcpServerViewId).toBe(mcpServerView.id);
        expect(resource.userId).toBe(authenticator.getNonNullableUser().id);
        expect(resource.enabled).toBe(true);
      }
    });

    it("should create with enabled=false when specified", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );

      assert(mcpServerView, "MCP server view not found");

      const result = await ConversationMCPServerViewResource.makeNew(
        authenticator,
        {
          conversation: conversation,
          mcpServerViewId: mcpServerView.id,
          enabled: false,
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.enabled).toBe(false);
      }
    });

    it("should prevent creating relationship for conversation in different workspace", async () => {
      // Create two workspaces
      const { authenticator: auth1 } = await createResourceTest({});
      const { workspace: workspace2, authenticator: auth2 } =
        await createResourceTest({});

      // Create a conversation in workspace1
      const conversation = await ConversationFactory.create({
        auth: auth1,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create an MCP server view in workspace2
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace2);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth2,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      // Try to create relationship using auth2 (workspace2) with conversation from workspace1
      const result = await ConversationMCPServerViewResource.makeNew(auth2, {
        conversation: conversation,
        mcpServerViewId: mcpServerView.id,
        enabled: true,
      });

      // This should fail due to workspace mismatch
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "Workspace ID mismatch between conversation and authenticated workspace"
        );
      }
    });
  });

  describe("fetchByConversationId", () => {
    it("should fetch all MCP server views for a conversation", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create multiple MCP server views
      const remoteMCPServer1 = await RemoteMCPServerFactory.create(workspace);
      const remoteMCPServer2 = await RemoteMCPServerFactory.create(workspace);

      const mcpServerView1 =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer1.sId
        );
      const mcpServerView2 =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer2.sId
        );

      assert(mcpServerView1, "MCP server view not found");
      assert(mcpServerView2, "MCP server view not found");

      // Create relationships
      await ConversationMCPServerViewResource.makeNew(authenticator, {
        conversation: conversation,
        mcpServerViewId: mcpServerView1.id,
        enabled: true,
      });
      await ConversationMCPServerViewResource.makeNew(authenticator, {
        conversation: conversation,
        mcpServerViewId: mcpServerView2.id,
        enabled: false,
      });

      const results =
        await ConversationMCPServerViewResource.fetchByConversationId(
          authenticator,
          conversation.id
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
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      // Create one enabled and one disabled relationship
      await ConversationMCPServerViewResource.makeNew(authenticator, {
        conversation: conversation,
        mcpServerViewId: mcpServerView.id,
        enabled: true,
      });

      const remoteMCPServer2 = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView2 =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer2.sId
        );
      assert(mcpServerView2, "MCP server view not found");

      await ConversationMCPServerViewResource.makeNew(authenticator, {
        conversation: conversation,
        mcpServerViewId: mcpServerView2.id,
        enabled: false,
      });

      const allResults =
        await ConversationMCPServerViewResource.fetchByConversationId(
          authenticator,
          conversation.id
        );
      const enabledResults =
        await ConversationMCPServerViewResource.fetchByConversationId(
          authenticator,
          conversation.id,
          true
        );

      expect(allResults).toHaveLength(2);
      expect(enabledResults).toHaveLength(1);
      expect(enabledResults[0].enabled).toBe(true);
    });
  });

  describe("fetchByMCPServerViewModelId", () => {
    it("should fetch all conversations using a specific MCP server view", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      // Create multiple conversations
      const conversation1 = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const conversation2 = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      // Create relationships
      await ConversationMCPServerViewResource.makeNew(authenticator, {
        conversation: conversation1,
        mcpServerViewId: mcpServerView.id,
        enabled: true,
      });
      await ConversationMCPServerViewResource.makeNew(authenticator, {
        conversation: conversation2,
        mcpServerViewId: mcpServerView.id,
        enabled: false,
      });

      const results =
        await ConversationMCPServerViewResource.fetchByMCPServerViewModelId(
          authenticator,
          mcpServerView.id
        );

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.conversationId === conversation1.id)).toBe(
        true
      );
      expect(results.some((r) => r.conversationId === conversation2.id)).toBe(
        true
      );
    });
  });

  describe("fetchByConversationAndMCPServerViewModelId", () => {
    it("should fetch specific relationship", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);

      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      // Create relationship
      const created = await ConversationMCPServerViewResource.makeNew(
        authenticator,
        {
          conversation: conversation,
          mcpServerViewId: mcpServerView.id,
          enabled: true,
        }
      );

      expect(created.isOk()).toBe(true);

      const fetched =
        await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
          authenticator,
          conversation.id,
          mcpServerView.id
        );

      expect(fetched).not.toBeNull();
      expect(fetched!.conversationId).toBe(conversation.id);
      expect(fetched!.mcpServerViewId).toBe(mcpServerView.id);
    });

    it("should return null when relationship doesn't exist", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      const result =
        await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
          authenticator,
          conversation.id,
          mcpServerView.id
        );

      expect(result).toBeNull();
    });
  });

  describe("updateEnabled", () => {
    it("should update enabled status", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      const created = await ConversationMCPServerViewResource.makeNew(
        authenticator,
        {
          conversation: conversation,
          mcpServerViewId: mcpServerView.id,
          enabled: true,
        }
      );

      expect(created.isOk()).toBe(true);
      if (created.isOk()) {
        const resource = created.value;
        expect(resource.enabled).toBe(true);

        const updateResult = await resource.updateEnabled(false);
        expect(updateResult.isOk()).toBe(true);

        // Fetch again to verify the update
        const fetched =
          await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
            authenticator,
            conversation.id,
            mcpServerView.id
          );
        expect(fetched!.enabled).toBe(false);
      }
    });
  });

  describe("delete", () => {
    it("should delete the relationship", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      const created = await ConversationMCPServerViewResource.makeNew(
        authenticator,
        {
          conversation: conversation,
          mcpServerViewId: mcpServerView.id,
          enabled: true,
        }
      );

      expect(created.isOk()).toBe(true);
      if (created.isOk()) {
        const resource = created.value;
        const deleteResult = await resource.delete(authenticator, {});
        expect(deleteResult.isOk()).toBe(true);

        // Verify it's deleted
        const fetched =
          await ConversationMCPServerViewResource.fetchByConversationAndMCPServerViewModelId(
            authenticator,
            conversation.id,
            mcpServerView.id
          );
        expect(fetched).toBeNull();
      }
    });
  });

  describe("toJSON", () => {
    it("should serialize correctly", async () => {
      const { workspace, authenticator } = await createResourceTest({});

      const conversation = await ConversationFactory.create({
        auth: authenticator,
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });
      const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          authenticator,
          remoteMCPServer.sId
        );
      assert(mcpServerView, "MCP server view not found");

      const created = await ConversationMCPServerViewResource.makeNew(
        authenticator,
        {
          conversation: conversation,
          mcpServerViewId: mcpServerView.id,
          enabled: true,
        }
      );

      expect(created.isOk()).toBe(true);
      if (created.isOk()) {
        const resource = created.value;
        const json = resource.toJSON();

        expect(json).toMatchObject({
          id: resource.id,
          workspaceId: workspace.id,
          conversationId: conversation.id,
          mcpServerViewId: mcpServerView.id,
          userId: authenticator.getNonNullableUser().id,
          enabled: true,
        });
        expect(json.sId).toBe(
          ConversationMCPServerViewResource.modelIdToSId({
            id: resource.id,
            workspaceId: workspace.id,
          })
        );
        expect(typeof json.createdAt).toBe("object");
        expect(typeof json.updatedAt).toBe("object");
      }
    });
  });
});
