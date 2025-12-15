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
import {
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type {
  ConversationWithoutContentType,
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
    const anotherAgents = await setupTestAgents(anotherWorkspace, anotherUser);
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
    const { workspace, authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

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
    const { workspace, authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });

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

  it("should filter conversations based on user permissions", async () => {
    const userConversations = await ConversationResource.listAll(userAuth);
    const adminConversations = await ConversationResource.listAll(adminAuth);

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

  it("should skip permission filtering when dangerouslySkipPermissionFiltering is true", async () => {
    // Regular user should see restricted conversations when skipping permissions
    const allConversations = await ConversationResource.listAll(userAuth, {
      dangerouslySkipPermissionFiltering: true,
    });

    const conversationIds = allConversations.map((c) => c.sId);

    // User should now see both accessible and restricted conversations
    expect(conversationIds).toContain(conversations.accessible[0]);
    expect(conversationIds).toContain(conversations.restricted[0]);
  });

  it("should include deleted conversations when includeDeleted option is true", async () => {
    // Create and then delete a conversation
    const deletableConvo = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agents[0].sId,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [dateFromDaysAgo(5)],
    });

    const conversationResource = await ConversationResource.fetchById(
      adminAuth,
      deletableConvo.sId
    );

    assert(conversationResource, "Conversation resource not found");
    await conversationResource.updateVisibilityToDeleted();

    // Without includeDeleted, should not be visible
    const withoutDeleted = await ConversationResource.listAll(adminAuth);
    const withoutDeletedIds = withoutDeleted.map((c) => c.sId);
    expect(withoutDeletedIds).not.toContain(deletableConvo.sId);

    // With includeDeleted, should be visible
    const withDeleted = await ConversationResource.listAll(adminAuth, {
      includeDeleted: true,
    });
    const withDeletedIds = withDeleted.map((c) => c.sId);
    expect(withDeletedIds).toContain(deletableConvo.sId);

    // Clean up
    await destroyConversation(adminAuth, {
      conversationId: deletableConvo.sId,
    });
  });

  it("should respect limit parameter", async () => {
    // Create multiple conversations
    const convo1 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agents[0].sId,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [dateFromDaysAgo(5)],
    });
    const convo2 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agents[0].sId,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [dateFromDaysAgo(4)],
    });
    const convo3 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agents[0].sId,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [dateFromDaysAgo(3)],
    });

    // Note: fetchByIds doesn't expose limit directly, so we test via listAll
    // which internally uses baseFetchWithAuthorization
    const allConversationsUnlimited =
      await ConversationResource.listAll(adminAuth);
    expect(allConversationsUnlimited.length).toBeGreaterThanOrEqual(5); // At least our test conversations

    // Clean up
    await destroyConversation(adminAuth, { conversationId: convo1.sId });
    await destroyConversation(adminAuth, { conversationId: convo2.sId });
    await destroyConversation(adminAuth, { conversationId: convo3.sId });
  });

  it("should return empty array when no conversations exist for workspace", async () => {
    // Create a fresh workspace with no conversations
    const newWorkspace = await WorkspaceFactory.basic();

    // Create the required default groups for the workspace
    await GroupResource.makeDefaultsForWorkspace(newWorkspace);

    const newUser = await UserFactory.basic();
    await MembershipFactory.associate(newWorkspace, newUser, {
      role: "admin",
    });
    const newAuth = await Authenticator.fromUserIdAndWorkspaceId(
      newUser.sId,
      newWorkspace.sId
    );

    const conversations = await ConversationResource.listAll(newAuth);
    expect(conversations).toEqual([]);
  });

  it("should handle conversations with spaces from the same workspace only", async () => {
    // Create a space in the admin workspace
    const adminSpace = await SpaceFactory.regular(workspace);
    const res = await adminSpace.addMembers(adminAuth, {
      userIds: [adminAuth.getNonNullableUser().sId],
    });
    assert(res.isOk(), "Failed to add member to admin space");

    const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminAuth.getNonNullableUser().sId,
      workspace.sId
    );

    // Create conversation with this space
    const convoWithSpace = await ConversationFactory.create(
      refreshedAdminAuth,
      {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [adminSpace.id],
        messagesCreatedAt: [dateFromDaysAgo(5)],
      }
    );

    // Should be accessible since space belongs to same workspace
    const conversations =
      await ConversationResource.listAll(refreshedAdminAuth);
    const conversationIds = conversations.map((c) => c.sId);
    expect(conversationIds).toContain(convoWithSpace.sId);

    // Clean up
    await destroyConversation(refreshedAdminAuth, {
      conversationId: convoWithSpace.sId,
    });
    await adminSpace.delete(refreshedAdminAuth, { hardDelete: false });
  });

  it("should handle conversations with multiple space IDs", async () => {
    const multiSpaceConvo = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agents[0].sId,
      requestedSpaceIds: [globalSpace.id, restrictedSpace.id], // Both global and restricted spaces.
      messagesCreatedAt: [dateFromDaysAgo(5)],
    });

    const userConversations = await ConversationResource.listAll(userAuth);
    const adminConversations = await ConversationResource.listAll(adminAuth);

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
      user: userAuth.getNonNullableUser().toJSON(),
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
      "@app/lib/models/agent/conversation"
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
    expect(conversationData.unread).toBe(participation.unread);
    expect(conversationData.actionRequired).toBe(participation.actionRequired);

    // Verify other fields are present.
    expect(conversationData.id).toBeDefined();
    expect(conversationData.sId).toBeDefined();
    expect(conversationData.title).toBeDefined();
    expect(conversationData.created).toBeDefined();
    expect(conversationData.updated).toBeDefined();
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
      user: userAuth.getNonNullableUser().toJSON(),
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

  it("should not return test conversations by default", async () => {
    // Create a test conversation by updating visibility
    const testConvo = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agents[0].sId,
      messagesCreatedAt: [dateFromDaysAgo(3)],
      visibility: "test",
    });

    // Add user as participant to the test conversation
    await ConversationResource.upsertParticipation(userAuth, {
      conversation: testConvo,
      action: "posted",
      user: userAuth.getNonNullableUser().toJSON(),
    });

    // By default, should only see unlisted conversations (not test conversations)
    const userConversations =
      await ConversationResource.listConversationsForUser(userAuth);
    const conversationIds = userConversations.map((c) => c.sId);
    expect(conversationIds).toContain(conversationIds[0]); // original conversation
    expect(conversationIds).not.toContain(testConvo.sId); // test conversation should be filtered out

    // Clean up
    await destroyConversation(adminAuth, { conversationId: testConvo.sId });
  });

  describe("onlyUnread filter", () => {
    it("should return only unread conversations when onlyUnread is true", async () => {
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );

      // Create two more conversations
      const unreadConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(2)],
      });

      const readConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      // Add user as participant to both
      await ConversationResource.upsertParticipation(userAuth, {
        conversation: unreadConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: readConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Mark the original conversation as read
      await ConversationParticipantModel.update(
        { unread: false },
        {
          where: {
            conversationId: (await ConversationResource.fetchById(
              adminAuth,
              conversationIds[0]
            ))!.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      // Mark unreadConvo as unread
      await ConversationParticipantModel.update(
        { unread: true },
        {
          where: {
            conversationId: (await ConversationResource.fetchById(
              adminAuth,
              unreadConvo.sId
            ))!.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      // Mark readConvo as read
      await ConversationParticipantModel.update(
        { unread: false },
        {
          where: {
            conversationId: (await ConversationResource.fetchById(
              adminAuth,
              readConvo.sId
            ))!.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      // Test with onlyUnread: true
      const unreadConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: true,
          kind: "private",
        });

      const unreadIds = unreadConversations.map((c) => c.sId);
      expect(unreadIds).toContain(unreadConvo.sId);
      expect(unreadIds).not.toContain(conversationIds[0]);
      expect(unreadIds).not.toContain(readConvo.sId);

      // Test with onlyUnread: false (default)
      const allConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: false,
          kind: "private",
        });

      const allIds = allConversations.map((c) => c.sId);
      expect(allIds.length).toBeGreaterThanOrEqual(3);
      expect(allIds).toContain(unreadConvo.sId);
      expect(allIds).toContain(readConvo.sId);

      // Clean up
      await destroyConversation(adminAuth, { conversationId: unreadConvo.sId });
      await destroyConversation(adminAuth, { conversationId: readConvo.sId });
    });

    it("should return empty array when onlyUnread is true but user has no unread conversations", async () => {
      // Mark all conversations as read
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );

      const conversation = await ConversationResource.fetchById(
        adminAuth,
        conversationIds[0]
      );
      assert(conversation, "Conversation not found");

      await ConversationParticipantModel.update(
        { unread: false },
        {
          where: {
            conversationId: conversation.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      const unreadConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: true,
          kind: "private",
        });

      expect(unreadConversations).toHaveLength(0);
    });
  });

  describe("kind filter", () => {
    it("should return only private conversations when kind is private", async () => {
      // Create a space
      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(adminAuth, {
        userIds: [userAuth.getNonNullableUser().sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      // Create a new conversation and add user as participant
      const spaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: spaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Update the conversation to have a spaceId (making it a space conversation)
      await ConversationModel.update(
        { spaceId: space.id },
        {
          where: {
            id: spaceConvo.id,
            workspaceId: workspace.id,
          },
        }
      );

      // Test with kind: "private"
      const privateConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: false,
          kind: "private",
        });

      const privateIds = privateConversations.map((c) => c.sId);
      expect(privateIds).toContain(conversationIds[0]); // original private conversation
      expect(privateIds).not.toContain(spaceConvo.sId); // space conversation should be filtered out

      // Clean up
      await destroyConversation(adminAuth, { conversationId: spaceConvo.sId });
    });

    it("should return only space conversations when kind is space", async () => {
      // Create a space
      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(adminAuth, {
        userIds: [userAuth.getNonNullableUser().sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      // Create a new conversation and add user as participant
      const spaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: spaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Update the conversation to have a spaceId (making it a space conversation)
      await ConversationModel.update(
        { spaceId: space.id },
        {
          where: {
            id: spaceConvo.id,
            workspaceId: workspace.id,
          },
        }
      );

      // Test with kind: "space"
      const spaceConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: false,
          kind: "space",
        });

      const spaceIds = spaceConversations.map((c) => c.sId);
      expect(spaceIds).toContain(spaceConvo.sId); // space conversation should be included
      expect(spaceIds).not.toContain(conversationIds[0]); // private conversation should be filtered out

      // Clean up
      await destroyConversation(adminAuth, { conversationId: spaceConvo.sId });
    });

    it("should default to private conversations when kind is not specified", async () => {
      // Create a space
      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(adminAuth, {
        userIds: [userAuth.getNonNullableUser().sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      // Create a new conversation and add user as participant
      const spaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: spaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Update the conversation to have a spaceId (making it a space conversation)
      await ConversationModel.update(
        { spaceId: space.id },
        {
          where: {
            id: spaceConvo.id,
            workspaceId: workspace.id,
          },
        }
      );

      // Test with default parameters (should default to kind: "private")
      const defaultConversations =
        await ConversationResource.listConversationsForUser(userAuth);

      const defaultIds = defaultConversations.map((c) => c.sId);
      expect(defaultIds).toContain(conversationIds[0]); // original private conversation
      expect(defaultIds).not.toContain(spaceConvo.sId); // space conversation should be filtered out

      // Clean up
      await destroyConversation(adminAuth, { conversationId: spaceConvo.sId });
    });
  });

  describe("combined filters", () => {
    it("should filter by both onlyUnread and kind when both are specified", async () => {
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );

      // Create a space
      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(adminAuth, {
        userIds: [userAuth.getNonNullableUser().sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      // Create unread space conversation
      const unreadSpaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: unreadSpaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Update the conversation to have a spaceId (making it a space conversation)
      await ConversationModel.update(
        { spaceId: space.id },
        {
          where: {
            id: unreadSpaceConvo.id,
            workspaceId: workspace.id,
          },
        }
      );

      // Create read space conversation
      const readSpaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: readSpaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Update the conversation to have a spaceId (making it a space conversation)
      await ConversationModel.update(
        { spaceId: space.id },
        {
          where: {
            id: readSpaceConvo.id,
            workspaceId: workspace.id,
          },
        }
      );

      // Create unread private conversation
      const unreadPrivateConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(1)],
      });

      // Add user as participant to all
      await ConversationResource.upsertParticipation(userAuth, {
        conversation: unreadSpaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: readSpaceConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      await ConversationResource.upsertParticipation(userAuth, {
        conversation: unreadPrivateConvo,
        action: "posted",
        user: userAuth.getNonNullableUser().toJSON(),
      });

      // Mark unreadSpaceConvo as unread
      await ConversationParticipantModel.update(
        { unread: true },
        {
          where: {
            conversationId: (await ConversationResource.fetchById(
              adminAuth,
              unreadSpaceConvo.sId
            ))!.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      // Mark readSpaceConvo as read
      await ConversationParticipantModel.update(
        { unread: false },
        {
          where: {
            conversationId: (await ConversationResource.fetchById(
              adminAuth,
              readSpaceConvo.sId
            ))!.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      // Mark unreadPrivateConvo as unread
      await ConversationParticipantModel.update(
        { unread: true },
        {
          where: {
            conversationId: (await ConversationResource.fetchById(
              adminAuth,
              unreadPrivateConvo.sId
            ))!.id,
            workspaceId: userAuth.getNonNullableWorkspace().id,
            userId: userAuth.getNonNullableUser().id,
          },
        }
      );

      // Test with onlyUnread: true and kind: "space" - should only return unread space conversations
      const unreadSpaceConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: true,
          kind: "space",
        });

      const unreadSpaceIds = unreadSpaceConversations.map((c) => c.sId);
      expect(unreadSpaceIds).toContain(unreadSpaceConvo.sId);
      expect(unreadSpaceIds).not.toContain(readSpaceConvo.sId);
      expect(unreadSpaceIds).not.toContain(unreadPrivateConvo.sId);

      // Test with onlyUnread: true and kind: "private" - should only return unread private conversations
      const unreadPrivateConversations =
        await ConversationResource.listConversationsForUser(userAuth, {
          onlyUnread: true,
          kind: "private",
        });

      const unreadPrivateIds = unreadPrivateConversations.map((c) => c.sId);
      expect(unreadPrivateIds).toContain(unreadPrivateConvo.sId);
      expect(unreadPrivateIds).not.toContain(unreadSpaceConvo.sId);
      expect(unreadPrivateIds).not.toContain(readSpaceConvo.sId);

      // Clean up
      await destroyConversation(adminAuth, {
        conversationId: unreadSpaceConvo.sId,
      });
      await destroyConversation(adminAuth, {
        conversationId: readSpaceConvo.sId,
      });
      await destroyConversation(adminAuth, {
        conversationId: unreadPrivateConvo.sId,
      });
    });
  });
});

describe("Space Handling", () => {
  describe("makeNew with optional space", () => {
    it("should create a conversation with a space when space is provided", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Test makeNew with space
      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation with space",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        space
      );

      expect(testConversation).toBeDefined();
      expect(testConversation.space).toBe(space);
      expect(testConversation.toJSON().spaceId).toBe(space.sId);
      expect(testConversation.toJSON().requestedSpaceIds).toHaveLength(1);
      expect(testConversation.toJSON().requestedSpaceIds).toContain(space.sId);
    });

    it("should create a conversation without a space when space is null", async () => {
      const { workspace, user } = await createResourceTest({
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation without space",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        null
      );

      expect(testConversation).toBeDefined();
      expect(testConversation.space).toBeNull();
      expect(testConversation.toJSON().spaceId).toBeNull();
      expect(testConversation.toJSON().requestedSpaceIds).toHaveLength(0);
    });

    it("should create a conversation with the provided space and return it in the resource", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        space
      );

      // Verify the space is accessible via the getter
      expect(testConversation.space).toBeDefined();
      expect(testConversation.space?.sId).toBe(space.sId);
      expect(testConversation.space?.id).toBe(space.id);
    });
  });

  describe("space getter", () => {
    it("should return the space when space is provided and set", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        space
      );

      expect(testConversation.space).toBe(space);
    });

    it("should return null when space is null", async () => {
      const { workspace, user } = await createResourceTest({
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        null
      );

      expect(testConversation.space).toBeNull();
    });

    it("should throw error when conversation has spaceId but space is not loaded", async () => {
      const { workspace, user, globalSpace } = await createResourceTest({
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create a conversation with space but don't provide the space
      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          spaceId: globalSpace.id,
          requestedSpaceIds: [],
        },
        null
      );

      expect(() => {
        return testConversation.space;
      }).toThrow(
        "This conversation is associated with a space but the related space is not loaded. Action: make sure to load the space when fetching the conversation."
      );
    });
  });

  describe("getRequestedSpaceIdsFromModel", () => {
    it("should include the main space when space is set", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        space
      );

      const spaceIds = testConversation.getRequestedSpaceIdsFromModel();

      expect(spaceIds).toContain(space.sId);
    });

    it("should not include the main space when space is null", async () => {
      const { workspace, user } = await createResourceTest({
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        null
      );

      const spaceIds = testConversation.getRequestedSpaceIdsFromModel();

      expect(spaceIds).toHaveLength(0);
    });

    it("should include both requested spaces and main space", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      const mainSpace = await SpaceFactory.regular(workspace);
      const additionalSpace = await SpaceFactory.regular(workspace);

      // Add user to both spaces
      const addMainRes = await mainSpace.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addMainRes.isOk(), "Failed to add user to main space");

      const addAdditionalRes = await additionalSpace.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addAdditionalRes.isOk(), "Failed to add user to additional space");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const testConversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [additionalSpace.id],
        },
        mainSpace
      );

      const spaceIds = testConversation.getRequestedSpaceIdsFromModel();

      // Should include both the requested space and the main space
      expect(spaceIds).toContain(
        SpaceResource.modelIdToSId({
          id: additionalSpace.id,
          workspaceId: workspace.id,
        })
      );
      expect(spaceIds).toContain(mainSpace.sId);
      expect(spaceIds.length).toBe(2);
    });
  });

  describe("Space Write Permissions", () => {
    describe("makeNew with space access", () => {
      it("should allow creating a conversation with a space when user has access", async () => {
        const { workspace, authenticator, user } = await createResourceTest({
          role: "admin",
        });

        const space = await SpaceFactory.regular(workspace);

        // Add the user as a member of the space
        const addMembersRes = await space.addMembers(authenticator, {
          userIds: [user.sId],
        });
        assert(addMembersRes.isOk(), "Failed to add user to space");

        // Refresh auth to get updated permissions
        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          workspace.sId
        );

        const conversation = await ConversationResource.makeNew(
          auth,
          {
            title: "Test conversation with access",
            sId: generateRandomModelSId(),
            requestedSpaceIds: [],
          },
          space
        );

        expect(conversation).toBeDefined();
        expect(conversation.space).toBe(space);
      });

      it("should throw error when creating a conversation in a space without access", async () => {
        const { workspace } = await createResourceTest({
          role: "admin",
        });

        // Create a space with restricted access
        const restrictedSpace = await SpaceFactory.regular(workspace);

        // Create a regular user without access to the space
        const regularUser = await UserFactory.basic();
        await MembershipFactory.associate(workspace, regularUser, {
          role: "user",
        });

        const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
          regularUser.sId,
          workspace.sId
        );

        // Try to create a conversation in the restricted space
        const attempt = ConversationResource.makeNew(
          userAuth,
          {
            title: "Test conversation without access",
            sId: generateRandomModelSId(),
            requestedSpaceIds: [],
          },
          restrictedSpace
        );

        await expect(attempt).rejects.toThrow(
          "Cannot create conversation in a space you do not have access to."
        );
      });

      it("should allow creating a conversation with no space regardless of permissions", async () => {
        const { workspace } = await createResourceTest({
          role: "admin",
        });

        // Create a regular user
        const regularUser = await UserFactory.basic();
        await MembershipFactory.associate(workspace, regularUser, {
          role: "user",
        });

        const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
          regularUser.sId,
          workspace.sId
        );

        // Creating a conversation with no space should work
        const conversation = await ConversationResource.makeNew(
          userAuth,
          {
            title: "Test conversation with no space",
            sId: generateRandomModelSId(),
            requestedSpaceIds: [],
          },
          null
        );

        expect(conversation).toBeDefined();
        expect(conversation.space).toBeNull();
      });
    });
  });

  describe("Space Workspace Matching", () => {
    it("should throw error when space belongs to a different workspace (access check happens first)", async () => {
      const { workspace: workspace1, user: user1 } = await createResourceTest({
        role: "admin",
      });

      // Create a second workspace - this properly sets up default groups
      const { workspace: workspace2, authenticator: adminAuth2 } =
        await createResourceTest({
          role: "admin",
        });

      const spaceInWorkspace2 = await SpaceFactory.regular(workspace2);

      // Add user1 to workspace2
      await MembershipFactory.associate(workspace2, user1, {
        role: "user",
      });

      // Add user1 as member of the space in workspace2 (using admin auth from workspace2)
      const addMembersRes = await spaceInWorkspace2.addMembers(adminAuth2, {
        userIds: [user1.sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      // Get auth for user1 in workspace1
      const user1AuthInWorkspace1 =
        await Authenticator.fromUserIdAndWorkspaceId(user1.sId, workspace1.sId);

      // Try to create a conversation in workspace1 using a space from workspace2
      // Note: The access check will fail first because user1 doesn't have access to this space
      // from the perspective of workspace1's authentication
      const attempt = ConversationResource.makeNew(
        user1AuthInWorkspace1,
        {
          title: "Test conversation with mismatched space",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        spaceInWorkspace2
      );

      // This should throw an error (either access or workspace mismatch)
      await expect(attempt).rejects.toThrow();
    });

    it("should allow creating conversation when space belongs to same workspace", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      const space = await SpaceFactory.regular(workspace);

      // Add user to the space
      const addMembersRes = await space.addMembers(authenticator, {
        userIds: [user.sId],
      });
      assert(addMembersRes.isOk(), "Failed to add user to space");

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // This should succeed because the space is in the same workspace
      const conversation = await ConversationResource.makeNew(
        auth,
        {
          title: "Test conversation with matching workspace",
          sId: generateRandomModelSId(),
          requestedSpaceIds: [],
        },
        space
      );

      expect(conversation).toBeDefined();
      expect(conversation.space?.id).toBe(space.id);
    });
  });

  describe("makeNew order of operations", () => {
    it("should not create conversation if space access check fails", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Create a user without access to the space
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, {
        role: "user",
      });

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Try to create a conversation - should fail before creating the object
      const testSId = generateRandomModelSId();
      const attempt = ConversationResource.makeNew(
        userAuth,
        {
          title: "Should not be created",
          sId: testSId,
          requestedSpaceIds: [],
        },
        restrictedSpace
      );

      await expect(attempt).rejects.toThrow(
        "Cannot create conversation in a space you do not have access to."
      );

      // Verify the conversation was not created by trying to fetch it
      // (the conversation should not exist in the database)
      const fetchedConversations = await ConversationResource.listAll(userAuth);
      const foundConversation = fetchedConversations.some(
        (c) => c.sId === testSId
      );
      expect(foundConversation).toBe(false);
    });

    it("should verify checks run before conversation creation", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a restricted space that the user doesn't have access to
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Create another user without access
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });

      const otherUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const testSId = generateRandomModelSId();

      // Attempt should fail at validation, not at creation
      const attempt = ConversationResource.makeNew(
        otherUserAuth,
        {
          title: "Should not be created",
          sId: testSId,
          requestedSpaceIds: [],
        },
        restrictedSpace
      );

      await expect(attempt).rejects.toThrow(
        "Cannot create conversation in a space you do not have access to."
      );

      // Verify the conversation was never created in the database
      const fetchedConversations =
        await ConversationResource.listAll(otherUserAuth);
      const foundConversation = fetchedConversations.some(
        (c) => c.sId === testSId
      );
      expect(foundConversation).toBe(false);
    });
  });

  describe("canAccess", () => {
    let adminAuth: Authenticator;
    let userAuth: Authenticator;
    let workspace: LightWorkspaceType;
    let agents: LightAgentConfigurationType[];
    let globalSpace: SpaceResource;
    let restrictedSpace: SpaceResource;
    let conversations: {
      accessible: string;
      restricted: string;
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
        requestedSpaceIds: [globalSpace.id],
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      const restrictedConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [restrictedSpace.id],
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      conversations = {
        accessible: accessibleConvo.sId,
        restricted: restrictedConvo.sId,
      };
    });

    afterEach(async () => {
      await destroyConversation(adminAuth, {
        conversationId: conversations.accessible,
      });
      await destroyConversation(adminAuth, {
        conversationId: conversations.restricted,
      });
    });

    it("should return 'allowed' when user has access to conversation", async () => {
      const result = await ConversationResource.canAccess(
        userAuth,
        conversations.accessible
      );

      expect(result).toBe("allowed");
    });

    it("should return 'conversation_access_restricted' when user does not have access to the space", async () => {
      const result = await ConversationResource.canAccess(
        userAuth,
        conversations.restricted
      );

      expect(result).toBe("conversation_access_restricted");
    });

    it("should return 'conversation_not_found' when conversation does not exist", async () => {
      const result = await ConversationResource.canAccess(
        userAuth,
        "nonexistent-sId"
      );

      expect(result).toBe("conversation_not_found");
    });

    it("should return 'conversation_not_found' when conversation is deleted", async () => {
      // Delete the conversation
      const conversationResource = await ConversationResource.fetchById(
        adminAuth,
        conversations.accessible,
        { includeDeleted: false }
      );
      assert(conversationResource, "Conversation resource not found");
      await conversationResource.updateVisibilityToDeleted();

      const result = await ConversationResource.canAccess(
        userAuth,
        conversations.accessible
      );

      expect(result).toBe("conversation_not_found");
    });

    it("should return 'allowed' when admin has access to restricted space", async () => {
      const result = await ConversationResource.canAccess(
        adminAuth,
        conversations.restricted
      );

      expect(result).toBe("allowed");
    });

    it("should return 'conversation_not_found' when conversation belongs to different workspace", async () => {
      // Create a conversation in a different workspace
      const anotherWorkspace = await WorkspaceFactory.basic();

      // Create the required default groups for the workspace
      await GroupResource.makeDefaultsForWorkspace(anotherWorkspace);

      const anotherUser = await UserFactory.basic();
      await MembershipFactory.associate(anotherWorkspace, anotherUser, {
        role: "admin",
      });
      const anotherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        anotherUser.sId,
        anotherWorkspace.sId
      );

      const anotherAgents = await setupTestAgents(
        anotherWorkspace,
        anotherUser
      );
      const anotherConvo = await ConversationFactory.create(anotherAuth, {
        agentConfigurationId: anotherAgents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      // Try to access the conversation from another workspace with current user auth
      const result = await ConversationResource.canAccess(
        userAuth,
        anotherConvo.sId
      );

      expect(result).toBe("conversation_not_found");

      // Clean up
      await destroyConversation(anotherAuth, {
        conversationId: anotherConvo.sId,
      });
    });

    it("should return 'conversation_not_found' when space is deleted", async () => {
      // Create a new space and conversation
      const tempSpace = await SpaceFactory.regular(workspace);
      const res = await tempSpace.addMembers(adminAuth, {
        userIds: [adminAuth.getNonNullableUser().sId],
      });
      assert(res.isOk(), "Failed to add member to temp space");

      const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminAuth.getNonNullableUser().sId,
        workspace.sId
      );

      const tempConvo = await ConversationFactory.create(refreshedAdminAuth, {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [tempSpace.id],
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      // Verify conversation is accessible before space deletion
      let result = await ConversationResource.canAccess(
        refreshedAdminAuth,
        tempConvo.sId
      );
      expect(result).toBe("allowed");

      // Delete the space
      await tempSpace.delete(refreshedAdminAuth, { hardDelete: false });

      // Now the conversation should return 'conversation_not_found' because space is deleted
      result = await ConversationResource.canAccess(
        refreshedAdminAuth,
        tempConvo.sId
      );
      expect(result).toBe("conversation_not_found");

      // Clean up
      await destroyConversation(refreshedAdminAuth, {
        conversationId: tempConvo.sId,
      });
    });

    it("should handle conversations with multiple space IDs - all spaces must be accessible", async () => {
      // Create a conversation with both global and restricted spaces
      const multiSpaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [globalSpace.id, restrictedSpace.id],
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      // Regular user can access global space but not restricted space
      const userResult = await ConversationResource.canAccess(
        userAuth,
        multiSpaceConvo.sId
      );
      expect(userResult).toBe("conversation_access_restricted");

      // Admin can access both spaces
      const adminResult = await ConversationResource.canAccess(
        adminAuth,
        multiSpaceConvo.sId
      );
      expect(adminResult).toBe("allowed");

      // Clean up
      await destroyConversation(adminAuth, {
        conversationId: multiSpaceConvo.sId,
      });
    });

    it("should return 'allowed' for conversation with no requested spaces", async () => {
      const emptySpaceConvo = await ConversationFactory.create(adminAuth, {
        agentConfigurationId: agents[0].sId,
        requestedSpaceIds: [],
        messagesCreatedAt: [dateFromDaysAgo(5)],
      });

      const result = await ConversationResource.canAccess(
        userAuth,
        emptySpaceConvo.sId
      );

      expect(result).toBe("allowed");

      // Clean up
      await destroyConversation(adminAuth, {
        conversationId: emptySpaceConvo.sId,
      });
    });
  });

  describe("getMessageById", () => {
    let auth: Authenticator;
    let conversation: ConversationWithoutContentType;
    let agents: LightAgentConfigurationType[];
    let conversationIds: string[];

    beforeEach(async () => {
      const workspace = await WorkspaceFactory.basic();
      const user = await UserFactory.basic();
      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      agents = await setupTestAgents(workspace, user);

      conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(5), dateFromDaysAgo(3)],
      });

      conversationIds = [conversation.sId];
    });

    afterEach(async () => {
      for (const sId of conversationIds) {
        await destroyConversation(auth, { conversationId: sId });
      }
    });

    it("should retrieve a user message with the userMessage include", async () => {
      // Get the conversation resource to access getMessageById
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      // Get all messages to find a user message
      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });
      assert(messages.length > 0, "No messages found");

      // Find a user message
      const userMessageRecord = messages.find((m) => m.userMessageId);
      assert(userMessageRecord, "No user message found");

      // Call getMessageById
      const result = await conversationResource.getMessageById(
        auth,
        userMessageRecord.sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const message = result.value;

        // Verify the userMessage include is present and populated
        expect(message.userMessage).toBeDefined();
        expect(message.userMessage).not.toBeNull();
        expect(message.userMessage?.id).toBe(userMessageRecord.userMessageId);
        expect(message.userMessage?.content).toBe("Test user Message.");
      }
    });

    it("should retrieve an agent message with the agentMessage include", async () => {
      // Get the conversation resource to access getMessageById
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      // Get all messages to find an agent message
      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });
      assert(messages.length > 0, "No messages found");

      // Find an agent message
      const agentMessageRecord = messages.find((m) => m.agentMessageId);
      assert(agentMessageRecord, "No agent message found");

      // Call getMessageById
      const result = await conversationResource.getMessageById(
        auth,
        agentMessageRecord.sId
      );

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const message = result.value;

        // Verify the agentMessage include is present and populated
        expect(message.agentMessage).toBeDefined();
        expect(message.agentMessage).not.toBeNull();
        expect(message.agentMessage?.id).toBe(
          agentMessageRecord.agentMessageId
        );
        expect(message.agentMessage?.agentConfigurationId).toBe(agents[0].sId);
      }
    });

    it("should return error when message not found", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      // Try to fetch a non-existent message
      const result = await conversationResource.getMessageById(
        auth,
        "nonexistent"
      );

      expect(result.isOk()).toBe(false);
      if (result.isErr()) {
        expect(result.error.message).toBe("Message not found");
      }
    });

    it("should only retrieve messages from the same conversation", async () => {
      // Create another conversation
      const otherConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[1].sId,
        messagesCreatedAt: [dateFromDaysAgo(2)],
      });
      conversationIds.push(otherConversation.sId);

      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      // Get a message from the other conversation
      const otherMessages = await MessageModel.findAll({
        where: {
          conversationId: (await ConversationResource.fetchById(
            auth,
            otherConversation.sId
          ))!.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });
      assert(otherMessages.length > 0, "No messages in other conversation");

      // Try to retrieve a message from another conversation using the first conversation resource
      const result = await conversationResource.getMessageById(
        auth,
        otherMessages[0].sId
      );

      // Should not find the message from the other conversation
      expect(result.isOk()).toBe(false);
      if (result.isErr()) {
        expect(result.error.message).toBe("Message not found");
      }
    });

    it("should verify includes are not optional (both UserMessage and AgentMessage)", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      // Get all messages
      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      });
      assert(messages.length > 0, "No messages found");

      for (const messageRecord of messages) {
        const result = await conversationResource.getMessageById(
          auth,
          messageRecord.sId
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const message = result.value;

          // Verify the includes object structure is present even if values are null/undefined
          // This ensures the query includes the associations
          if (messageRecord.userMessageId) {
            expect(message.userMessage).toBeDefined();
          } else {
            // Should explicitly be undefined/null, not missing
            expect("userMessage" in message).toBe(true);
          }

          if (messageRecord.agentMessageId) {
            expect(message.agentMessage).toBeDefined();
          } else {
            // Should explicitly be undefined/null, not missing
            expect("agentMessage" in message).toBe(true);
          }
        }
      }
    });

    it("should return a valid Message object with all expected fields", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      // Get the first message
      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        limit: 1,
      });
      assert(messages.length > 0, "No messages found");

      const result = await conversationResource.getMessageById(
        auth,
        messages[0].sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const message = result.value;

        // Verify essential message fields
        expect(message.id).toBeDefined();
        expect(message.sId).toBeDefined();
        expect(message.conversationId).toBe(conversationResource.id);
        expect(message.workspaceId).toBe(auth.getNonNullableWorkspace().id);
        expect(message.createdAt).toBeDefined();
        expect(message.rank).toBeDefined();
      }
    });
  });

  describe("fetchMessagesForPage", () => {
    let auth: Authenticator;
    let conversation: ConversationWithoutContentType;
    let agents: LightAgentConfigurationType[];

    beforeEach(async () => {
      const workspace = await WorkspaceFactory.basic();
      const user = await UserFactory.basic();
      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      agents = await setupTestAgents(workspace, user);

      conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [],
      });
    });

    it("should handle content fragments spanning across pages", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create messages: CF(0), CF(1), CF(2), User(3)
      const [
        contentFragment1,
        contentFragment2,
        contentFragment3,
        userMessage,
      ] = await Promise.all([
        ...Array.from({ length: 3 }, (_, i) =>
          ConversationFactory.createContentFragmentMessage({
            auth,
            workspace,
            conversationId: conversationResource.id,
            rank: i,
            title: `Content Fragment ${i + 1}`,
            fileName: `fragment${i + 1}.txt`,
          })
        ),
        ConversationFactory.createUserMessageWithRank({
          auth,
          workspace,
          conversationId: conversationResource.id,
          rank: 3,
          content: "User message content",
        }),
      ]);

      // Test pagination with page size 2
      // With 3 content fragments + 1 user message, limit 2 should return all 4 messages
      // because content fragments don't count toward limit
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
      });

      // Should get all 4 messages (3 content fragments + 1 user message)
      // hasMore should be false because we only have 1 non-content-fragment message (< limit 2)
      expect(page1.hasMore).toBe(false);
      expect(page1.messages).toHaveLength(4);
      expect(page1.messages[0].rank).toBe(3); // User message
      expect(page1.messages[0].userMessageId).toBe(userMessage.userMessageId);
      expect(page1.messages[1].rank).toBe(2); // Content fragment 3
      expect(page1.messages[1].contentFragmentId).toBe(
        contentFragment3.contentFragmentId
      );
      expect(page1.messages[2].rank).toBe(1); // Content fragment 2
      expect(page1.messages[2].contentFragmentId).toBe(
        contentFragment2.contentFragmentId
      );
      expect(page1.messages[3].rank).toBe(0); // Content fragment 1
      expect(page1.messages[3].contentFragmentId).toBe(
        contentFragment1.contentFragmentId
      );

      // Verify content fragments are properly included
      for (const message of page1.messages) {
        if (message.contentFragmentId) {
          expect(message.contentFragment).toBeDefined();
          expect(message.contentFragment).not.toBeNull();
        }
        if (message.userMessageId) {
          expect(message.userMessage).toBeDefined();
          expect(message.userMessage).not.toBeNull();
        }
      }
    });

    it("should exclude content fragments from limit but include them in results", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create messages: CF(0), CF(1), User(2), Agent(3)
      const [contentFragment1, contentFragment2, userMessage] =
        await Promise.all([
          ConversationFactory.createContentFragmentMessage({
            auth,
            workspace,
            conversationId: conversationResource.id,
            rank: 0,
            title: "Content Fragment 1",
            fileName: "fragment1.txt",
          }),
          ConversationFactory.createContentFragmentMessage({
            auth,
            workspace,
            conversationId: conversationResource.id,
            rank: 1,
            title: "Content Fragment 2",
            fileName: "fragment2.txt",
          }),
          ConversationFactory.createUserMessageWithRank({
            auth,
            workspace,
            conversationId: conversationResource.id,
            rank: 2,
            content: "User message",
          }),
          ConversationFactory.createAgentMessageWithRank({
            workspace,
            conversationId: conversationResource.id,
            rank: 3,
            agentConfigurationId: agents[0].sId,
          }),
        ]);

      // Test with limit 2: should get all 4 messages (2 content fragments + 2 non-content-fragment)
      // because we have exactly 2 non-content-fragment messages (user + agent) which equals limit
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
      });

      expect(page1.hasMore).toBe(false);
      expect(page1.messages).toHaveLength(4);
      expect(page1.messages[0].rank).toBe(3); // Agent message
      expect(page1.messages[0].agentMessageId).toBeDefined();
      expect(page1.messages[1].rank).toBe(2); // User message
      expect(page1.messages[1].userMessageId).toBe(userMessage.userMessageId);
      expect(page1.messages[2].rank).toBe(1); // Content fragment 2
      expect(page1.messages[2].contentFragmentId).toBe(
        contentFragment2.contentFragmentId
      );
      expect(page1.messages[3].rank).toBe(0); // Content fragment 1
      expect(page1.messages[3].contentFragmentId).toBe(
        contentFragment1.contentFragmentId
      );
    });

    it("should respect limit for non-content-fragment messages only", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create 3 user messages (no content fragments)
      await Promise.all(
        [1, 2, 3].map((i, rank) =>
          ConversationFactory.createUserMessageWithRank({
            auth,
            workspace,
            conversationId: conversationResource.id,
            rank,
            content: `User message ${i}`,
          })
        )
      );

      // Test with limit 2: should get only 2 messages (normal pagination behavior)
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
      });

      expect(page1.hasMore).toBe(true);
      expect(page1.messages).toHaveLength(2);
      expect(page1.messages[0].rank).toBe(2); // User message 3
      expect(page1.messages[1].rank).toBe(1); // User message 2
    });

    it("should handle pagination with lastValue correctly when content fragments are present", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create messages in pattern: CF(0), User(1), CF(2), User(3), CF(4), User(5)
      const messageConfigs = [
        { type: "cf" as const, index: 0, rank: 0 },
        { type: "user" as const, content: "User message 1", rank: 1 },
        { type: "cf" as const, index: 1, rank: 2 },
        { type: "user" as const, content: "User message 2", rank: 3 },
        { type: "cf" as const, index: 2, rank: 4 },
        { type: "user" as const, content: "User message 3", rank: 5 },
      ];

      await Promise.all(
        messageConfigs.map((config) =>
          config.type === "cf"
            ? ConversationFactory.createContentFragmentMessage({
                auth,
                workspace,
                conversationId: conversationResource.id,
                rank: config.rank,
                title: `Content Fragment ${config.index + 1}`,
                fileName: `fragment${config.index + 1}.txt`,
              })
            : ConversationFactory.createUserMessageWithRank({
                auth,
                workspace,
                conversationId: conversationResource.id,
                rank: config.rank,
                content: config.content,
              })
        )
      );

      // First page with limit 2: should get user message 3 + content fragment 3 + user message 2 + content fragment 2 + content fragment 1
      // (5 messages total: 2 non-content-fragment messages which equals limit)
      // We include CF(1) because it comes before User(1) in the sequence
      // hasMore should be true because there's 1 more non-content-fragment message (user message 1)
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
      });

      // Verify we have exactly 2 non-content-fragment messages (the limit)
      const nonCfCount1 = page1.messages.filter(
        (m) => m.contentFragmentId === null
      ).length;
      expect(nonCfCount1).toBe(2);
      expect(page1.hasMore).toBe(true); // There's 1 more non-content-fragment message (user message 1)
      expect(page1.messages[0].rank).toBe(5); // User message 3
      expect(page1.messages[1].rank).toBe(4); // Content fragment 3
      expect(page1.messages[2].rank).toBe(3); // User message 2
      // May include additional content fragments depending on batch processing

      // Test pagination with lastRank (starting from rank 2)
      const page2 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
        lastRank: 2, // Start from content fragment 2
      });

      // Should get user message 1 + content fragment 1 (2 messages: 1 non-content-fragment)
      expect(page2.hasMore).toBe(false);
      expect(page2.messages).toHaveLength(2);
      expect(page2.messages[0].rank).toBe(1); // User message 1
      expect(page2.messages[1].rank).toBe(0); // Content fragment 1
    });

    it("should handle pagination when lastRank is a content fragment", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create messages: User(0), CF(1), User(2), CF(3)
      const [userMessage1] = await Promise.all([
        ConversationFactory.createUserMessageWithRank({
          auth,
          workspace,
          conversationId: conversationResource.id,
          rank: 0,
          content: "User message 1",
        }),
        ConversationFactory.createContentFragmentMessage({
          auth,
          workspace,
          conversationId: conversationResource.id,
          rank: 1,
          title: "Content Fragment 1",
          fileName: "fragment1.txt",
        }),
        ConversationFactory.createUserMessageWithRank({
          auth,
          workspace,
          conversationId: conversationResource.id,
          rank: 2,
          content: "User message 2",
        }),
        ConversationFactory.createContentFragmentMessage({
          auth,
          workspace,
          conversationId: conversationResource.id,
          rank: 3,
          title: "Content Fragment 2",
          fileName: "fragment2.txt",
        }),
      ]);

      // First page with limit 1: should get content fragment 2 + user message 2
      // (2 messages total: 1 non-content-fragment message which equals limit)
      // hasMore should be true because there's 1 more non-content-fragment message (user message 1)
      // Note: CF(1) should NOT be included on page 1 as it should be bundled with User(1) on page 2
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 1,
      });

      expect(page1.hasMore).toBe(true); // There's 1 more non-content-fragment message (user message 1)
      expect(page1.messages.length).toEqual(2);
      expect(page1.messages[0].rank).toBe(2); // Content fragment 1
      expect(page1.messages[1].rank).toBe(1); // User message 2
      // Verify we have exactly 1 non-content-fragment message
      const nonCfCount = page1.messages.filter(
        (m) => m.contentFragmentId === null
      ).length;
      expect(nonCfCount).toBe(1);

      // Second page: paginate from content fragment 1 (rank 1)
      const page2 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 1,
        lastRank: 1, // lastRank is a content fragment
      });

      // Should get user message 1 (rank 0)
      expect(page2.hasMore).toBe(false);
      expect(page2.messages).toHaveLength(1);
      expect(page2.messages[0].rank).toBe(0); // User message 1
      expect(page2.messages[0].userMessageId).toBe(userMessage1.userMessageId);
    });

    it("should handle pagination with multiple pages correctly", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create messages in order: CF(0), User(1), CF(2), User(3), CF(4), User(5), CF(6), User(7)
      const messageConfigs = [
        { type: "cf" as const, index: 0, rank: 0 },
        { type: "user" as const, content: "User message 1", rank: 1 },
        { type: "cf" as const, index: 1, rank: 2 },
        { type: "user" as const, content: "User message 2", rank: 3 },
        { type: "cf" as const, index: 2, rank: 4 },
        { type: "user" as const, content: "User message 3", rank: 5 },
        { type: "cf" as const, index: 3, rank: 6 },
        { type: "user" as const, content: "User message 4", rank: 7 },
      ];

      await Promise.all(
        messageConfigs.map((config) =>
          config.type === "cf"
            ? ConversationFactory.createContentFragmentMessage({
                auth,
                workspace,
                conversationId: conversationResource.id,
                rank: config.rank,
                title: `Content Fragment ${config.index + 1}`,
                fileName: `fragment${config.index + 1}.txt`,
              })
            : ConversationFactory.createUserMessageWithRank({
                auth,
                workspace,
                conversationId: conversationResource.id,
                rank: config.rank,
                content: config.content,
              })
        )
      );

      // Page 1 with limit 2: should get User(7), CF(6), User(5), CF(4) (4 messages: 2 non-CF)
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
      });

      expect(page1.hasMore).toBe(true);
      // Verify we have exactly 2 non-content-fragment messages
      const nonCfCount2 = page1.messages.filter(
        (m) => m.contentFragmentId === null
      ).length;
      expect(nonCfCount2).toBe(2);
      expect(page1.messages[0].rank).toBe(7); // User message 4
      expect(page1.messages[1].rank).toBe(6); // Content fragment 4
      expect(page1.messages[2].rank).toBe(5); // User message 3
      // May include additional content fragments depending on batch processing

      // Page 2: paginate from CF(4) - should get remaining messages
      const page2 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
        lastRank: 4,
      });

      // Should get User(3), CF(2), User(1), CF(0) (4 messages: 2 non-CF)
      expect(page2.hasMore).toBe(false);
      const nonCfCount3 = page2.messages.filter(
        (m) => m.contentFragmentId === null
      ).length;
      expect(nonCfCount3).toBe(2);
      expect(page2.messages).toHaveLength(4);
      expect(page2.messages[0].rank).toBe(3); // User message 2
      expect(page2.messages[1].rank).toBe(2); // Content fragment 2
      expect(page2.messages[2].rank).toBe(1); // User message 1
      expect(page2.messages[3].rank).toBe(0); // Content fragment 1
    });

    it("should not include content fragments that come after the last included non-CF message", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource not found");

      const workspace = auth.getNonNullableWorkspace();

      // Create messages in order: CF(0), CF(1), User(2), Agent(3), CF(4), CF(5), User(6)
      const messageConfigs = [
        { type: "cf" as const, index: 0, rank: 0 },
        { type: "cf" as const, index: 1, rank: 1 },
        { type: "user" as const, content: "User message 1", rank: 2 },
        { type: "agent" as const, rank: 3 },
        { type: "cf" as const, index: 2, rank: 4 },
        { type: "cf" as const, index: 3, rank: 5 },
        { type: "user" as const, content: "User message 2", rank: 6 },
      ];

      await Promise.all(
        messageConfigs.map((config) =>
          config.type === "cf"
            ? ConversationFactory.createContentFragmentMessage({
                auth,
                workspace,
                conversationId: conversationResource.id,
                rank: config.rank,
                title: `Content Fragment ${config.index + 1}`,
                fileName: `fragment${config.index + 1}.txt`,
              })
            : config.type === "user"
              ? ConversationFactory.createUserMessageWithRank({
                  auth,
                  workspace,
                  conversationId: conversationResource.id,
                  rank: config.rank,
                  content: config.content,
                })
              : ConversationFactory.createAgentMessageWithRank({
                  workspace,
                  conversationId: conversationResource.id,
                  rank: config.rank,
                  agentConfigurationId: agents[0].sId,
                })
        )
      );

      // So final: User(6), CF(5), CF(4), Agent(3)
      const page1 = await conversationResource.fetchMessagesForPage(auth, {
        limit: 2,
      });

      expect(page1.hasMore).toBe(true);
      // Should have User(6), CF(5), CF(4), Agent(3) - 2 non-CF, 2 CF
      expect(page1.messages.length).toBe(4);
      expect(page1.messages[0].rank).toBe(6); // User message 2
      expect(page1.messages[1].rank).toBe(5); // Content fragment 4
      expect(page1.messages[2].rank).toBe(4); // Content fragment 3
      expect(page1.messages[3].rank).toBe(3); // Agent message

      // Verify CF(1) and CF(0) are NOT included (they come after Agent(3))
      const includedRanks = page1.messages.map((m) => m.rank);
      expect(includedRanks).not.toContain(1);
      expect(includedRanks).not.toContain(0);

      // Verify we have exactly 2 non-content-fragment messages
      const nonCfCount = page1.messages.filter(
        (m) => m.contentFragmentId === null
      ).length;
      expect(nonCfCount).toBe(2);
    });
  });
});

describe("markAsUnreadForOtherParticipants", () => {
  let auth: Authenticator;
  let user1Auth: Authenticator;
  let user2Auth: Authenticator;
  let user3Auth: Authenticator;
  let conversation: ConversationWithoutContentType;
  let agents: LightAgentConfigurationType[];
  let conversationId: string;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    // Ensure default groups exist
    await GroupResource.makeDefaultsForWorkspace(workspace);
    const user = await UserFactory.basic();
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    agents = await setupTestAgents(workspace, user);

    // Create additional users
    const user1 = await UserFactory.basic();
    const user2 = await UserFactory.basic();
    const user3 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user1, { role: "user" });
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    await MembershipFactory.associate(workspace, user3, { role: "user" });

    user1Auth = await Authenticator.fromUserIdAndWorkspaceId(
      user1.sId,
      workspace.sId
    );
    user2Auth = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );
    user3Auth = await Authenticator.fromUserIdAndWorkspaceId(
      user3.sId,
      workspace.sId
    );

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agents[0].sId,
      messagesCreatedAt: [dateFromDaysAgo(5)],
    });
    conversationId = conversation.sId;

    // Add all users as participants
    await ConversationResource.upsertParticipation(user1Auth, {
      conversation,
      action: "posted",
      user: user1Auth.getNonNullableUser().toJSON(),
    });
    await ConversationResource.upsertParticipation(user2Auth, {
      conversation,
      action: "posted",
      user: user2Auth.getNonNullableUser().toJSON(),
    });
    await ConversationResource.upsertParticipation(user3Auth, {
      conversation,
      action: "posted",
      user: user3Auth.getNonNullableUser().toJSON(),
    });
  });

  afterEach(async () => {
    await destroyConversation(auth, { conversationId });
  });

  it("should not update rows that are already unread", async () => {
    const { ConversationParticipantModel } = await import(
      "@app/lib/models/agent/conversation"
    );

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    assert(conversationResource, "Conversation resource not found");

    // Set user1 and user2 to unread: true, user3 to unread: false
    await ConversationParticipantModel.update(
      { unread: true },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user1Auth.getNonNullableUser().id,
        },
      }
    );
    await ConversationParticipantModel.update(
      { unread: true },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user2Auth.getNonNullableUser().id,
        },
      }
    );
    await ConversationParticipantModel.update(
      { unread: false },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user3Auth.getNonNullableUser().id,
        },
      }
    );

    // Get the updatedAt timestamps before calling markAsUnreadForOtherParticipants
    const participant1Before = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user1Auth.getNonNullableUser().id,
      },
    });
    const participant2Before = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user2Auth.getNonNullableUser().id,
      },
    });
    const participant3Before = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user3Auth.getNonNullableUser().id,
      },
    });

    assert(participant1Before, "Participant 1 not found");
    assert(participant2Before, "Participant 2 not found");
    assert(participant3Before, "Participant 3 not found");

    const updatedAt1Before = participant1Before.updatedAt.getTime();
    const updatedAt2Before = participant2Before.updatedAt.getTime();
    const updatedAt3Before = participant3Before.updatedAt.getTime();

    // Wait a bit to ensure updatedAt would change if updated
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Call markAsUnreadForOtherParticipants
    const result = await ConversationResource.markAsUnreadForOtherParticipants(
      auth,
      {
        conversation,
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should only update 1 row (user3, who had unread: false)
      expect(result.value[0]).toBe(1);
    }

    // Verify user1 (already unread: true) was NOT updated
    const participant1After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user1Auth.getNonNullableUser().id,
      },
    });
    assert(participant1After, "Participant 1 not found after update");
    expect(participant1After.unread).toBe(true);
    expect(participant1After.updatedAt.getTime()).toBe(updatedAt1Before);

    // Verify user2 (already unread: true) was NOT updated
    const participant2After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user2Auth.getNonNullableUser().id,
      },
    });
    assert(participant2After, "Participant 2 not found after update");
    expect(participant2After.unread).toBe(true);
    expect(participant2After.updatedAt.getTime()).toBe(updatedAt2Before);

    // Verify user3 (unread: false) WAS updated to unread: true
    const participant3After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user3Auth.getNonNullableUser().id,
      },
    });
    assert(participant3After, "Participant 3 not found after update");
    expect(participant3After.unread).toBe(true);
    expect(participant3After.updatedAt.getTime()).toBeGreaterThan(
      updatedAt3Before
    );
  });

  it("should update only participants with unread: false when excludedUser is provided", async () => {
    const { ConversationParticipantModel } = await import(
      "@app/lib/models/agent/conversation"
    );

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    assert(conversationResource, "Conversation resource not found");

    // Set user1 to unread: true, user2 and user3 to unread: false
    await ConversationParticipantModel.update(
      { unread: true },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user1Auth.getNonNullableUser().id,
        },
      }
    );
    await ConversationParticipantModel.update(
      { unread: false },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user2Auth.getNonNullableUser().id,
        },
      }
    );
    await ConversationParticipantModel.update(
      { unread: false },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: user3Auth.getNonNullableUser().id,
        },
      }
    );

    // Call markAsUnreadForOtherParticipants with excludedUser (user1)
    const result = await ConversationResource.markAsUnreadForOtherParticipants(
      auth,
      {
        conversation,
        excludedUser: user1Auth.getNonNullableUser().toJSON(),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should update 2 rows (user2 and user3, who had unread: false)
      expect(result.value[0]).toBe(2);
    }

    // Verify user1 (excluded) remains unchanged
    const participant1After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user1Auth.getNonNullableUser().id,
      },
    });
    assert(participant1After, "Participant 1 not found after update");
    expect(participant1After.unread).toBe(true);

    // Verify user2 (unread: false, not excluded) was updated
    const participant2After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user2Auth.getNonNullableUser().id,
      },
    });
    assert(participant2After, "Participant 2 not found after update");
    expect(participant2After.unread).toBe(true);

    // Verify user3 (unread: false, not excluded) was updated
    const participant3After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user3Auth.getNonNullableUser().id,
      },
    });
    assert(participant3After, "Participant 3 not found after update");
    expect(participant3After.unread).toBe(true);
  });
});

describe("markAsActionRequired", () => {
  let auth: Authenticator;
  let conversation: ConversationWithoutContentType;
  let agents: LightAgentConfigurationType[];
  let conversationId: string;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    agents = await setupTestAgents(workspace, user);

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agents[0].sId,
      messagesCreatedAt: [dateFromDaysAgo(5)],
    });
    conversationId = conversation.sId;
  });

  afterEach(async () => {
    await destroyConversation(auth, { conversationId });
  });

  it("should set actionRequired to true for the user's participant", async () => {
    const { ConversationParticipantModel } = await import(
      "@app/lib/models/agent/conversation"
    );

    // Create a participant first
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

    // Verify initial state is false
    const participantBefore = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
    });
    assert(participantBefore, "Participant not found");
    expect(participantBefore.actionRequired).toBe(false);

    // Call markAsActionRequired
    const result = await ConversationResource.markAsActionRequired(auth, {
      conversation,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should update 1 row
      expect(result.value[0]).toBe(1);
    }

    // Verify actionRequired is now true
    const participantAfter = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
    });
    assert(participantAfter, "Participant not found after update");
    expect(participantAfter.actionRequired).toBe(true);
  });

  it("should update actionRequired even when it's already true", async () => {
    const { ConversationParticipantModel } = await import(
      "@app/lib/models/agent/conversation"
    );

    // Create a participant with actionRequired already set to true
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    assert(conversationResource, "Conversation resource not found");

    // Manually set actionRequired to true
    await ConversationParticipantModel.update(
      { actionRequired: true },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: auth.getNonNullableWorkspace().id,
          userId: auth.getNonNullableUser().id,
        },
      }
    );

    // Call markAsActionRequired again
    const result = await ConversationResource.markAsActionRequired(auth, {
      conversation,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should still update 1 row (even though value is already true)
      expect(result.value[0]).toBe(1);
    }

    // Verify actionRequired remains true
    const participantAfter = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: auth.getNonNullableUser().id,
      },
    });
    assert(participantAfter, "Participant not found after update");
    expect(participantAfter.actionRequired).toBe(true);
  });

  it("should only update the specific user's participant", async () => {
    const { ConversationParticipantModel } = await import(
      "@app/lib/models/agent/conversation"
    );
    const workspace = auth.getNonNullableWorkspace();

    await GroupResource.makeDefaultsForWorkspace(workspace);

    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    const user2Auth = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );

    // Create participants for both users
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });
    await ConversationResource.upsertParticipation(user2Auth, {
      conversation,
      action: "posted",
      user: user2Auth.getNonNullableUser().toJSON(),
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    assert(conversationResource, "Conversation resource not found");

    // Set user2's actionRequired to false
    await ConversationParticipantModel.update(
      { actionRequired: false },
      {
        where: {
          conversationId: conversationResource.id,
          workspaceId: workspace.id,
          userId: user2Auth.getNonNullableUser().id,
        },
      }
    );

    // Call markAsActionRequired for user1
    const result = await ConversationResource.markAsActionRequired(auth, {
      conversation,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should only update 1 row (user1's participant)
      expect(result.value[0]).toBe(1);
    }

    // Verify user1's actionRequired is true
    const participant1After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: workspace.id,
        userId: auth.getNonNullableUser().id,
      },
    });
    assert(participant1After, "Participant 1 not found");
    expect(participant1After.actionRequired).toBe(true);

    // Verify user2's actionRequired remains false
    const participant2After = await ConversationParticipantModel.findOne({
      where: {
        conversationId: conversationResource.id,
        workspaceId: workspace.id,
        userId: user2Auth.getNonNullableUser().id,
      },
    });
    assert(participant2After, "Participant 2 not found");
    expect(participant2After.actionRequired).toBe(false);
  });

  it("should return 0 updated rows when participant does not exist", async () => {
    // Don't create a participant - call markAsActionRequired directly
    const result = await ConversationResource.markAsActionRequired(auth, {
      conversation,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should update 0 rows since participant doesn't exist
      expect(result.value[0]).toBe(0);
    }
  });
});
