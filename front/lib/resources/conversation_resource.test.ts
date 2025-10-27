import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID } from "@app/types";

vi.mock(import("../../lib/api/redis"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    runOnRedis: vi.fn().mockImplementation((_, fn) =>
      fn({
        zAdd: vi.fn().mockResolvedValue(undefined),
        expire: vi.fn().mockResolvedValue(undefined),
      })
    ),
  };
});

const setupTestAgents = async (
  workspace: LightWorkspaceType,
  user: UserResource
) => {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const agents = await Promise.all([
    AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent 1 ${user.name}`,
      description: "Hidden test agent",
      scope: "hidden",
    }),
    AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent 2 ${user.name}`,
      description: "Visible test agent",
      scope: "visible",
    }),
  ]);

  return agents;
};

const dateFromDaysAgo = (days: number) => {
  return new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000);
};

describe("ConversationResource", () => {
  describe("listAllBeforeDate", () => {
    let auth: Authenticator;
    let convo1Id: string;
    let convo2Id: string;
    let convo3Id: string;
    let convo4Id: string;

    let anotherAuth: Authenticator;
    let anotherConvoId: string;

    beforeEach(async () => {
      const workspace = await WorkspaceFactory.basic();
      const user = await UserFactory.basic();
      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      const agents = await setupTestAgents(workspace, user);

      const convo1 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(10), dateFromDaysAgo(8)],
      });
      const convo2 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[1].sId,
        messagesCreatedAt: [dateFromDaysAgo(100), dateFromDaysAgo(1)],
      });
      const convo3 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(100), dateFromDaysAgo(91)],
      });
      const convo4 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[1].sId,
        messagesCreatedAt: [dateFromDaysAgo(150), dateFromDaysAgo(110)],
      });

      convo1Id = convo1.sId;
      convo2Id = convo2.sId;
      convo3Id = convo3.sId;
      convo4Id = convo4.sId;

      // Just to make sure we have the filter on workspaceId we also create a very very old convo for another workspace.
      const anotherWorkspace = await WorkspaceFactory.basic();
      const anotherUser = await UserFactory.basic();
      anotherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        anotherUser.sId,
        anotherWorkspace.sId
      );
      const anotherAgents = await setupTestAgents(
        anotherWorkspace,
        anotherUser
      );
      const anotherConvo = await ConversationFactory.create(anotherAuth, {
        agentConfigurationId: anotherAgents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(800)],
      });
      anotherConvoId = anotherConvo.sId;
    });

    afterEach(async () => {
      await destroyConversation(auth, {
        conversationId: convo1Id,
      });
      await destroyConversation(auth, {
        conversationId: convo2Id,
      });
      await destroyConversation(auth, {
        conversationId: convo3Id,
      });
      await destroyConversation(auth, {
        conversationId: convo4Id,
      });
      await destroyConversation(anotherAuth, {
        conversationId: anotherConvoId,
      });
    });

    it("should return only conversations with all messages before cutoff date: 90 days ago", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        { cutoffDate: dateFromDaysAgo(90) }
      );
      expect(oldConversations.length).toBe(2);
      const oldConversationIds = oldConversations.map((c) => c.sId);
      expect(oldConversationIds).toContain(convo3Id);
      expect(oldConversationIds).toContain(convo4Id);
    });

    it("should return only conversations with all messages before cutoff date: 200 days ago", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        { cutoffDate: dateFromDaysAgo(200) }
      );
      expect(oldConversations.length).toBe(0);
    });

    it("should return only conversations with all messages before cutoff date: 5 days ago", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        { cutoffDate: dateFromDaysAgo(5) }
      );
      expect(oldConversations.length).toBe(3);
      const oldConversationIds = oldConversations.map((c) => c.sId);
      expect(oldConversationIds).toContain(convo1Id);
      expect(oldConversationIds).toContain(convo3Id);
      expect(oldConversationIds).toContain(convo4Id);
    });

    it("should return all old conversations no matter the batch size", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        {
          batchSize: 1,
          cutoffDate: dateFromDaysAgo(1),
        }
      );
      expect(oldConversations.length).toBe(4);
    });
  });

  describe("listConversationWithAgentCreatedBeforeDate", () => {
    let auth: Authenticator;
    let convo1Id: string;
    let convo2Id: string;
    let convo3Id: string;
    let convo4Id: string;

    let anotherAuth: Authenticator;
    let anotherConvoId: string;

    let agents: LightAgentConfigurationType[];

    beforeEach(async () => {
      const workspace = await WorkspaceFactory.basic();
      const user = await UserFactory.basic();
      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      agents = await setupTestAgents(workspace, user);

      const convo1 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(10), dateFromDaysAgo(8)],
        conversationCreatedAt: dateFromDaysAgo(10),
      });
      const convo2 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(11), dateFromDaysAgo(1)],
        conversationCreatedAt: dateFromDaysAgo(11),
      });
      const convo3 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(5), dateFromDaysAgo(1)],
        conversationCreatedAt: dateFromDaysAgo(5),
      });
      const convo4 = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[1].sId,
        messagesCreatedAt: [dateFromDaysAgo(10), dateFromDaysAgo(1)],
        conversationCreatedAt: dateFromDaysAgo(10),
      });

      convo1Id = convo1.sId;
      convo2Id = convo2.sId;
      convo3Id = convo3.sId;
      convo4Id = convo4.sId;

      // Just to make sure we have the filter on workspaceId we also create a very very old convo for another workspace.
      const anotherWorkspace = await WorkspaceFactory.basic();
      const anotherUser = await UserFactory.basic();
      anotherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        anotherUser.sId,
        anotherWorkspace.sId
      );
      const anotherAgents = await setupTestAgents(
        anotherWorkspace,
        anotherUser
      );
      const anotherConvo = await ConversationFactory.create(anotherAuth, {
        agentConfigurationId: anotherAgents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(800)],
        conversationCreatedAt: dateFromDaysAgo(10),
      });
      anotherConvoId = anotherConvo.sId;
    });

    afterEach(async () => {
      await destroyConversation(auth, {
        conversationId: convo1Id,
      });
      await destroyConversation(auth, {
        conversationId: convo2Id,
      });
      await destroyConversation(auth, {
        conversationId: convo3Id,
      });
      await destroyConversation(auth, {
        conversationId: convo4Id,
      });
      await destroyConversation(anotherAuth, {
        conversationId: anotherConvoId,
      });
    });

    it("should return only conversations created before cutoff date and with the valid agent: 7 days ago", async () => {
      const conversations =
        await ConversationResource.listConversationWithAgentCreatedBeforeDate(
          auth,
          {
            agentConfigurationId: agents[0].sId,
            cutoffDate: dateFromDaysAgo(7),
          }
        );
      expect(conversations.length).toBe(2);
      expect(conversations).toContain(convo1Id);
      expect(conversations).toContain(convo2Id);
    });
    it("should return only conversations created before cutoff date and with the valid agent: 1 day ago", async () => {
      const conversationsAgent0 =
        await ConversationResource.listConversationWithAgentCreatedBeforeDate(
          auth,
          {
            agentConfigurationId: agents[0].sId,
            cutoffDate: dateFromDaysAgo(1),
          }
        );
      expect(conversationsAgent0.length).toBe(3);
      expect(conversationsAgent0).toContain(convo1Id);
      expect(conversationsAgent0).toContain(convo2Id);
      expect(conversationsAgent0).toContain(convo3Id);

      const conversationsAgent1 =
        await ConversationResource.listConversationWithAgentCreatedBeforeDate(
          auth,
          {
            agentConfigurationId: agents[1].sId,
            cutoffDate: dateFromDaysAgo(1),
          }
        );
      expect(conversationsAgent1.length).toBe(1);
      expect(conversationsAgent1).toContain(convo4Id);
    });
  });

  describe("fetchMCPServerViews", () => {
    it("should fetch all MCP server views for a conversation", async () => {
      const { workspace, authenticator, globalSpace } =
        await createResourceTest({ role: "admin" });

      const conversation = await ConversationFactory.create(authenticator, {
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

      const conversation = await ConversationFactory.create(authenticator, {
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

  describe("createResourcePermissionsFromSpacesWithMap", () => {
    let auth: Authenticator;
    let globalSpace: SpaceResource;
    let regularSpace: SpaceResource;
    let spaceIdToGroupsMap: Map<number, string[]>;

    beforeEach(async () => {
      const {
        authenticator,
        globalSpace: gs,
        workspace,
      } = await createResourceTest({
        role: "admin",
      });

      auth = authenticator;
      globalSpace = gs;
      regularSpace = await SpaceFactory.regular(workspace);

      const allSpaces = [globalSpace, regularSpace];
      spaceIdToGroupsMap = createSpaceIdToGroupsMap(auth, allSpaces);
    });

    it("should resolve space ids to group permissions", () => {
      const permissions = createResourcePermissionsFromSpacesWithMap(
        spaceIdToGroupsMap,
        [globalSpace.id]
      );

      expect(permissions).toBeDefined();
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions[0]).toHaveProperty("groups");
    });

    it("should handle multiple space ids", () => {
      const permissions = createResourcePermissionsFromSpacesWithMap(
        spaceIdToGroupsMap,
        [globalSpace.id, regularSpace.id]
      );

      expect(permissions).toBeDefined();
      expect(permissions.length).toBeGreaterThan(0);
    });

    it("should throw assertion error for missing spaces", () => {
      expect(() =>
        createResourcePermissionsFromSpacesWithMap(
          spaceIdToGroupsMap,
          [99999] // Non-existent space Id.
        )
      ).toThrow("No group IDs found for space ID 99999");
    });

    it("should handle empty space ids array", () => {
      const permissions = createResourcePermissionsFromSpacesWithMap(
        spaceIdToGroupsMap,
        []
      );

      expect(permissions).toBeDefined();
      expect(permissions).toEqual([]);
    });
  });

  describe("baseFetchWithAuthorization with space-based permissions", () => {
    let adminAuth: Authenticator;
    let userAuth: Authenticator;
    let workspace: LightWorkspaceType;
    let agents: LightAgentConfigurationType[];
    let globalSpace: SpaceResource;
    let restrictedSpace: SpaceResource;
    let conversations: {
      accessible: string[];
      restricted: string[];
    };

    beforeEach(async () => {
      const {
        authenticator,
        globalSpace: gs,
        user,
        workspace: w,
      } = await createResourceTest({
        role: "admin",
      });

      workspace = w;
      globalSpace = gs;

      // Create different users with different access levels.
      const adminUser = user;
      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      adminAuth = authenticator;
      userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      // Set up spaces and agents.
      // Create a restricted space only accessible to the admin user.
      restrictedSpace = await SpaceFactory.regular(workspace);
      const res = await restrictedSpace.addMembers(adminAuth, {
        userIds: [adminUser.sId],
      });
      assert(res.isOk(), "Failed to add member to restricted space");
      // Once added, we need to refresh the auth.
      adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );

      agents = await setupTestAgents(workspace, adminUser);

      // Create conversations with different space access patterns.
      const accessibleConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [globalSpace.id], // Global space (accessible to regular users).
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      const restrictedConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [restrictedSpace.id], // Restricted space (only accessible to admin user).
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      conversations = {
        accessible: [accessibleConvo.sId],
        restricted: [restrictedConvo.sId],
      };
    });

    afterEach(async () => {
      // Clean up conversations.
      for (const sId of [
        ...conversations.accessible,
        ...conversations.restricted,
      ]) {
        await destroyConversation(adminAuth, { conversationId: sId });
      }
    });

    describe("with feature flag OFF", () => {
      it("should return all conversations regardless of permissions", async () => {
        const allConversations = await ConversationResource.listAll(userAuth);

        const conversationIds = allConversations.map((c) => c.sId);
        expect(conversationIds).toContain(conversations.accessible[0]);
        expect(conversationIds).toContain(conversations.restricted[0]);
      });
    });

    describe("with feature flag ON", () => {
      beforeEach(async () => {
        await FeatureFlagFactory.basic("use_requested_space_ids", workspace);
      });

      it("should filter conversations based on user permissions", async () => {
        const userConversations = await ConversationResource.listAll(userAuth);
        const adminConversations =
          await ConversationResource.listAll(adminAuth);

        const userConvoIds = userConversations.map((c) => c.sId);
        const adminConvoIds = adminConversations.map((c) => c.sId);

        // Regular user should only see accessible conversations.
        expect(userConvoIds).toContain(conversations.accessible[0]);
        expect(userConvoIds).not.toContain(conversations.restricted[0]);

        // Admin should see all conversations.
        expect(adminConvoIds).toContain(conversations.accessible[0]);
        expect(adminConvoIds).toContain(conversations.restricted[0]);
      });

      it("should handle conversations with no requested spaces", async () => {
        const emptySpaceConvo = await ConversationFactory.create(adminAuth, {
          agentConfigurationId: agents[0].sId,
          requestedSpaceIds: [], // No spaces requested.
          messagesCreatedAt: [dateFromDaysAgo(5)],
        });

        const allConversations = await ConversationResource.listAll(userAuth);
        const conversationIds = allConversations.map((c) => c.sId);

        expect(conversationIds).toContain(emptySpaceConvo.sId);

        // Clean up.
        await destroyConversation(adminAuth, {
          conversationId: emptySpaceConvo.sId,
        });
      });

      it("should handle conversations with multiple space IDs", async () => {
        const multiSpaceConvo = await ConversationFactory.create(adminAuth, {
          agentConfigurationId: agents[0].sId,
          requestedSpaceIds: [globalSpace.id, restrictedSpace.id], // Both global and restricted spaces.
          messagesCreatedAt: [dateFromDaysAgo(5)],
        });

        const userConversations = await ConversationResource.listAll(userAuth);
        const adminConversations =
          await ConversationResource.listAll(adminAuth);

        const userConvoIds = userConversations.map((c) => c.sId);
        const adminConvoIds = adminConversations.map((c) => c.sId);

        // Regular user needs access to ALL spaces, so shouldn't see this conversation.
        expect(userConvoIds).not.toContain(multiSpaceConvo.sId);

        // Admin should see it.
        expect(adminConvoIds).toContain(multiSpaceConvo.sId);

        // Clean up.
        await destroyConversation(adminAuth, {
          conversationId: multiSpaceConvo.sId,
        });
      });

      it("should filter out conversations referencing deleted spaces", async () => {
        // Create a regular space and a conversation referencing it.
        const tempSpace = await SpaceFactory.regular(workspace);
        const res = await tempSpace.addMembers(adminAuth, {
          userIds: [adminAuth.getNonNullableUser().sId],
        });
        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          adminAuth.getNonNullableUser().sId,
          workspace.sId
        );
        assert(res.isOk(), "Failed to add member to temp space");

        const tempSpaceConvo = await ConversationFactory.create(auth, {
          agentConfigurationId: agents[0].sId,
          requestedSpaceIds: [tempSpace.id], // Reference the space that will be "deleted".
          messagesCreatedAt: [dateFromDaysAgo(5)],
        });

        // Verify conversation is initially visible.
        let allConversations = await ConversationResource.listAll(auth);
        let conversationIds = allConversations.map((c) => c.sId);
        expect(conversationIds).toContain(tempSpaceConvo.sId);

        // Simulate space deletion by deleting the space from database.
        await tempSpace.delete(auth, { hardDelete: false });

        // Now the conversation should be filtered out because its space no longer exists.
        allConversations = await ConversationResource.listAll(auth);
        conversationIds = allConversations.map((c) => c.sId);
        expect(conversationIds).not.toContain(tempSpaceConvo.sId);

        // Clean up the conversation.
        await destroyConversation(auth, {
          conversationId: tempSpaceConvo.sId,
        });
      });
    });
  });

  describe("listConversationsForUser", () => {
    let adminAuth: Authenticator;
    let userAuth: Authenticator;
    let workspace: LightWorkspaceType;
    let agents: LightAgentConfigurationType[];
    let conversationIds: string[];

    beforeEach(async () => {
      const {
        authenticator,
        user,
        workspace: w,
      } = await createResourceTest({
        role: "admin",
      });

      workspace = w;
      const adminUser = user;
      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      adminAuth = authenticator;
      userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        regularUser.sId,
        workspace.sId
      );

      agents = await setupTestAgents(workspace, adminUser);

      // Create a single conversation for basic testing
      const conversation = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      conversationIds = [conversation.sId];

      // Add regular user as participant
      await ConversationResource.upsertParticipation(userAuth, {
        conversation,
        action: "posted",
      });
    });

    afterEach(async () => {
      for (const sId of conversationIds) {
        await destroyConversation(adminAuth, { conversationId: sId });
      }
    });

    it("should return only conversations user participates in", async () => {
      const userConversations =
        await ConversationResource.listConversationsForUser(userAuth);

      expect(userConversations).toHaveLength(1);
      expect(userConversations[0].sId).toBe(conversationIds[0]);
      expect(userConversations[0]).toBeInstanceOf(ConversationResource);
    });

    it("should return conversations with populated participation data", async () => {
      // First, get the raw participation data from the database to compare
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/assistant/conversation"
      );
      const participation = await ConversationParticipantModel.findOne({
        where: {
          conversationId: (await ConversationResource.fetchById(
            adminAuth,
            conversationIds[0]
          ))!.id,
          userId: userAuth.getNonNullableUser().id,
          workspaceId: userAuth.getNonNullableWorkspace().id,
        },
      });
      assert(participation, "Participation not found");

      const userConversations =
        await ConversationResource.listConversationsForUser(userAuth);

      expect(userConversations).toHaveLength(1);
      const conversationData = userConversations[0].toJSON();

      // Verify participation data is used in toJSON.
      expect(conversationData.updated).toBe(participation.updatedAt.getTime());
      expect(conversationData.unread).toBe(participation.unread);
      expect(conversationData.actionRequired).toBe(
        participation.actionRequired
      );

      // Verify other fields are present.
      expect(conversationData.id).toBeDefined();
      expect(conversationData.sId).toBeDefined();
      expect(conversationData.title).toBeDefined();
      expect(conversationData.created).toBeDefined();
      expect(Array.isArray(conversationData.requestedGroupIds)).toBe(true);
      expect(Array.isArray(conversationData.requestedSpaceIds)).toBe(true);
    });

    it("should return conversations sorted by participation updated time", async () => {
      // Create a new conversation with more recent participation
      const recentConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [new Date()],
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: recentConvo,
        action: "posted",
      });

      const userConversations =
        await ConversationResource.listConversationsForUser(userAuth);

      expect(userConversations).toHaveLength(2);
      // Most recent participation should be first.
      expect(userConversations[0].sId).toBe(recentConvo.sId);
      expect(userConversations[1].sId).toBe(conversationIds[0]);

      const serializedConvs = userConversations.map((c) => c.toJSON());

      // Verify sorting by updated time.
      expect(serializedConvs[0].updated).toBeGreaterThan(
        serializedConvs[1].updated!
      );

      await destroyConversation(adminAuth, { conversationId: recentConvo.sId });
    });

    it("should handle empty participation list", async () => {
      // Create a user with no participations.
      const orphanUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, orphanUser, {
        role: "user",
      });
      const orphanAuth = await Authenticator.fromUserIdAndWorkspaceId(
        orphanUser.sId,
        workspace.sId
      );

      const conversations =
        await ConversationResource.listConversationsForUser(orphanAuth);

      expect(conversations).toHaveLength(0);
    });

    it("should handle visibility filters with includeDeleted option", async () => {
      const conversation = await ConversationResource.fetchById(
        userAuth,
        conversationIds[0]
      );
      assert(conversation, "Conversation not found");

      // Mark conversation as deleted.
      await conversation.updateVisibilityToDeleted();

      // Without includeDeleted, should not see deleted conversation.
      let userConversations =
        await ConversationResource.listConversationsForUser(userAuth);
      expect(userConversations).toHaveLength(0);

      // With includeDeleted, should see deleted conversation.
      userConversations = await ConversationResource.listConversationsForUser(
        userAuth,
        { includeDeleted: true }
      );
      expect(userConversations).toHaveLength(1);
      expect(userConversations[0].sId).toBe(conversationIds[0]);
    });
  });
});
