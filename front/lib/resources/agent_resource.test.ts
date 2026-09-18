import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

const AGENT_MODEL_ID = 42;

// A full agent configuration with sensible defaults; override only what a test cares about.
function makeAgentConfiguration(
  overrides: Partial<AgentConfigurationType> = {}
): AgentConfigurationType {
  return {
    id: 1,
    agentModelId: AGENT_MODEL_ID,
    versionCreatedAt: null,
    sId: "custom-agent",
    version: 0,
    versionAuthorId: null,
    instructions: null,
    instructionsHtml: null,
    model: { providerId: "openai", modelId: "gpt-5-mini", temperature: 0.7 },
    status: "active",
    scope: "hidden",
    userFavorite: false,
    name: "Custom agent",
    description: "Custom agent description",
    pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
    maxStepsPerRun: 8,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    canRead: true,
    canEdit: false,
    actions: [],
    ...overrides,
  };
}

describe("AgentResource", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "user" });
  });

  it("builds a custom agent resource from a rendered configuration", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    const resource = AgentResource.fromAgentConfiguration(
      testContext.authenticator,
      agent
    );

    expect(resource.id).not.toBeNull();
    expect(resource.sId).toBe(agent.sId);
    expect(resource.workspaceId).toBe(testContext.workspace.id);
  });

  it("fetches an agent's latest active version by sId and by model id", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    assert(agent.agentModelId !== null);

    const byId = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    const byModelId = await AgentResource.fetchByModelIdWithAuth(
      testContext.authenticator,
      agent.agentModelId
    );

    for (const resource of [byId, byModelId]) {
      expect(resource).not.toBeNull();
      expect(resource?.isFull()).toBe(true);
      expect(resource?.id).toBe(agent.agentModelId);
      expect(resource?.sId).toBe(agent.sId);
      expect(resource?.workspaceId).toBe(testContext.workspace.id);
    }
  });

  it("carries the agent's creation date on full and light resources alike", async () => {
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    // Hidden, so the non-author admin below gets it light.
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope: "hidden" }
    );
    await AgentConfigurationFactory.backdate(
      testContext.authenticator,
      agent.sId,
      createdAt
    );

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, adminUser, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      testContext.workspace.sId
    );

    const asAuthor = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    const asAdmin = await AgentResource.fetchById(adminAuth, agent.sId);

    expect(asAuthor?.isFull()).toBe(true);
    expect(asAuthor?.createdAt.getTime()).toBe(createdAt.getTime());
    expect(asAdmin?.isFull()).toBe(false);
    expect(asAdmin?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("carries the configuration row id on full and light resources alike", async () => {
    // Hidden, so the non-author admin below gets it light.
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope: "hidden" }
    );

    const currentConfiguration = await AgentConfigurationModel.findOne({
      where: {
        sId: agent.sId,
        status: "active",
        workspaceId: testContext.workspace.id,
      },
    });
    assert(currentConfiguration !== null);

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, adminUser, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      testContext.workspace.sId
    );

    const asAuthor = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    const asAdmin = await AgentResource.fetchById(adminAuth, agent.sId);
    const fromConfiguration = AgentResource.fromAgentConfiguration(
      testContext.authenticator,
      agent
    );

    // The tables keyed by that id (skills, tools, tags) are read by callers who cannot read the
    // agent, so the id is core: the light shape carries it just like the full one.
    expect(asAuthor?.isFull()).toBe(true);
    expect(asAuthor?.agentConfigurationModelId).toBe(currentConfiguration.id);
    expect(asAdmin?.isFull()).toBe(false);
    expect(asAdmin?.agentConfigurationModelId).toBe(currentConfiguration.id);
    expect(fromConfiguration.agentConfigurationModelId).toBe(
      currentConfiguration.id
    );
  });

  it("returns a light resource when the caller holds a verb but cannot read the agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope: "hidden" }
    );

    // Admins hold `admin` on hidden agents but not `read`: they can fetch a light resource.
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, adminUser, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      testContext.workspace.sId
    );

    const asAuthor = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    const asAdmin = await AgentResource.fetchById(adminAuth, agent.sId);

    expect(asAuthor?.isFull()).toBe(true);
    expect(asAdmin).not.toBeNull();
    expect(asAdmin?.isFull()).toBe(false);
    expect(asAdmin?.sId).toBe(agent.sId);
  });

  it("drops the agent from fetchers when the caller holds no verb on it", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope: "hidden" }
    );
    assert(agent.agentModelId !== null);

    // A plain member holds no verb on a hidden agent, so the `canFetch` gate drops it.
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    expect(await AgentResource.fetchById(otherAuth, agent.sId)).toBeNull();
    expect(
      await AgentResource.fetchByModelIdWithAuth(otherAuth, agent.agentModelId)
    ).toBeNull();
    expect(await AgentResource.fetchByIds(otherAuth, [agent.sId])).toEqual([]);
  });

  it("resolves an archived agent to its latest version", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    assert(agent.agentModelId !== null);

    await archiveAgentConfiguration(testContext.authenticator, agent.sId);

    const byId = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    const byModelId = await AgentResource.fetchByModelIdWithAuth(
      testContext.authenticator,
      agent.agentModelId
    );

    for (const resource of [byId, byModelId]) {
      expect(resource).not.toBeNull();
      expect(resource?.id).toBe(agent.agentModelId);
      expect(resource?.sId).toBe(agent.sId);
      expect(resource?.status).toBe("archived");
    }
  });

  it("resolves the version the currentVersion pointer designates, ignoring stray higher rows", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    assert(agent.agentModelId !== null);

    const currentConfig = await AgentConfigurationModel.findOne({
      where: {
        sId: agent.sId,
        status: "active",
        workspaceId: testContext.workspace.id,
      },
    });
    assert(currentConfig !== null);

    // Insert a higher-version row without advancing `currentVersion` (e.g. a leftover builder "try"
    // draft). The resolver joins on `currentVersion`, so it follows the pointer and ignores this row.
    const { id: _id, ...currentAttributes } = currentConfig.get();
    await AgentConfigurationModel.create({
      ...currentAttributes,
      version: currentConfig.version + 1,
      status: "draft",
    });

    const resource = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );

    expect(resource).not.toBeNull();
    expect(resource?.id).toBe(agent.agentModelId);
    expect(resource?.status).toBe("active");
    expect(resource?.content.version).toBe(currentConfig.version);
  });

  it("returns one resource per agent when fetching in batches", async () => {
    const firstAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "First agent" }
    );
    const secondAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Second agent" }
    );
    assert(firstAgent.agentModelId !== null);
    assert(secondAgent.agentModelId !== null);

    const byIds = await AgentResource.fetchByIds(testContext.authenticator, [
      firstAgent.sId,
      secondAgent.sId,
    ]);
    const byModelIds = await AgentResource.fetchByModelIds(
      testContext.authenticator,
      [firstAgent.agentModelId, secondAgent.agentModelId]
    );

    expect(byIds.map((resource) => resource.sId).sort()).toEqual(
      [firstAgent.sId, secondAgent.sId].sort()
    );
    expect(byModelIds.map((resource) => resource.id).sort()).toEqual(
      [firstAgent.agentModelId, secondAgent.agentModelId].sort()
    );
  });

  it("lists agent editors from grants individually and in batches", async () => {
    const firstAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "First agent" }
    );
    const secondAgent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Second agent" }
    );
    const resources = AgentResource.fromAgentConfigurations(
      testContext.authenticator,
      [firstAgent, secondAgent]
    );

    const firstEditors = await resources[0].listEditors(
      testContext.authenticator
    );
    const editorsByAgentId = await AgentResource.batchListEditors(
      testContext.authenticator,
      resources
    );

    expect(firstEditors?.map((editor) => editor.id)).toEqual([
      testContext.user.id,
    ]);
    expect(
      editorsByAgentId.get(firstAgent.sId)?.map((editor) => editor.id)
    ).toEqual([testContext.user.id]);
    expect(
      editorsByAgentId.get(secondAgent.sId)?.map((editor) => editor.id)
    ).toEqual([testContext.user.id]);
  });

  it("applies author, admin, and editor permissions to custom agents", async () => {
    const resource = AgentResource.fromAgentConfiguration(
      testContext.authenticator,
      makeAgentConfiguration({ versionAuthorId: testContext.user.id })
    );

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, admin, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      testContext.workspace.sId
    );

    expect(resource.id).toBe(AGENT_MODEL_ID);
    expect([
      testContext.authenticator.hasPermission("read", resource),
      testContext.authenticator.hasPermission("write", resource),
      testContext.authenticator.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([false, false, false]);
    expect([
      adminAuth.hasPermission("read", resource),
      adminAuth.hasPermission("write", resource),
      adminAuth.hasPermission("admin", resource),
    ]).toEqual([false, false, true]);

    const grantResult = await GroupPermissionResource.grantToUser(
      testContext.authenticator,
      {
        user: otherUser.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId: AGENT_MODEL_ID,
      }
    );
    expect(grantResult.isOk()).toBe(true);
    await otherAuth.refresh();

    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
  });

  it.each([
    "admin",
    "builder",
  ] as const)("applies the %s API-key write policy only to workspace custom agents", async (role) => {
    const { auth } = await createPublicApiMockRequest({ role });
    const configuration = makeAgentConfiguration({
      versionAuthorId: testContext.user.id,
    });

    expect(
      auth.can(
        "read",
        AgentResource.fromAgentConfiguration(auth, configuration)
      )
    ).toBe(false);
    expect(
      auth.can(
        "read",
        AgentResource.fromAgentConfiguration(auth, {
          ...configuration,
          scope: "visible",
        })
      )
    ).toBe(true);

    expect(
      auth.can(
        "write",
        AgentResource.fromAgentConfiguration(auth, configuration)
      )
    ).toBe(role === "admin");
    expect(
      auth.can(
        "write",
        AgentResource.fromAgentConfiguration(
          testContext.authenticator,
          configuration
        )
      )
    ).toBe(false);
    expect(
      auth.can(
        "write",
        AgentResource.fromGlobalAgent(
          auth,
          makeAgentConfiguration({
            sId: GLOBAL_AGENTS_SID.HELPER,
            scope: "global",
            agentModelId: null,
            name: "Helper",
            description: "Helper description",
          })
        )
      )
    ).toBe(false);
  });

  it("lets workspace members read visible agents without editing them", async () => {
    const resource = AgentResource.fromAgentConfiguration(
      testContext.authenticator,
      makeAgentConfiguration({
        scope: "visible",
        versionAuthorId: testContext.user.id,
      })
    );

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    expect(otherAuth.hasPermission("read", resource)).toBe(true);
    expect(otherAuth.hasPermission("write", resource)).toBe(false);
    expect(otherAuth.hasPermission("admin", resource)).toBe(false);
  });

  it("hides an agent whose requested space the caller cannot read", async () => {
    const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope: "visible", requestedSpaceIds: [restrictedSpace.id] }
    );

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    // A visible agent is normally readable by every member, but this one is backed by a space the
    // member cannot read. `read` is the member's only verb on it, so denying `read` leaves no verb
    // at all and the `canFetch` gate drops the agent (see `fetch-latest-active-version`).
    expect(await AgentResource.fetchById(otherAuth, agent.sId)).toBeNull();

    // An admin keeps the `admin` verb whatever the space restriction, so the agent is still
    // returned — but as a light resource, since the space gate denied `read` and `_content` is
    // materialized only for readers.
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, adminUser, {
      role: "admin",
    });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      testContext.workspace.sId
    );
    const adminResource = await AgentResource.fetchById(adminAuth, agent.sId);
    expect(adminResource).not.toBeNull();
    expect(adminResource?.isFull()).toBe(false);
  });

  it("resolves an agent to full when all its requested spaces are readable", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      // The global space is readable by every workspace member.
      { scope: "visible", requestedSpaceIds: [testContext.globalSpace.id] }
    );

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    const resource = await AgentResource.fetchById(otherAuth, agent.sId);
    expect(resource?.isFull()).toBe(true);
  });

  it("gates read for system keys by their actual space access, not `isSystemKey()`", async () => {
    const {
      auth: fullKeyAuth,
      workspace,
      globalGroup,
      key,
    } = await createPublicApiMockRequest({ systemKey: true });
    const restrictedSpace = await SpaceFactory.regular(workspace);

    const author = await UserFactory.basic();
    await MembershipFactory.associate(workspace, author, { role: "admin" });
    const authorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      author.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(authorAuth, {
      scope: "visible",
      requestedSpaceIds: [restrictedSpace.id],
    });

    // A full system key reads every space via its wildcard grant.
    const asFullKey = await AgentResource.fetchById(fullKeyAuth, agent.sId);
    expect(asFullKey?.isFull()).toBe(true);

    // A system key downscoped to the global group only keeps `isSystemKey()` but resolves just those
    // groups' permissions, so the restricted space is unreadable and the agent is not readable.
    const downscopedAuth = await Authenticator.fromKey(key, workspace.sId, [
      globalGroup.sId,
    ]);
    expect(downscopedAuth.isSystemKey()).toBe(true);
    const asDownscoped = await AgentResource.fetchById(
      downscopedAuth,
      agent.sId
    );
    expect(asDownscoped?.isFull()).toBe(false);
  });

  it("keeps code-defined global agents read-only and audience-scoped", async () => {
    const helper = AgentResource.fromGlobalAgent(
      testContext.authenticator,
      makeAgentConfiguration({
        sId: GLOBAL_AGENTS_SID.HELPER,
        scope: "global",
        agentModelId: null,
        name: "Helper",
        description: "Helper description",
      })
    );
    const analyst = AgentResource.fromGlobalAgent(
      testContext.authenticator,
      makeAgentConfiguration({
        sId: GLOBAL_AGENTS_SID.ANALYST,
        scope: "global",
        agentModelId: null,
        name: "Analyst",
        description: "Analyst description",
      })
    );

    const manager = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, manager, {
      role: "manager",
    });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      testContext.workspace.sId
    );

    expect(testContext.authenticator.hasPermission("read", helper)).toBe(true);
    expect(testContext.authenticator.hasPermission("write", helper)).toBe(
      false
    );
    expect(testContext.authenticator.hasPermission("admin", helper)).toBe(
      false
    );
    expect(testContext.authenticator.hasPermission("read", analyst)).toBe(
      false
    );
    expect(managerAuth.hasPermission("read", analyst)).toBe(true);
    expect(managerAuth.hasPermission("write", analyst)).toBe(false);
    expect(managerAuth.hasPermission("admin", analyst)).toBe(false);
    expect(await helper.listEditors(testContext.authenticator)).toBeNull();
  });
  describe("toSearchDocument", () => {
    it("serializes a custom agent with the caller-supplied counts and ids", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Indexed", description: "Indexed description", scope: "hidden" }
      );
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        agent.sId
      );
      assert(resource);

      const document = resource.toSearchDocument(testContext.authenticator, {
        activeUsersCount: null,
        editors: [testContext.user, testContext.user],
        favoriteCount: 4,
        feedbackNegativeCount: 1,
        feedbackPositiveCount: 9,
        lastEditedByUser: testContext.user,
        mcpServerViewIds: ["view-b", "view-a"],
        skillIds: ["skill-b", "skill-a", "skill-b"],
        tagIds: ["tag-a"],
      });

      expect(document).toEqual({
        workspace_id: testContext.workspace.sId,
        agent_id: agent.sId,
        status: "active",
        scope: "hidden",
        name: "Indexed",
        description: "Indexed description",
        picture_url: agent.pictureUrl,
        last_edited_by_user_id: testContext.user.sId,
        editor_ids: [testContext.user.sId],
        requested_space_ids: [],
        created_at: resource.createdAt.toISOString(),
        updated_at: resource.updatedAt.toISOString(),
        skill_ids: ["skill-a", "skill-b"],
        mcp_server_view_ids: ["view-a", "view-b"],
        tag_ids: ["tag-a"],
        feedback_positive_count: 9,
        feedback_negative_count: 1,
        active_users_count: null,
        favorite_count: 4,
      });
    });

    it("serializes a global agent without workspace-specific metadata", async () => {
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        GLOBAL_AGENTS_SID.HELPER
      );
      assert(resource);

      const document = resource.toSearchDocument(testContext.authenticator, {
        activeUsersCount: 4,
        editors: [testContext.user],
        favoriteCount: 2,
        feedbackNegativeCount: 1,
        feedbackPositiveCount: 9,
        lastEditedByUser: testContext.user,
        mcpServerViewIds: ["view-a"],
        skillIds: ["skill-b", "skill-a"],
        tagIds: ["tag-a"],
      });

      expect(document).toEqual({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.HELPER,
        status: "active",
        scope: "global",
        name: resource.name,
        description: resource.description,
        picture_url: resource.pictureUrl,
        last_edited_by_user_id: null,
        editor_ids: [],
        requested_space_ids: [],
        created_at: null,
        updated_at: null,
        skill_ids: ["skill-a", "skill-b"],
        mcp_server_view_ids: [],
        tag_ids: [],
        feedback_positive_count: 0,
        feedback_negative_count: 0,
        active_users_count: null,
        favorite_count: 0,
      });
    });
  });

  describe("listSkills", () => {
    it("lists the skills linked to the agent's current configuration", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Agent With Skills" }
      );
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Linked Skill",
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });

      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        agent.sId
      );
      assert(resource);
      // The `agents` row id and the `agent_configurations` row id are distinct: listing skills off
      // the former would silently return nothing.
      expect(resource.id).not.toEqual(resource.agentConfigurationModelId);

      const skills = await resource.listSkills(testContext.authenticator);

      expect(skills.map((s) => s.id)).toEqual([skill.id]);
    });

    it("refuses to list the skills of a global agent", async () => {
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        GLOBAL_AGENTS_SID.HELPER
      );
      assert(resource);

      await expect(
        resource.listSkills(testContext.authenticator)
      ).rejects.toThrow(
        "Unexpected: `listSkills` called on a global AgentResource"
      );
    });
  });
});
