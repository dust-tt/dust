import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentStatus,
} from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import assert from "assert";
import type { JSONSchema7 } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/assistant/global_agents/global_agents",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/assistant/global_agents/global_agents")
      >();
    return { ...actual, getGlobalAgents: vi.fn(actual.getGlobalAgents) };
  }
);

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

  // Builds a real custom agent authored by `testContext` and forces its current version into the
  // requested `status` so the permission derivation can be exercised for states the normal save path
  // never persists (e.g. a "visible" draft). The resource is fetched as the author, who can always
  // fetch it (via the editor grant, or draft ownership for a draft).
  async function buildAgentInState({
    scope,
    status,
    name,
  }: {
    scope: Exclude<AgentConfigurationScope, "global">;
    status: AgentStatus;
    name?: string;
  }): Promise<{ agent: AgentConfigurationType; resource: AgentResource }> {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope, ...(name ? { name } : {}) }
    );
    if (status !== "active") {
      const where = {
        sId: agent.sId,
        workspaceId: testContext.workspace.id,
      };
      await AgentConfigurationModel.update({ status }, { where });
      await AgentModel.update({ status }, { where });
      await AgentResource.invalidateCache(testContext.workspace.id, agent.sId);
    }
    const resource = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(resource !== null);
    return { agent, resource };
  }

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
      expect(resource?.canViewContent).toBe(true);
      expect(resource?.id).toBe(agent.agentModelId);
      expect(resource?.sId).toBe(agent.sId);
      expect(resource?.workspaceId).toBe(testContext.workspace.id);
    }
  });

  it("carries the agent's creation date whether or not the caller can view the content", async () => {
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    // Hidden, so the non-author admin below cannot view its content.
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

    expect(asAuthor?.canViewContent).toBe(true);
    expect(asAuthor?.createdAt.getTime()).toBe(createdAt.getTime());
    expect(asAdmin?.canViewContent).toBe(false);
    expect(asAdmin?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("carries the configuration row id whether or not the caller can view the content", async () => {
    // Hidden, so the non-author admin below cannot view its content.
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

    // The tables keyed by that id (skills, tools, tags) are read by callers who cannot read the
    // agent, so the id is core: it is carried whether or not the caller can view the content.
    expect(asAuthor?.canViewContent).toBe(true);
    expect(asAuthor?.agentConfigurationModelId).toBe(currentConfiguration.id);
    expect(asAdmin?.canViewContent).toBe(false);
    expect(asAdmin?.agentConfigurationModelId).toBe(currentConfiguration.id);
  });

  it("carries the head fields whether or not the caller can view the content", async () => {
    // Hidden, so the non-author admin below cannot view its content.
    const template = await TemplateFactory.published();
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      {
        name: "Head fields",
        scope: "hidden",
        templateId: template.sId,
        reinforcement: "off",
      }
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
    assert(asAuthor && asAdmin);

    expect(asAuthor.canViewContent).toBe(true);
    expect(asAdmin.canViewContent).toBe(false);
    for (const resource of [asAuthor, asAdmin]) {
      expect({
        name: resource.name,
        status: resource.status,
        scope: resource.scope,
        templateId: resource.templateId,
        reinforcement: resource.reinforcement,
        lastReinforcementAnalysisAt: resource.lastReinforcementAnalysisAt,
      }).toEqual({
        name: "Head fields",
        status: "active",
        scope: "hidden",
        templateId: template.id,
        reinforcement: "off",
        lastReinforcementAnalysisAt: null,
      });
    }
  });

  it("returns the agent without its content when the caller holds a verb but cannot read it", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { scope: "hidden" }
    );

    // Admins hold `admin` on hidden agents but not `read`: they fetch it without viewing its content.
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

    expect(asAuthor?.canViewContent).toBe(true);
    expect(asAdmin).not.toBeNull();
    expect(asAdmin?.canViewContent).toBe(false);
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

  it.each(["admin", "manager"] as const)(
    "lets the %s role list every custom agent without reading the ones it cannot read",
    async (role) => {
      const hiddenAgent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Hidden agent", scope: "hidden" }
      );
      const restrictedSpace = await SpaceFactory.regular(testContext.workspace);
      const restrictedAgent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        {
          name: "Restricted agent",
          scope: "visible",
          requestedSpaceIds: [restrictedSpace.id],
        }
      );

      const user = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, user, { role });
      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        testContext.workspace.sId
      );

      const resources = await AgentResource.fetchByIds(auth, [
        hiddenAgent.sId,
        restrictedAgent.sId,
      ]);

      expect(resources.map((resource) => resource.sId)).toEqual([
        hiddenAgent.sId,
        restrictedAgent.sId,
      ]);
      for (const resource of resources) {
        expect(auth.can("list", resource)).toBe(true);
        expect(auth.can("read", resource)).toBe(false);
        expect(auth.can("write", resource)).toBe(false);
        expect(resource.canViewContent).toBe(false);
      }
    }
  );

  it("grants list to a member who can read the agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Visible agent", scope: "visible" }
    );

    const member = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, member, {
      role: "user",
    });
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      testContext.workspace.sId
    );

    const resource = await AgentResource.fetchById(memberAuth, agent.sId);
    assert(resource);
    expect(memberAuth.can("read", resource)).toBe(true);
    expect(memberAuth.can("list", resource)).toBe(true);
  });

  it("lists no editors for a manager who cannot read the agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Hidden agent", scope: "hidden" }
    );

    const manager = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, manager, {
      role: "manager",
    });
    const managerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      manager.sId,
      testContext.workspace.sId
    );

    const resource = await AgentResource.fetchById(managerAuth, agent.sId);
    assert(resource);
    expect(await resource.listEditors(managerAuth)).toEqual([]);
    expect(
      (await resource.listEditors(testContext.authenticator))?.map(
        (editor) => editor.id
      )
    ).toEqual([testContext.user.id]);
  });

  it("resolves an archived agent to its latest version", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    assert(agent.agentModelId !== null);

    await (await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    ))!.archive(testContext.authenticator);

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
    expect(resource?.version).toBe(currentConfig.version);
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

  it("serializes and restores a resource without loss", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    const resource = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(resource?.canViewContent);

    const restored = AgentResource.fromSnapshot(resource.toSnapshot());

    // The restored resource is indistinguishable from the one it was serialized from.
    expect(restored.canViewContent).toBe(true);
    expect(await restored.fetchInstructions()).toEqual(
      await resource.fetchInstructions()
    );
    expect(restored.toSnapshot()).toEqual(resource.toSnapshot());
  });

  it("round-trips the agent createdAt distinct from the version createdAt", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    assert(agent.agentModelId !== null);

    // Set only the `agents` row's `createdAt` (not the configuration's), the way the backfill can —
    // so the agent's identity date differs from the version's date.
    const agentCreatedAt = new Date("2020-02-02T00:00:00.000Z");
    await AgentModel.update(
      { createdAt: agentCreatedAt },
      {
        where: {
          id: agent.agentModelId,
          workspaceId: testContext.workspace.id,
        },
      }
    );

    const resource = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(resource?.canViewContent);

    // The snapshot round-trip must keep the agent row's `createdAt`, not fall back to the version's.
    expect(resource.createdAt.getTime()).toBe(agentCreatedAt.getTime());
    expect(resource.versionCreatedAt.getTime()).not.toBe(
      agentCreatedAt.getTime()
    );
  });

  it("keeps the cached snapshot in sync with the configuration model", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    const resource = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(resource?.canViewContent);
    const snapshot = resource.toSnapshot();

    // Every `AgentConfigurationModel` column is folded into the resource's identity/core/version
    // metadata, explicitly excluded, or content — which is never cached (see
    // `agent-instructions-on-demand`). When this fails the model changed shape: reconcile the snapshot
    // and bump `AGENT_RESOURCE_CACHE_VERSION`.
    const foldedIntoIdentityOrCore = new Set([
      // Carried as the core `agentConfigurationModelId`, not `content`.
      "id",
      "agentId",
      "workspaceId",
      "sId",
      "scope",
      "name",
      "description",
      "status",
      "pictureUrl",
      "templateId",
      "reinforcement",
      "lastReinforcementAnalysisAt",
      "authorId",
      "requestedSpaceIds",
      // Carried by the core `modelConfiguration`, not `content`.
      "providerId",
      "modelId",
      "temperature",
      "reasoningEffort",
      "responseFormat",
      // Carried by the core version metadata, not `content`.
      "version",
      "maxStepsPerRun",
      "creditSpendCheckpointThresholdAwuCredits",
      "createdAt",
      "updatedAt",
    ]);
    // Deliberately not carried by `AgentResource` (deprecated/unused column).
    const excludedColumns = new Set(["visualizationEnabled"]);
    const expectedContentColumns = Object.keys(
      AgentConfigurationModel.getAttributes()
    )
      .filter(
        (column) =>
          !foldedIntoIdentityOrCore.has(column) && !excludedColumns.has(column)
      )
      .sort();
    expect(expectedContentColumns).toEqual([
      "instructions",
      "instructionsHtml",
    ]);
    expect(Object.keys(snapshot)).not.toContain("content");
  });

  it("serves the same content through single and batch reads", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    // The first read warms the cache; the single and batch reads then share its entry.
    await AgentResource.fetchById(testContext.authenticator, agent.sId);
    const cached = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    const [fromDatabase] = await AgentResource.fetchByIds(
      testContext.authenticator,
      [agent.sId]
    );

    assert(cached?.canViewContent);
    assert(fromDatabase?.canViewContent);
    expect(cached.toSnapshot()).toEqual(fromDatabase.toSnapshot());
  });

  it("loads custom agents together and preserves input order across globals and missing IDs", async () => {
    const first = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "First batch agent" }
    );
    const second = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Second batch agent" }
    );
    const findAll = vi.spyOn(AgentModel, "findAll");
    try {
      const resources = await AgentResource.fetchByIds(
        testContext.authenticator,
        [
          second.sId,
          GLOBAL_AGENTS_SID.HELPER,
          "missing-agent",
          first.sId,
          second.sId,
        ]
      );
      expect(resources.map((r) => r.sId)).toEqual([
        second.sId,
        GLOBAL_AGENTS_SID.HELPER,
        first.sId,
      ]);
      expect(findAll).toHaveBeenCalledTimes(1);
      expect(findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sId: [second.sId, "missing-agent", first.sId],
            workspaceId: testContext.workspace.id,
          },
        })
      );
    } finally {
      findAll.mockRestore();
    }
  });

  it("reflects a fresh archive on the next read", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );

    // Populate the cache with the active version.
    const active = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(active?.canViewContent);
    expect(active.status).toBe("active");

    await (await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    ))!.archive(testContext.authenticator);

    // The agent still resolves (its latest version, now archived); invalidation keeps the read fresh.
    const archived = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(archived?.canViewContent);
    expect(archived.status).toBe("archived");
  });

  it("resolves a global agent by id through the uncached global path", async () => {
    // Global agents have no configuration rows and are never cached; `fetchById` resolves them via
    // the global path (`fetchGlobalAgents`), not the cache.
    const resource = await AgentResource.fetchById(
      testContext.authenticator,
      GLOBAL_AGENTS_SID.HELPER
    );

    expect(resource).not.toBeNull();
    expect(resource?.sId).toBe(GLOBAL_AGENTS_SID.HELPER);
    expect(resource?.scope).toBe("global");
  });

  it("caches the highest version after a new version is created", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator,
      { name: "Versioned agent", description: "v0" }
    );

    // Populate the cache with the first version.
    const v0 = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(v0?.canViewContent);
    expect(v0.description).toBe("v0");

    // A new active version supersedes it; createAgentConfiguration invalidates the cache.
    await AgentConfigurationFactory.updateTestAgent(
      testContext.authenticator,
      agent.sId,
      { name: "Versioned agent", description: "v1" }
    );

    const latest = await AgentResource.fetchById(
      testContext.authenticator,
      agent.sId
    );
    assert(latest?.canViewContent);
    expect(latest.description).toBe("v1");
    expect(latest.version).toBeGreaterThan(v0.version);
  });

  it("does not serve an agent to a caller from another workspace", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(
      testContext.authenticator
    );
    // Populate the cache from the owning workspace.
    await AgentResource.fetchById(testContext.authenticator, agent.sId);

    const otherContext = await createResourceTest({ role: "admin" });
    const otherAgent = await AgentConfigurationFactory.createTestAgent(
      otherContext.authenticator
    );

    expect(
      await AgentResource.fetchById(otherContext.authenticator, agent.sId)
    ).toBeNull();
    const resources = await AgentResource.fetchByIds(
      otherContext.authenticator,
      [agent.sId, otherAgent.sId]
    );
    expect(resources.map((resource) => resource.sId)).toEqual([otherAgent.sId]);
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
    const resources = await AgentResource.fetchByIds(
      testContext.authenticator,
      [firstAgent.sId, secondAgent.sId]
    );

    const firstEditors = await resources[0].listEditors(
      testContext.authenticator
    );
    const editorsByAgent = await AgentResource.batchListEditors(
      testContext.authenticator,
      resources
    );

    expect(firstEditors?.map((editor) => editor.id)).toEqual([
      testContext.user.id,
    ]);
    expect(
      resources.map((resource) =>
        editorsByAgent.get(resource)?.map((editor) => editor.id)
      )
    ).toEqual([[testContext.user.id], [testContext.user.id]]);
  });

  it("applies admin and editor permissions to active custom agents", async () => {
    const { agent, resource } = await buildAgentInState({
      scope: "hidden",
      status: "active",
    });
    assert(agent.agentModelId !== null);

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

    expect(resource.id).toBe(agent.agentModelId);
    // The author holds the editor grant created alongside the agent.
    expect([
      testContext.authenticator.hasPermission("read", resource),
      testContext.authenticator.hasPermission("write", resource),
      testContext.authenticator.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
    // A workspace member without a grant has no access to a hidden agent.
    expect([
      otherAuth.hasPermission("read", resource),
      otherAuth.hasPermission("write", resource),
      otherAuth.hasPermission("admin", resource),
    ]).toEqual([false, false, false]);
    // Admins manage a hidden agent (admin) but do not read it without a grant.
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
        resourceId: agent.agentModelId,
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

  it("grants draft ownership to the current author", async () => {
    const { agent, resource } = await buildAgentInState({
      scope: "hidden",
      status: "draft",
    });
    assert(agent.agentModelId !== null);

    // Revoke the editor grant so the author's access can come only from draft ownership.
    const revokeResult = await GroupPermissionResource.revokeFromUser(
      testContext.authenticator,
      {
        user: testContext.user.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId: agent.agentModelId,
      }
    );
    expect(revokeResult.isOk()).toBe(true);
    await testContext.authenticator.refresh();

    expect([
      testContext.authenticator.hasPermission("read", resource),
      testContext.authenticator.hasPermission("write", resource),
      testContext.authenticator.hasPermission("admin", resource),
    ]).toEqual([true, true, true]);
  });

  it.each(["admin", "user"] as const)(
    "applies the %s API-key write policy only to workspace custom agents",
    async (role) => {
      const { resource: hiddenResource } = await buildAgentInState({
        scope: "hidden",
        status: "active",
        name: "Hidden agent",
      });
      const { resource: visibleResource } = await buildAgentInState({
        scope: "visible",
        status: "active",
        name: "Visible agent",
      });

      const key =
        role === "admin"
          ? await KeyFactory.admin(testContext.globalGroup)
          : await KeyFactory.regular(testContext.globalGroup);
      const auth = await Authenticator.fromKey(key, testContext.workspace.sId);

      // A regular member session without a grant is the write-denied baseline below.
      const member = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, member, {
        role: "user",
      });
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        member.sId,
        testContext.workspace.sId
      );

      // API keys never read hidden agents, but read every visible one.
      expect(auth.can("read", hiddenResource)).toBe(false);
      expect(auth.can("read", visibleResource)).toBe(true);

      // Only an admin API key may write workspace custom agents; a member session never can.
      expect(auth.can("write", hiddenResource)).toBe(role === "admin");
      expect(memberAuth.can("write", hiddenResource)).toBe(false);

      // The write policy applies only to workspace custom agents, never to global agents.
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
    }
  );

  it("lets workspace members read visible agents without editing them", async () => {
    const { resource } = await buildAgentInState({
      scope: "visible",
      status: "active",
    });

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

  it.each(["draft", "pending"] as const)(
    "does not grant workspace read to a visible %s agent",
    async (status) => {
      const { resource } = await buildAgentInState({
        scope: "visible",
        status,
      });
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        testContext.workspace.sId
      );

      expect(otherAuth.hasPermission("read", resource)).toBe(false);
    }
  );

  it("keeps visible archived versions workspace-readable", async () => {
    const { resource } = await buildAgentInState({
      scope: "visible",
      status: "archived",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(testContext.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      testContext.workspace.sId
    );

    expect(otherAuth.hasPermission("read", resource)).toBe(true);
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
    // returned — but without its content, since the space gate denied `read` and only readers
    // can view it.
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
    expect(adminResource?.canViewContent).toBe(false);
  });

  it("lets the caller view an agent's content when all its requested spaces are readable", async () => {
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
    expect(resource?.canViewContent).toBe(true);
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
    expect(asFullKey?.canViewContent).toBe(true);

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
    expect(asDownscoped?.canViewContent).toBe(false);
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
        model: {
          provider_id: "openai",
          model_id: "gpt-5-mini",
          reasoning_effort: "medium",
        },
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

    it("serializes a model stream at its default reasoning effort", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { model: { providerId: "auto", modelId: "auto" } }
      );
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        agent.sId
      );
      assert(resource);

      const document = resource.toSearchDocument(testContext.authenticator, {
        activeUsersCount: null,
        editors: [],
        favoriteCount: 0,
        feedbackNegativeCount: 0,
        feedbackPositiveCount: 0,
        lastEditedByUser: null,
        mcpServerViewIds: [],
        skillIds: [],
        tagIds: [],
      });

      expect(document.model).toEqual({
        provider_id: "auto",
        model_id: "auto",
        reasoning_effort: "none",
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
        model: {
          provider_id: resource.modelConfiguration.providerId,
          model_id: resource.modelConfiguration.modelId,
          reasoning_effort: expect.any(String),
        },
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

    it("lists the code-defined skills a global agent declares", async () => {
      const resource = AgentResource.fromGlobalAgent(
        testContext.authenticator,
        makeAgentConfiguration({
          sId: GLOBAL_AGENTS_SID.HELPER,
          scope: "global",
          agentModelId: null,
          name: "Helper",
          description: "Helper description",
          codeDefinedSkillIds: ["support", "frames"],
        })
      );

      const skills = await resource.listSkills(testContext.authenticator);

      expect(skills.map((s) => s.sId).sort()).toEqual(["frames", "support"]);
    });

    it("carries the code-defined skills a fetched global agent declares", async () => {
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        GLOBAL_AGENTS_SID.HELPER
      );
      assert(resource);

      const skills = await resource.listSkills(testContext.authenticator);

      expect(skills.map((s) => s.sId)).toEqual(["frames"]);
    });
  });

  describe("batchCountFavorites", () => {
    it("counts each agent's favorites, with zero for agents nobody favorites", async () => {
      const { authenticator, workspace } = testContext;
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );
      const [popular, unfavorited, ignored] = await Promise.all(
        ["Popular", "Unfavorited", "Ignored"].map(async (name) => {
          const agent = await AgentConfigurationFactory.createTestAgent(
            authenticator,
            { name, scope: "visible" }
          );
          const resource = await AgentResource.fetchById(
            authenticator,
            agent.sId
          );
          assert(resource);
          return resource;
        })
      );
      for (const [auth, agent, favorite] of [
        [authenticator, popular, true],
        [otherAuth, popular, true],
        [authenticator, unfavorited, true],
        [authenticator, unfavorited, false],
      ] as const) {
        expect((await agent.setUserFavorite(auth, favorite)).isOk()).toBe(true);
      }

      const counts = await AgentResource.batchCountFavorites(authenticator, [
        popular,
        unfavorited,
        ignored,
      ]);

      expect(counts).toEqual(
        new Map([
          [popular, 2],
          [unfavorited, 0],
          [ignored, 0],
        ])
      );
    });

    it("returns an empty map without agents", async () => {
      expect(
        await AgentResource.batchCountFavorites(testContext.authenticator, [])
      ).toEqual(new Map());
    });

    it("counts and lists editors for global agents alongside custom ones", async () => {
      const { authenticator } = testContext;
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const [custom, helper] = await AgentResource.fetchByIds(authenticator, [
        agent.sId,
        GLOBAL_AGENTS_SID.HELPER,
      ]);
      assert(custom && helper);
      expect((await helper.setUserFavorite(authenticator, true)).isOk()).toBe(
        true
      );

      const [counts, editors] = await Promise.all([
        AgentResource.batchCountFavorites(authenticator, [custom, helper]),
        AgentResource.batchListEditors(authenticator, [custom, helper]),
      ]);

      expect(counts).toEqual(
        new Map([
          [custom, 0],
          [helper, 1],
        ])
      );
      expect(editors.get(custom)?.map((editor) => editor.id)).toEqual([
        testContext.user.id,
      ]);
      expect(editors.get(helper)).toBeNull();
    });
  });

  describe("global agent content", () => {
    it("carries the instructions of a global agent and lists its code-defined tools", async () => {
      const { authenticator } = testContext;

      const helper = await AgentResource.fetchById(
        authenticator,
        GLOBAL_AGENTS_SID.HELPER
      );

      assert(helper?.canViewContent);
      expect((await helper.fetchInstructions()).instructions).toContain(
        "@help"
      );
      expect(Array.isArray(await helper.listActions(authenticator))).toBe(true);
    });
  });

  describe("instructions on demand", () => {
    it("reads the instructions of the resource's own version when asked, not at fetch time", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { instructions: "before" }
      );
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        agent.sId
      );
      assert(resource?.canViewContent);

      await AgentConfigurationModel.update(
        { instructions: "after", instructionsHtml: "<p>after</p>" },
        { where: { id: agent.id, workspaceId: testContext.workspace.id } }
      );

      expect(await resource.fetchInstructions()).toEqual({
        instructions: "after",
        instructionsHtml: "<p>after</p>",
      });
    });

    it("batches instructions by resource: null when not viewable, in memory for a global agent", async () => {
      const hidden = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        {
          name: "Hidden content agent",
          scope: "hidden",
          instructions: "hidden instructions",
        }
      );
      const visible = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Visible content agent", instructions: "visible instructions" }
      );
      const adminUser = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, adminUser, {
        role: "admin",
      });
      const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        testContext.workspace.sId
      );

      const resources = await AgentResource.fetchByIds(adminAuth, [
        hidden.sId,
        visible.sId,
        GLOBAL_AGENTS_SID.HELPER,
      ]);
      const [hiddenResource, visibleResource, helper] = resources;
      expect(hiddenResource.canViewContent).toBe(false);

      const instructionsByAgent =
        await AgentResource.batchFetchInstructions(resources);

      expect(instructionsByAgent.get(hiddenResource)).toBeNull();
      expect(instructionsByAgent.get(visibleResource)?.instructions).toBe(
        "visible instructions"
      );
      expect(instructionsByAgent.get(helper)?.instructions).toContain("@help");
      expect(hiddenResource.toJSON()).toMatchObject({ canViewContent: false });
      expect(visibleResource.toJSON()).not.toHaveProperty("instructions");
    });
  });

  describe("admin_can_see_private_entities view override", () => {
    async function setupHiddenAgentWithTool() {
      const { workspace, globalSpace } = testContext;
      const owner = await UserFactory.basic();
      await MembershipFactory.associate(workspace, owner, { role: "user" });
      const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
        owner.sId,
        workspace.sId
      );
      const agent = await AgentConfigurationFactory.createTestAgent(ownerAuth, {
        name: "Private Agent",
        scope: "hidden",
      });
      const server = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );
      await AgentMCPServerConfigurationFactory.create(ownerAuth, globalSpace, {
        agent,
        mcpServerView,
      });

      const admin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, admin, { role: "admin" });
      const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        admin.sId,
        workspace.sId
      );
      return { agent, adminAuth };
    }

    it("hides an unreadable agent's content from an admin without the flag", async () => {
      const { agent, adminAuth } = await setupHiddenAgentWithTool();

      const resource = await AgentResource.fetchById(adminAuth, agent.sId);

      assert(resource);
      expect(resource.canViewContent).toBe(false);
      expect(await resource.listActions(adminAuth)).toEqual([]);
    });

    it("lists an unreadable agent's tools only when the filtering is dangerously skipped", async () => {
      const { agent, adminAuth } = await setupHiddenAgentWithTool();

      const resource = await AgentResource.fetchById(adminAuth, agent.sId);

      assert(resource);
      expect(await resource.listActions(adminAuth)).toEqual([]);
      expect(
        await resource.listActions(adminAuth, {
          permissionFiltering: "dangerously_skip",
        })
      ).toHaveLength(1);
    });

    it("keeps an unreadable agent's tools when an admin changes its model in bulk", async () => {
      const { agent, adminAuth } = await setupHiddenAgentWithTool();

      const result = await AgentResource.bulkUpdate(adminAuth, [agent.sId], {
        model: { temperature: 0.42 },
      });

      expect(result.updatedAgentIds).toEqual([agent.sId]);
      const updated = await AgentResource.fetchById(adminAuth, agent.sId);
      assert(updated);
      expect(updated.version).toBe(agent.version + 1);
      expect(updated.modelConfiguration.temperature).toBe(0.42);
      expect(
        await updated.listActions(adminAuth, {
          permissionFiltering: "dangerously_skip",
        })
      ).toHaveLength(1);
    });

    it("exposes the content and tools to an admin with the flag, without granting read", async () => {
      const { agent, adminAuth } = await setupHiddenAgentWithTool();
      await FeatureFlagFactory.basic(
        adminAuth,
        "admin_can_see_private_entities"
      );

      const resource = await AgentResource.fetchById(adminAuth, agent.sId);

      assert(resource?.canViewContent);
      expect((await resource.fetchInstructions()).instructions).toBe(
        agent.instructions
      );
      expect(await resource.listActions(adminAuth)).toHaveLength(1);
      expect(adminAuth.can("read", resource)).toBe(false);
    });

    it("applies the same override to resources built from configuration rows", async () => {
      const { agent, adminAuth } = await setupHiddenAgentWithTool();
      await FeatureFlagFactory.basic(
        adminAuth,
        "admin_can_see_private_entities"
      );
      const configurations = await AgentConfigurationModel.findAll({
        where: {
          workspaceId: adminAuth.getNonNullableWorkspace().id,
          sId: agent.sId,
        },
      });

      const [resource] = await AgentResource.dangerouslyFromConfigurationModels(
        adminAuth,
        configurations
      );

      assert(resource?.canViewContent);
      expect((await resource.fetchInstructions()).instructions).toBe(
        agent.instructions
      );
      expect(adminAuth.can("read", resource)).toBe(false);
    });
  });

  describe("batchListActions", () => {
    it("lists a version's tools to its readers, and none to a member who cannot read it", async () => {
      const { authenticator, workspace, globalSpace } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Hidden Tool Agent", scope: "hidden" }
      );
      const server = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );
      await AgentMCPServerConfigurationFactory.create(
        authenticator,
        globalSpace,
        { agent, mcpServerView }
      );

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const editorView = await AgentResource.fetchById(
        authenticator,
        agent.sId
      );
      assert(editorView);
      const actions = await editorView.listActions(authenticator);
      expect(
        actions.map((action) =>
          "mcpServerViewId" in action ? action.mcpServerViewId : null
        )
      ).toEqual([mcpServerView.sId]);

      // A member who cannot read the hidden agent does not even fetch it; a resource built for them
      // still gets no tools.
      expect(await AgentResource.fetchById(otherAuth, agent.sId)).toBeNull();
      expect(await editorView.listActions(otherAuth)).toEqual([]);
    });

    it("lists custom and global agents' tools in one call, with a single global agent build", async () => {
      const { authenticator } = testContext;
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const [custom, helper] = await AgentResource.fetchByIds(authenticator, [
        agent.sId,
        GLOBAL_AGENTS_SID.HELPER,
      ]);
      const otherHelper = await AgentResource.fetchById(
        authenticator,
        GLOBAL_AGENTS_SID.HELPER
      );
      assert(custom && helper && otherHelper);
      vi.mocked(getGlobalAgents).mockClear();

      const actionsByAgent = await AgentResource.batchListActions(
        authenticator,
        [custom, helper, otherHelper]
      );

      expect(getGlobalAgents).toHaveBeenCalledTimes(1);
      expect(getGlobalAgents).toHaveBeenCalledWith(
        authenticator,
        [GLOBAL_AGENTS_SID.HELPER],
        "full"
      );
      expect(actionsByAgent.get(custom)).toEqual([]);
      expect(actionsByAgent.get(helper)).toEqual(
        actionsByAgent.get(otherHelper)
      );
      expect(actionsByAgent.size).toBe(3);
    });
  });

  describe("versions", () => {
    it("lists every version newest first, each with its own content and tools", async () => {
      const { authenticator, workspace, globalSpace } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Versioned agent", instructions: "v0 instructions" }
      );
      const server = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );
      await AgentMCPServerConfigurationFactory.create(
        authenticator,
        globalSpace,
        { agent, mcpServerView }
      );
      await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agent.sId,
        { name: "Versioned agent v1", instructions: "v1 instructions" }
      );

      const current = await AgentResource.fetchById(authenticator, agent.sId);
      assert(current);
      const [latest, previous, ...rest] =
        await current.listVersions(authenticator);

      expect(rest).toEqual([]);
      assert(latest?.canViewContent && previous?.canViewContent);
      expect(latest.isCurrentVersion).toBe(true);
      expect(latest.name).toBe("Versioned agent v1");
      expect((await latest.fetchInstructions()).instructions).toBe(
        "v1 instructions"
      );
      expect(await latest.listActions(authenticator)).toEqual([]);
      expect(previous.isCurrentVersion).toBe(false);
      expect(previous.version).toBe(agent.version);
      expect(previous.name).toBe("Versioned agent");
      expect((await previous.fetchInstructions()).instructions).toBe(
        "v0 instructions"
      );
      expect(await previous.listActions(authenticator)).toHaveLength(1);
    });

    it("fetches a single version", async () => {
      const { authenticator } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { description: "v0" }
      );
      await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agent.sId,
        { description: "v1" }
      );
      const current = await AgentResource.fetchById(authenticator, agent.sId);
      assert(current);

      const previous = await current.fetchVersion(authenticator, agent.version);

      expect(previous?.description).toBe("v0");
      const latest = await current.fetchVersion(authenticator, current.version);
      expect(latest?.description).toBe("v1");
      expect(latest?.isCurrentVersion).toBe(true);
      expect(
        await current.fetchVersion(authenticator, current.version + 1)
      ).toBeNull();
    });

    it("resolves versions for the supplied caller, not the one the agent was fetched for", async () => {
      const { authenticator, workspace } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden" }
      );
      const editorView = await AgentResource.fetchById(
        authenticator,
        agent.sId
      );
      assert(editorView?.canViewContent);
      const { agentOwnerAuth: memberAuth } = await setupAgentOwner(
        workspace,
        "user"
      );

      expect(
        await editorView.fetchVersion(memberAuth, editorView.version)
      ).toBeNull();
      expect(await editorView.listVersions(memberAuth)).toEqual([]);
    });

    it("reads the current-version pointer with the versions, not from a stale resource", async () => {
      const { authenticator } = testContext;
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const stale = await AgentResource.fetchById(authenticator, agent.sId);
      assert(stale);
      await AgentConfigurationFactory.updateTestAgent(authenticator, agent.sId);

      const [latest, previous] = await stale.listVersions(authenticator);

      expect(latest?.version).toBe(agent.version + 1);
      expect(latest?.isCurrentVersion).toBe(true);
      expect(previous?.version).toBe(agent.version);
      expect(previous?.isCurrentVersion).toBe(false);
    });

    it("refuses to mutate a previous version", async () => {
      const { authenticator } = testContext;
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      await AgentConfigurationFactory.updateTestAgent(authenticator, agent.sId);
      const current = await AgentResource.fetchById(authenticator, agent.sId);
      const previous = await current?.fetchVersion(
        authenticator,
        agent.version
      );
      assert(previous);

      await expect(
        previous.updateConfiguration(authenticator, { description: "stale" })
      ).rejects.toThrow("mutating a previous version");
      await expect(previous.restore(authenticator)).rejects.toThrow(
        "mutating a previous version"
      );
    });

    it("drops a version whose requested spaces the caller cannot read", async () => {
      const { workspace } = testContext;
      const { agentOwner } = await setupAgentOwner(workspace, "user");
      const restrictedSpace = await SpaceFactory.regular(workspace);
      await restrictedSpace.addMembers(
        await Authenticator.internalAdminForWorkspace(workspace.sId),
        { userIds: [agentOwner.sId] }
      );
      const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
        agentOwner.sId,
        workspace.sId
      );
      const agent = await AgentConfigurationFactory.createTestAgent(
        agentOwnerAuth,
        { scope: "visible", requestedSpaceIds: [restrictedSpace.id] }
      );
      await AgentConfigurationFactory.updateTestAgent(
        agentOwnerAuth,
        agent.sId,
        {
          requestedSpaceIds: [],
        }
      );

      const current = await AgentResource.fetchById(
        testContext.authenticator,
        agent.sId
      );
      assert(current);
      const versions = await current.listVersions(testContext.authenticator);

      expect(versions.map((version) => version.version)).toEqual([
        current.version,
      ]);
      expect(
        await current.fetchVersion(testContext.authenticator, agent.version)
      ).toBeNull();
    });
  });

  describe("batchListTags", () => {
    it("lists each version's tags, with no tag for untagged and global agents", async () => {
      const { authenticator, workspace } = testContext;
      const tagged = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Tagged" }
      );
      const untagged = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Untagged" }
      );
      const tag = await TagFactory.create(workspace, { name: "tagged" });
      await TagFactory.addToAgent(authenticator, tag, tagged);

      const agents = await AgentResource.fetchByIds(authenticator, [
        tagged.sId,
        untagged.sId,
        GLOBAL_AGENTS_SID.HELPER,
      ]);
      expect(agents).toHaveLength(3);
      const [taggedAgent, untaggedAgent, globalAgent] = agents;

      const listForAgents = vi.spyOn(TagResource, "listForAgents");
      try {
        const tagsByAgent = await AgentResource.batchListTags(
          authenticator,
          agents
        );

        expect(
          [...tagsByAgent].map(([agent, tags]) => [
            agent,
            tags.map((t) => t.sId),
          ])
        ).toEqual([
          [taggedAgent, [tag.sId]],
          [untaggedAgent, []],
          [globalAgent, []],
        ]);
        expect(listForAgents).toHaveBeenCalledWith(authenticator, [
          taggedAgent.agentConfigurationModelId,
          untaggedAgent.agentConfigurationModelId,
        ]);
      } finally {
        listForAgents.mockRestore();
      }
    });
  });

  describe("bulkUpdate (model)", () => {
    it("saves a new version with the new model, keeping the agent's tools and author", async () => {
      const { authenticator, globalSpace } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5-mini",
            temperature: 0.7,
          },
        }
      );
      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const mcpServerView = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        globalSpace
      );
      await AgentMCPServerConfigurationFactory.create(
        authenticator,
        globalSpace,
        {
          agent,
          mcpServerView,
        }
      );

      const before = await AgentResource.fetchById(authenticator, agent.sId);
      assert(before?.canViewContent);
      const toolsBefore = (
        await fetchMCPServerActionConfigurations(authenticator, {
          configurationModelIds: [before.agentConfigurationModelId],
          variant: "full",
        })
      ).get(before.agentConfigurationModelId);
      expect(toolsBefore).toHaveLength(1);

      const result = await AgentResource.bulkUpdate(
        authenticator,
        [agent.sId],
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5",
            reasoningEffort: "medium",
          },
        }
      );

      expect(result).toEqual({
        updatedAgentIds: [agent.sId],
        skippedAgentIds: [],
      });

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      // A new version, with the new model, keeping the agent's own temperature.
      expect(after.version).toBe(agent.version + 1);
      expect(after.modelConfiguration.modelId).toBe("gpt-5");
      expect(after.modelConfiguration.reasoningEffort).toBe("medium");
      expect(after.modelConfiguration.temperature).toBe(0.7);
      // The version's author is preserved, not re-attributed to the caller.
      expect(after.versionAuthorId).toBe(before.versionAuthorId);
      // The tool is carried onto the new version instead of being dropped.
      const toolsAfter = (
        await fetchMCPServerActionConfigurations(authenticator, {
          configurationModelIds: [after.agentConfigurationModelId],
          variant: "full",
        })
      ).get(after.agentConfigurationModelId);
      expect(toolsAfter).toHaveLength(1);
    });

    it("does not create a new version when the model is unchanged", async () => {
      const { authenticator } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5-mini",
            temperature: 0.7,
          },
        }
      );

      // First change bumps the version and pins the reasoning effort.
      const first = await AgentResource.bulkUpdate(authenticator, [agent.sId], {
        model: {
          providerId: "openai",
          modelId: "gpt-5",
          reasoningEffort: "medium",
        },
      });
      expect(first.updatedAgentIds).toEqual([agent.sId]);

      const afterFirst = await AgentResource.fetchById(
        authenticator,
        agent.sId
      );
      assert(afterFirst?.canViewContent);
      expect(afterFirst.version).toBe(agent.version + 1);

      // Re-applying the exact same model is a no-op: no new version is created.
      const second = await AgentResource.bulkUpdate(
        authenticator,
        [agent.sId],
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5",
            reasoningEffort: "medium",
          },
        }
      );
      expect(second).toEqual({
        updatedAgentIds: [agent.sId],
        skippedAgentIds: [],
      });

      const afterSecond = await AgentResource.fetchById(
        authenticator,
        agent.sId
      );
      assert(afterSecond?.canViewContent);
      expect(afterSecond.version).toBe(afterFirst.version);
    });

    it("skips archived agents and reports them", async () => {
      const { authenticator } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5-mini",
            temperature: 0.7,
          },
        }
      );
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await AgentResource.bulkUpdate(
        authenticator,
        [agent.sId],
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5",
            reasoningEffort: "medium",
          },
        }
      );

      expect(result).toEqual({
        updatedAgentIds: [],
        skippedAgentIds: [agent.sId],
      });
    });
  });

  describe("bulkUpdate (tags)", () => {
    async function currentTagIds(
      auth: Authenticator,
      agentId: string
    ): Promise<string[]> {
      const agent = await AgentResource.fetchById(auth, agentId);
      assert(agent);
      const tags = await agent.listTags(auth);
      return tags.map((tag) => tag.sId).sort();
    }

    it("adds a tag as a new version, keeping the agent's existing tags", async () => {
      const { authenticator, workspace } = testContext;

      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const existingTag = await TagFactory.create(workspace, {
        name: "existing",
      });
      await TagFactory.addToAgent(authenticator, existingTag, agent);

      const newTag = await TagFactory.create(workspace, { name: "new" });
      const result = await AgentResource.bulkUpdate(
        authenticator,
        [agent.sId],
        {
          addTags: [newTag],
        }
      );

      expect(result).toEqual({
        updatedAgentIds: [agent.sId],
        skippedAgentIds: [],
      });

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      // A new version was created and both tags are attached to it.
      expect(after.version).toBe(agent.version + 1);
      expect(await currentTagIds(authenticator, agent.sId)).toEqual(
        [existingTag.sId, newTag.sId].sort()
      );
    });

    it("removes a tag as a new version", async () => {
      const { authenticator, workspace } = testContext;

      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const tag = await TagFactory.create(workspace, { name: "to-remove" });
      await TagFactory.addToAgent(authenticator, tag, agent);

      const result = await AgentResource.bulkUpdate(
        authenticator,
        [agent.sId],
        {
          removeTags: [tag],
        }
      );

      expect(result).toEqual({
        updatedAgentIds: [agent.sId],
        skippedAgentIds: [],
      });

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(agent.version + 1);
      expect(await currentTagIds(authenticator, agent.sId)).toEqual([]);
    });

    it("does not create a new version when the tag is already present", async () => {
      const { authenticator, workspace } = testContext;

      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const tag = await TagFactory.create(workspace, { name: "present" });
      await TagFactory.addToAgent(authenticator, tag, agent);

      // Adding the tag it already has leaves the set unchanged, so no new version is created.
      const result = await AgentResource.bulkUpdate(
        authenticator,
        [agent.sId],
        {
          addTags: [tag],
        }
      );
      expect(result.updatedAgentIds).toEqual([agent.sId]);

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(agent.version);
    });

    it("lets a workspace admin who is not an editor tag an agent", async () => {
      const { authenticator, workspace } = testContext;

      // The agent is authored (and edited) by the regular test user, so the admin below holds
      // `admin` but not `write` on it.
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const adminUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );
      const before = await AgentResource.fetchById(adminAuth, agent.sId);
      assert(before);
      expect(adminAuth.can("write", before)).toBe(false);
      expect(adminAuth.can("admin", before)).toBe(true);

      const tag = await TagFactory.create(workspace, { name: "governance" });
      const result = await AgentResource.bulkUpdate(adminAuth, [agent.sId], {
        addTags: [tag],
      });

      expect(result).toEqual({
        updatedAgentIds: [agent.sId],
        skippedAgentIds: [],
      });
      expect(await currentTagIds(authenticator, agent.sId)).toEqual([tag.sId]);
    });

    it("rejects a tags change from a member who is neither an editor nor a workspace admin", async () => {
      const { authenticator, workspace } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "visible" }
      );

      // A plain member: can read the visible agent, but holds neither `write` (not an editor) nor
      // the workspace admin role, so it may not create a version by tagging it.
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        member.sId,
        workspace.sId
      );
      const before = await AgentResource.fetchById(memberAuth, agent.sId);
      assert(before);
      expect(memberAuth.can("write", before)).toBe(false);
      expect(memberAuth.isAdmin()).toBe(false);

      const tag = await TagFactory.create(workspace, { name: "governance" });
      const res = await before.updateConfiguration(memberAuth, {
        addTags: [tag],
      });
      assert(res.isErr());

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(agent.version);
      expect(await currentTagIds(authenticator, agent.sId)).toEqual([]);
    });

    it("rejects adding a protected tag without publish, leaving editors untouched", async () => {
      const { authenticator, workspace } = testContext;

      // The author holds `write` and `admin` on its own agent, but as a regular member lacks the
      // workspace `publish` capability that protected tags require.
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "visible" }
      );
      const before = await AgentResource.fetchById(authenticator, agent.sId);
      assert(before?.canViewContent);
      expect(authenticator.can("write", before)).toBe(true);
      expect(authenticator.hasWorkspacePermission("publish", "agent")).toBe(
        false
      );

      const protectedTag = await TagResource.makeNew(authenticator, {
        name: "reserved",
        kind: "protected",
      });
      const newEditor = await UserFactory.basic();
      await MembershipFactory.associate(workspace, newEditor, { role: "user" });
      const baseParams = await before.buildResaveParams(authenticator);

      // The protected-tag permission is checked before any mutation, so the editor change bundled in
      // the same save is not applied and no new version is created.
      const res = await before.updateConfiguration(authenticator, {
        addTags: [protectedTag],
        editors: [...baseParams.editors, newEditor.toJSON()],
      });
      assert(res.isErr());

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(agent.version);
      expect(await currentTagIds(authenticator, agent.sId)).toEqual([]);
      const editorIds = (await after.listEditors(authenticator))?.map(
        (editor) => editor.id
      );
      expect(editorIds).not.toContain(newEditor.id);
    });
  });

  describe("save no-op comparison of tool configuration", () => {
    it("creates a new version when a tool's JSON schema changes under an identity-named property", async () => {
      const { authenticator, globalSpace } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        {
          model: {
            providerId: "openai",
            modelId: "gpt-5-mini",
            temperature: 0.7,
          },
        }
      );
      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const mcpServerView = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        globalSpace
      );
      const mcpConfig = await AgentMCPServerConfigurationFactory.create(
        authenticator,
        globalSpace,
        {
          agent,
          mcpServerView,
        }
      );
      // A tool input schema whose own property is literally named `id` — an identity key the
      // comparison strips structurally. Content under it must still register as a change.
      const oldSchema: JSONSchema7 = {
        type: "object",
        properties: { id: { type: "string", description: "old" } },
      };
      const newSchema: JSONSchema7 = {
        type: "object",
        properties: { id: { type: "string", description: "new" } },
      };
      await mcpConfig.update({ jsonSchema: oldSchema });

      const before = await AgentResource.fetchById(authenticator, agent.sId);
      assert(before?.canViewContent);
      const baseParams = await before.buildResaveParams(authenticator);
      assert(baseParams.actions);

      // Re-saving the exact same configuration is a no-op: the JSON schema does not spuriously diff.
      const noop = await before.updateConfiguration(authenticator, baseParams);
      assert(noop.isOk());
      const afterNoop = await AgentResource.fetchById(authenticator, agent.sId);
      assert(afterNoop?.canViewContent);
      expect(afterNoop.version).toBe(before.version);

      // Editing the schema under the `id` property is a real change and MUST create a new version,
      // rather than being masked by the identity-key drop and silently skipped.
      const editedParams = {
        ...baseParams,
        actions: baseParams.actions.map((action) => ({
          ...action,
          jsonSchema: newSchema,
        })),
      };
      const edited = await before.updateConfiguration(
        authenticator,
        editedParams
      );
      assert(edited.isOk());
      const afterEdit = await AgentResource.fetchById(authenticator, agent.sId);
      assert(afterEdit?.canViewContent);
      expect(afterEdit.version).toBe(before.version + 1);
    });
  });

  describe("in-place scope and editor edits", () => {
    it("applies an editor-set change in place without creating a new version", async () => {
      const { authenticator, workspace } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "visible" }
      );
      const before = await AgentResource.fetchById(authenticator, agent.sId);
      assert(before?.canViewContent);
      const baseParams = await before.buildResaveParams(authenticator);

      const newEditor = await UserFactory.basic();
      await MembershipFactory.associate(workspace, newEditor, { role: "user" });

      const res = await before.updateConfiguration(authenticator, {
        ...baseParams,
        editors: [...baseParams.editors, newEditor.toJSON()],
      });
      assert(res.isOk());

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      // No new version was created for an editor-only change.
      expect(after.version).toBe(before.version);
      const editorIds = (await after.listEditors(authenticator))?.map(
        (e) => e.id
      );
      expect(editorIds).toContain(newEditor.id);
    });

    it("creates a new version when a definition field changes, preserving scope", async () => {
      const { authenticator } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "visible" }
      );
      const before = await AgentResource.fetchById(authenticator, agent.sId);
      assert(before?.canViewContent);
      const baseParams = await before.buildResaveParams(authenticator);

      const res = await before.updateConfiguration(authenticator, {
        ...baseParams,
        description: "A brand new description",
      });
      assert(res.isOk());

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(before.version + 1);
      expect(after.description).toBe("A brand new description");
      expect(after.scope).toBe("visible");
    });

    it("applies a scope change to the new version when a definition field also changed", async () => {
      const { user, workspace } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { scope: "visible" }
      );

      // Grant the workspace the `publish` capability so the author can (un)publish, then re-resolve
      // the authenticator to pick up the new grant.
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const globalGroup =
        await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
      assert(globalGroup.isOk());
      await GroupPermissionResource.grantTypeWide(adminAuth, {
        group: globalGroup.value,
        grantType: "publish",
        resourceType: "agent",
      });
      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const before = await AgentResource.fetchById(auth, agent.sId);
      assert(before?.canViewContent);
      const baseParams = await before.buildResaveParams(auth);

      // A definition change bumps the version (archiving the old row); the scope change must land on
      // that NEW active version, not on the now-archived row it was read from.
      const res = await before.updateConfiguration(auth, {
        ...baseParams,
        description: "A brand new description",
        scope: "hidden",
      });
      assert(res.isOk());

      const after = await AgentResource.fetchById(auth, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(before.version + 1);
      expect(after.description).toBe("A brand new description");
      expect(after.scope).toBe("hidden");
    });

    it("rejects a scope change without publish and creates no version even if a definition field also changed", async () => {
      const { authenticator } = testContext;

      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "visible" }
      );
      const before = await AgentResource.fetchById(authenticator, agent.sId);
      assert(before?.canViewContent);
      const baseParams = await before.buildResaveParams(authenticator);

      // A regular editor holds `write`/`admin` on the agent but not the workspace `publish`
      // capability, so it cannot change the scope — and the permission is checked before anything is
      // written, so the definition change is not persisted either.
      const res = await before.updateConfiguration(authenticator, {
        ...baseParams,
        description: "Should not be saved",
        scope: "hidden",
      });
      assert(res.isErr());

      const after = await AgentResource.fetchById(authenticator, agent.sId);
      assert(after?.canViewContent);
      expect(after.version).toBe(before.version);
      expect(after.scope).toBe("visible");
      expect(after.description).toBe(before.description);
    });
  });

  describe("list resolvers", () => {
    it("fetchByName resolves the active agent by exact name, else null", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Findable Agent" }
      );

      const found = await AgentResource.fetchByName(
        testContext.authenticator,
        "Findable Agent"
      );
      expect(found?.sId).toBe(agent.sId);

      expect(
        await AgentResource.fetchByName(
          testContext.authenticator,
          "No Such Agent"
        )
      ).toBeNull();
    });

    it("fetchByName ignores case and prefers the exact name when several agents match", async () => {
      const exact = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Case Agent" }
      );
      await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "case agent" }
      );

      expect(
        (
          await AgentResource.fetchByName(
            testContext.authenticator,
            "Case Agent"
          )
        )?.sId
      ).toBe(exact.sId);
      expect(
        await AgentResource.fetchByName(testContext.authenticator, "CASE AGENT")
      ).toBeNull();
    });

    it("fetchByName resolves a single custom agent whatever the case", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Mixed Case Agent" }
      );

      expect(
        (
          await AgentResource.fetchByName(
            testContext.authenticator,
            "mixed CASE agent"
          )
        )?.sId
      ).toBe(agent.sId);
    });

    it("fetchByName falls back to a global agent of that name", async () => {
      const helper = await AgentResource.fetchById(
        testContext.authenticator,
        GLOBAL_AGENTS_SID.HELPER
      );
      assert(helper);

      expect(
        (
          await AgentResource.fetchByName(
            testContext.authenticator,
            helper.name.toUpperCase()
          )
        )?.sId
      ).toBe(GLOBAL_AGENTS_SID.HELPER);
    });

    it("listByWorkspace returns the workspace's active agents", async () => {
      const first = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "WS One" }
      );
      const second = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "WS Two" }
      );

      const sIds = (
        await AgentResource.listByWorkspace(testContext.authenticator)
      ).map((resource) => resource.sId);

      expect(sIds).toEqual(expect.arrayContaining([first.sId, second.sId]));
    });

    it("listByWorkspace filters on the requested statuses, scoped to the workspace", async () => {
      const { agent: active } = await buildAgentInState({
        scope: "visible",
        status: "active",
        name: "Active agent",
      });
      const { agent: archived } = await buildAgentInState({
        scope: "visible",
        status: "archived",
        name: "Archived agent",
      });
      await buildAgentInState({
        scope: "visible",
        status: "draft",
        name: "Draft agent",
      });
      const other = await createResourceTest({ role: "admin" });
      await AgentConfigurationFactory.createTestAgent(other.authenticator);

      const activeAgents = await AgentResource.listByWorkspace(
        testContext.authenticator
      );
      const agents = await AgentResource.listByWorkspace(
        testContext.authenticator,
        { status: ["active", "archived"] }
      );

      expect(activeAgents.map((agent) => agent.sId)).toEqual([active.sId]);
      expect(agents.map((agent) => agent.sId).toSorted()).toEqual(
        [active.sId, archived.sId].toSorted()
      );
    });

    it("listByAuthor returns agents the user authored, not others'", async () => {
      const mine = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Mine" }
      );

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(testContext.workspace, otherUser, {
        role: "user",
      });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        testContext.workspace.sId
      );
      const theirs = await AgentConfigurationFactory.createTestAgent(
        otherAuth,
        {
          name: "Theirs",
        }
      );

      const sIds = (
        await AgentResource.listByAuthor(testContext.authenticator, {
          authorModelId: testContext.user.id,
        })
      ).map((resource) => resource.sId);

      expect(sIds).toContain(mine.sId);
      expect(sIds).not.toContain(theirs.sId);
    });

    it("listByTag returns agents whose current version carries the tag", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Tagged" }
      );
      const tag = await TagFactory.create(testContext.workspace, {
        name: "topic",
      });
      await TagFactory.addToAgent(testContext.authenticator, tag, agent);

      const sIds = (
        await AgentResource.listByTag(testContext.authenticator, [tag.id])
      ).map((resource) => resource.sId);

      expect(sIds).toEqual([agent.sId]);
    });

    it("listBySkills returns agents whose current version links the skill", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Skilled" }
      );
      const skill = await SkillFactory.create(testContext.authenticator, {
        name: "Linked Skill",
      });
      await SkillFactory.linkToAgent(testContext.authenticator, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });

      const sIds = (
        await AgentResource.listBySkills(testContext.authenticator, {
          customSkillModelIds: [skill.id],
        })
      ).map((resource) => resource.sId);

      expect(sIds).toEqual([agent.sId]);
    });

    it("listByMCPServerViewIds returns agents whose current version uses the view", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Tooled" }
      );
      const server = await RemoteMCPServerFactory.create(testContext.workspace);
      const view = await MCPServerViewFactory.create(
        testContext.workspace,
        server.sId,
        testContext.globalSpace
      );
      await AgentMCPServerConfigurationFactory.create(
        testContext.authenticator,
        testContext.globalSpace,
        { agent, mcpServerView: view }
      );

      const sIds = (
        await AgentResource.listByMCPServerViewIds(testContext.authenticator, [
          view.id,
        ])
      ).map((resource) => resource.sId);

      expect(sIds).toEqual([agent.sId]);
    });

    it("listFavoritesForCurrentUser returns only the user's favorited agents", async () => {
      const favorite = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "Fav" }
      );
      const other = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        { name: "NotFav" }
      );
      const favoriteResource = await AgentResource.fetchById(
        testContext.authenticator,
        favorite.sId
      );
      assert(favoriteResource);
      expect(
        (
          await favoriteResource.setUserFavorite(
            testContext.authenticator,
            true
          )
        ).isOk()
      ).toBe(true);

      const sIds = (
        await AgentResource.listFavoritesForCurrentUser(
          testContext.authenticator
        )
      ).map((resource) => resource.sId);

      expect(sIds).toContain(favorite.sId);
      expect(sIds).not.toContain(other.sId);
    });

    it("listFavoritesForCurrentUser omits retired and model-only global agents", async () => {
      const { authenticator } = testContext;
      const favorites = await Promise.all(
        [
          GLOBAL_AGENTS_SID.HELPER,
          GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
          GLOBAL_AGENTS_SID.GPT5,
        ].map((agentId) => AgentResource.fetchById(authenticator, agentId))
      );
      for (const agent of favorites) {
        assert(agent);
        expect((await agent.setUserFavorite(authenticator, true)).isOk()).toBe(
          true
        );
      }

      const agentIds = (
        await AgentResource.listFavoritesForCurrentUser(authenticator)
      ).map((resource) => resource.sId);

      expect(agentIds).toEqual([GLOBAL_AGENTS_SID.HELPER]);
    });
  });

  describe("pinned versions", () => {
    it("resolves each (agentId, agentVersion) pair in first-occurrence order, once", async () => {
      const { authenticator } = testContext;
      const first = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Pinned first", description: "first v0" }
      );
      await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        first.sId,
        {
          description: "first v1",
        }
      );
      const second = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Pinned second", description: "second v0" }
      );

      const resources = await AgentResource.fetchByIdsAndVersions(
        authenticator,
        [
          { agentId: first.sId, agentVersion: first.version + 1 },
          { agentId: second.sId, agentVersion: second.version },
          { agentId: first.sId, agentVersion: first.version },
          { agentId: first.sId, agentVersion: first.version + 1 },
          { agentId: first.sId, agentVersion: first.version + 2 },
          { agentId: "missing-agent", agentVersion: 0 },
        ]
      );

      expect(
        resources.map((resource) => [
          resource.sId,
          resource.description,
          resource.isCurrentVersion,
        ])
      ).toEqual([
        [first.sId, "first v1", true],
        [second.sId, "second v0", true],
        [first.sId, "first v0", false],
      ]);
    });

    it("resolves a global agent once, whatever version is asked for", async () => {
      const resources = await AgentResource.fetchByIdsAndVersions(
        testContext.authenticator,
        [
          { agentId: GLOBAL_AGENTS_SID.HELPER, agentVersion: 0 },
          { agentId: GLOBAL_AGENTS_SID.HELPER, agentVersion: 42 },
        ]
      );

      expect(resources.map((resource) => resource.sId)).toEqual([
        GLOBAL_AGENTS_SID.HELPER,
      ]);
      expect(resources[0]?.scope).toBe("global");
    });

    it("does not resolve a pinned version of another workspace's agent", async () => {
      const other = await createResourceTest({ role: "admin" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        other.authenticator
      );

      expect(
        await AgentResource.fetchByIdsAndVersions(testContext.authenticator, [
          { agentId: agent.sId, agentVersion: agent.version },
        ])
      ).toEqual([]);
    });
  });

  describe("poke content access", () => {
    it("exposes a hidden agent's content to a Poke superuser without granting any verb", async () => {
      const { authenticator, workspace, user } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden", instructions: "support can read this" }
      );
      // Poke's authenticator holds every workspace group, so it reads an agent through any editor
      // grant: drop the only one to leave the superuser without `read`.
      const owned = await AgentResource.fetchById(authenticator, agent.sId);
      assert(owned?.id);
      expect(
        (
          await GroupPermissionResource.revokeFromUser(authenticator, {
            user: user.toJSON(),
            resourceType: "agent",
            resourceId: owned.id,
            grantType: "editor",
          })
        ).isOk()
      ).toBe(true);
      const { agentOwnerAuth: adminAuth } = await setupAgentOwner(
        workspace,
        "admin"
      );
      const pokeAuth = await Authenticator.fromDustSuperUser({
        wId: workspace.sId,
      });

      const redacted = await AgentResource.fetchById(adminAuth, agent.sId);
      const forPoke = await AgentResource.fetchById(pokeAuth, agent.sId);
      const [pokeVersion] = (await forPoke?.listVersions(pokeAuth)) ?? [];

      expect(redacted?.canViewContent).toBe(false);
      for (const resource of [forPoke, pokeVersion]) {
        assert(resource?.canViewContent);
        expect((await resource.fetchInstructions()).instructions).toBe(
          "support can read this"
        );
        expect(pokeAuth.can("read", resource)).toBe(false);
      }
    });
  });

  describe("dangerous fetches", () => {
    it("keep an agent the caller cannot fetch, without verbs or content", async () => {
      const { authenticator, workspace } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden", instructions: "secret" }
      );
      const { agentOwnerAuth: memberAuth } = await setupAgentOwner(
        workspace,
        "user"
      );
      const reference = { agentId: agent.sId, agentVersion: agent.version };

      expect(await AgentResource.fetchByIds(memberAuth, [agent.sId])).toEqual(
        []
      );
      expect(
        await AgentResource.fetchByIdsAndVersions(memberAuth, [reference])
      ).toEqual([]);

      const [byId] = await AgentResource.fetchByIds(memberAuth, [agent.sId], {
        dangerouslySkipFetchCheck: true,
      });
      const [byVersion] = await AgentResource.fetchByIdsAndVersions(
        memberAuth,
        [reference],
        { dangerouslySkipFetchCheck: true }
      );
      for (const resource of [byId, byVersion]) {
        assert(resource);
        expect(resource.sId).toBe(agent.sId);
        expect(resource.name).toBe(agent.name);
        expect(resource.canViewContent).toBe(false);
        expect(resource.getAllowedVerbs(memberAuth).size).toBe(0);
        expect(memberAuth.can("read", resource)).toBe(false);
        expect(
          (await AgentResource.batchFetchInstructions([resource])).get(resource)
        ).toBeNull();
      }
    });

    it("stay scoped to the caller's workspace", async () => {
      const other = await createResourceTest({ role: "admin" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        other.authenticator
      );

      expect(
        await AgentResource.fetchByIds(testContext.authenticator, [agent.sId], {
          dangerouslySkipFetchCheck: true,
        })
      ).toEqual([]);
      expect(
        await AgentResource.fetchByIdsAndVersions(
          testContext.authenticator,
          [{ agentId: agent.sId, agentVersion: agent.version }],
          { dangerouslySkipFetchCheck: true }
        )
      ).toEqual([]);
    });
  });

  describe("global agent context", () => {
    it("shapes a global agent's model for the turn, not custom agents", async () => {
      const { authenticator } = testContext;
      const custom = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Context-free agent" }
      );
      const globalAgentContext = { userMessageRank: 1, staticReply: "hello" };

      const [dust, customAgent] = await AgentResource.fetchByIds(
        authenticator,
        [GLOBAL_AGENTS_SID.DUST, custom.sId],
        { globalAgentContext }
      );
      const [pinnedDust] = await AgentResource.fetchByIdsAndVersions(
        authenticator,
        [{ agentId: GLOBAL_AGENTS_SID.DUST, agentVersion: 0 }],
        { globalAgentContext }
      );

      for (const resource of [dust, pinnedDust]) {
        expect(resource?.modelConfiguration.metaData).toEqual({
          staticResponse: "hello",
        });
      }
      expect(customAgent?.modelConfiguration).toEqual(
        (await AgentResource.fetchById(authenticator, custom.sId))
          ?.modelConfiguration
      );
    });

    it("greets a new agent's builder in their locale once localisation is on", async () => {
      const { authenticator, user } = testContext;
      const globalAgentContext = {
        userMessageRank: 0,
        sidekickIsNewAgentFromScratch: true,
      };
      const fetchStaticResponse = async () => {
        const [sidekick] = await AgentResource.fetchByIds(
          authenticator,
          [GLOBAL_AGENTS_SID.SIDEKICK],
          // The agent loop fetches its agent with actions, the only variant with sidekick context.
          { globalAgentContext, withActions: true }
        );
        return sidekick?.modelConfiguration.metaData?.staticResponse;
      };

      await user.setMetadata(USER_LOCALE_METADATA_KEY, "fr-FR");
      expect(await fetchStaticResponse()).toMatch(/^(Need|Want|Not sure)/);

      await FeatureFlagFactory.basic(authenticator, "localisation");
      expect(await fetchStaticResponse()).toMatch(
        /^(Besoin|Envie|Vous ne savez pas)/
      );
    });
  });

  describe("agent loop inputs", () => {
    it("serves a custom agent's default reasoning effort when none is stored", async () => {
      const agent = await AgentConfigurationFactory.createTestAgent(
        testContext.authenticator,
        {
          name: "Default effort agent",
          model: {
            providerId: "openai",
            modelId: "gpt-5-mini",
            reasoningEffort: null,
          },
        }
      );
      const resource = await AgentResource.fetchById(
        testContext.authenticator,
        agent.sId
      );
      assert(resource);

      expect(resource.modelConfiguration.reasoningEffort).toBeUndefined();
      expect(resource.toJSON().model.reasoningEffort).toBe(
        getSupportedModelConfig(resource.modelConfiguration)
          ?.defaultReasoningEffort
      );
    });

    it("lists a global agent's actions from its full build, without rebuilding it", async () => {
      const { authenticator } = testContext;
      const [helper] = await AgentResource.fetchByIds(
        authenticator,
        [GLOBAL_AGENTS_SID.HELPER],
        { withActions: true }
      );
      assert(helper);
      vi.mocked(getGlobalAgents).mockClear();

      const actions = await AgentResource.batchListActions(authenticator, [
        helper,
      ]);

      expect(getGlobalAgents).not.toHaveBeenCalled();
      const [fullHelper] = await getGlobalAgents(
        authenticator,
        [GLOBAL_AGENTS_SID.HELPER],
        "full"
      );
      expect(actions.get(helper)).toEqual(fullHelper?.actions);
    });
    it("keeps a custom agent's tools on the resource, and never for a caller who cannot view them", async () => {
      const { authenticator, workspace, globalSpace } = testContext;
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Agent with kept tools", scope: "hidden" }
      );
      const server = await RemoteMCPServerFactory.create(workspace);
      const mcpServerView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );
      await AgentMCPServerConfigurationFactory.create(
        authenticator,
        globalSpace,
        { agent, mcpServerView }
      );
      const { agentOwnerAuth: adminAuth } = await setupAgentOwner(
        workspace,
        "admin"
      );
      const reference = { agentId: agent.sId, agentVersion: agent.version };

      const [editorView] = await AgentResource.fetchByIdsAndVersions(
        authenticator,
        [reference],
        { withActions: true }
      );
      const [adminView] = await AgentResource.fetchByIdsAndVersions(
        adminAuth,
        [reference],
        { withActions: true }
      );
      assert(editorView && adminView);
      const findAll = vi.spyOn(AgentMCPServerConfigurationModel, "findAll");
      try {
        const actions = await AgentResource.batchListActions(authenticator, [
          editorView,
        ]);

        expect(findAll).not.toHaveBeenCalled();
        expect(actions.get(editorView)).toHaveLength(1);
      } finally {
        findAll.mockRestore();
      }
      expect(adminView.canViewContent).toBe(false);
      expect(await adminView.listActions(adminAuth)).toEqual([]);
    });
  });

  describe("global agent list", () => {
    it("listReadable returns active readable agents, global first then custom by name", async () => {
      const { workspace } = testContext;
      const { agentOwnerAuth: otherAuth } = await setupAgentOwner(
        workspace,
        "user"
      );
      const { agent: beta } = await buildAgentInState({
        scope: "visible",
        status: "active",
        name: "Readable Beta",
      });
      const { agent: alpha } = await buildAgentInState({
        scope: "hidden",
        status: "active",
        name: "Readable Alpha",
      });
      const { agent: archived } = await buildAgentInState({
        scope: "visible",
        status: "archived",
        name: "Readable Archived",
      });
      const othersHidden = await AgentConfigurationFactory.createTestAgent(
        otherAuth,
        { name: "Readable Others Hidden", scope: "hidden" }
      );

      const agents = await AgentResource.listReadable(
        testContext.authenticator
      );
      const sIds = agents.map((agent) => agent.sId);
      const firstCustomIndex = agents.findIndex(
        (agent) => agent.scope !== "global"
      );

      expect(sIds.filter((sId) => [alpha.sId, beta.sId].includes(sId))).toEqual(
        [alpha.sId, beta.sId]
      );
      expect(sIds).not.toContain(archived.sId);
      expect(sIds).not.toContain(othersHidden.sId);
      expect(
        agents
          .slice(0, firstCustomIndex)
          .every(
            (agent) => agent.scope === "global" && agent.status === "active"
          )
      ).toBe(true);
      expect(
        agents
          .slice(firstCustomIndex)
          .every((agent) => agent.scope !== "global")
      ).toBe(true);
    });

    it("listGlobalAgents returns the workspace's global agents", async () => {
      const globalAgents = await AgentResource.listGlobalAgents(
        testContext.authenticator
      );

      expect(globalAgents.map((agent) => agent.sId)).toContain(
        GLOBAL_AGENTS_SID.HELPER
      );
      expect(globalAgents.every((agent) => agent.scope === "global")).toBe(
        true
      );
    });
  });
});
