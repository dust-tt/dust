import {
  destroyAgentConfigurationRow,
  getAgentConfiguration,
  getAgentConfigurations,
  syncAgentSearchAfterRowDestroyed,
  updateAgentConfigurationsScope,
} from "@app/lib/api/assistant/configuration/agent";
import { getEditors } from "@app/lib/api/assistant/editors";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPinnedItemModel } from "@app/lib/resources/storage/models/group_pinned_items";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { saveAgentConfiguration } from "@app/tests/utils/saveAgentConfiguration";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAgentConfigurations", () => {
  it.each([
    "system key",
    "Poke",
  ] as const)("reports %s edit access", async (caller) => {
    const { authenticator, workspace, systemGroup } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        scope: "hidden",
      }
    );
    const auth =
      caller === "system key"
        ? await Authenticator.fromKey(
            await KeyFactory.system(systemGroup),
            workspace.sId
          )
        : await Authenticator.fromDustSuperUser({
            wId: workspace.sId,
            pokePrincipal: { email: "operator@dust.tt", name: "Operator" },
          });
    const configuration = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });

    expect(configuration).toMatchObject({ canRead: true, canEdit: true });
  });

  it.each([
    true,
    false,
  ])("internal admins report edit access from their grants (all groups: %s)", async (dangerouslyRequestAllGroups) => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "hidden" }
    );
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
      dangerouslyRequestAllGroups,
    });

    const configuration = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });

    expect(configuration).toMatchObject({
      canRead: dangerouslyRequestAllGroups,
      canEdit: dangerouslyRequestAllGroups,
    });
  });

  it("denies read and edit on an agent backed by an unreadable space", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "hidden" }
    );
    // Put the agent behind the restricted space after creation: nobody can create an agent on a
    // space they cannot read, but an existing agent can end up on one the caller cannot read.
    await AgentConfigurationModel.update(
      { requestedSpaceIds: [restrictedSpace.id] },
      { where: { sId: agent.sId, workspaceId: workspace.id } }
    );

    const configuration = await getAgentConfiguration(authenticator, {
      agentId: agent.sId,
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    });

    // The space read gate denies read and write even to the agent's own editor.
    expect(configuration).toMatchObject({ canRead: false, canEdit: false });
  });

  it("denies a scoped system key without the admin role on an unreadable space", async () => {
    const { authenticator, workspace, systemGroup } = await createResourceTest({
      role: "admin",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "hidden" }
    );
    // Put the agent behind the restricted space after creation: nobody can create an agent on a
    // space they cannot read, but an existing agent can end up on one the caller cannot read.
    await AgentConfigurationModel.update(
      { requestedSpaceIds: [restrictedSpace.id] },
      { where: { sId: agent.sId, workspaceId: workspace.id } }
    );
    const group = await GroupFactory.regularManual(workspace, "Agent editors");
    const resource = await AgentResource.fetchById(authenticator, agent.sId);
    assert(resource !== null);
    assert(resource.id !== null);
    await GroupPermissionResource.grant(authenticator, {
      group,
      grantType: "editor",
      resourceType: "agent",
      resourceId: resource.id,
    });
    const auth = await Authenticator.fromKey(
      await KeyFactory.system(systemGroup),
      workspace.sId,
      [group.sId],
      "user"
    );

    const configuration = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    });

    expect(configuration).toMatchObject({ canRead: false, canEdit: false });
  });

  it("respects the agent grants of a scoped system key", async () => {
    const { authenticator, workspace, systemGroup } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const otherAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Other agent",
      }
    );
    const group = await GroupFactory.regularManual(workspace, "Agent editors");
    const resource = await AgentResource.fetchById(authenticator, agent.sId);
    assert(resource !== null);
    assert(resource.id !== null);
    await GroupPermissionResource.grant(authenticator, {
      group,
      grantType: "editor",
      resourceType: "agent",
      resourceId: resource.id,
    });
    const key = await KeyFactory.system(systemGroup);
    const auth = await Authenticator.fromKey(key, workspace.sId, [group.sId]);
    const agents = await getAgentConfigurations(auth, {
      agentIds: [agent.sId, otherAgent.sId],
      variant: "light",
    });

    expect(
      Object.fromEntries(agents.map((agent) => [agent.sId, agent.canEdit]))
    ).toEqual({
      [agent.sId]: true,
      [otherAgent.sId]: false,
    });
  });

  it("does not give human or impersonated admins implicit edit access", async () => {
    const { authenticator, workspace, systemGroup } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    const key = await KeyFactory.system(systemGroup);
    const systemAuth = await Authenticator.fromKey(key, workspace.sId);
    const impersonatedAuth =
      await systemAuth.exchangeSystemKeyForUserAuthByEmail(systemAuth, {
        userEmail: admin.email,
        requestedRole: "admin",
      });
    assert(impersonatedAuth);
    const resource = await AgentResource.fetchById(authenticator, agent.sId);
    assert(resource !== null);
    for (const auth of [adminAuth, impersonatedAuth]) {
      expect(auth.can("write", resource)).toBe(false);
      const configuration = await getAgentConfiguration(auth, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(configuration?.canEdit).toBe(false);
    }
  });

  it("returns only the latest version of each requested agent", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const firstAgent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const secondAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Second agent" }
    );

    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstAgent.sId
    );
    const latestFirstAgent = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstAgent.sId
    );
    const latestSecondAgent = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      secondAgent.sId,
      { name: "Second agent" }
    );

    const agents = await getAgentConfigurations(authenticator, {
      agentIds: [
        firstAgent.sId,
        secondAgent.sId,
        firstAgent.sId,
        generateRandomModelSId(),
      ],
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    });

    // `getAgentConfigurations` deduplicates the requested ids, drops the unknown one, and returns
    // the latest version of each agent. It orders by version across agents, which is not a
    // meaningful order between distinct agents (both are at the same version here), so compare
    // order-independently by sorting on sId.
    const bySId = (a: { sId: string }, b: { sId: string }) =>
      a.sId.localeCompare(b.sId);
    expect(
      agents.map(({ sId, version }) => ({ sId, version })).sort(bySId)
    ).toEqual(
      [
        { sId: latestFirstAgent.sId, version: latestFirstAgent.version },
        { sId: latestSecondAgent.sId, version: latestSecondAgent.version },
      ].sort(bySId)
    );
  });
});

// Hard-deletes a single configuration version through the kept row-destruction primitive, mirroring
// what the removed `unsafeHardDeleteAgentConfiguration` helper did for a minimal agent (no tools,
// tags or skills to clean up first).
async function hardDeleteAgentVersion(
  auth: Authenticator,
  version: LightAgentConfigurationType
): Promise<void> {
  const agent = await AgentResource.fetchById(auth, version.sId);
  assert(agent !== null);
  const { agentDeleted } = await withTransaction((t) =>
    destroyAgentConfigurationRow(
      auth,
      { agent, configurationId: agent.agentConfigurationModelId },
      t
    )
  );
  await syncAgentSearchAfterRowDestroyed(auth, { agent, agentDeleted });
}

describe("stable agent identities", () => {
  it("reuses one identity across agent versions", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );

    const versions = await AgentConfigurationModel.findAll({
      where: { sId: firstVersion.sId, workspaceId: workspace.id },
      attributes: ["agentId"],
    });
    const agentModelIds = new Set(versions.map((version) => version.agentId));

    expect(versions).toHaveLength(2);
    expect(agentModelIds.size).toBe(1);
    expect([...agentModelIds][0]).not.toBeNull();
  });

  it("keeps the identity at its highest version, including after a rollback", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const currentVersion = async (sId: string) => {
      const identity = await AgentModel.findOne({
        where: { sId, workspaceId: workspace.id },
      });
      return identity?.currentVersion ?? null;
    };

    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    expect(await currentVersion(firstVersion.sId)).toBe(0);

    const secondVersion = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );
    expect(secondVersion.version).toBe(1);
    expect(await currentVersion(firstVersion.sId)).toBe(1);

    // Rolling back the newest version moves the pointer back to the previous one.
    await hardDeleteAgentVersion(authenticator, secondVersion);
    expect(await currentVersion(firstVersion.sId)).toBe(0);

    await hardDeleteAgentVersion(authenticator, firstVersion);
    expect(await currentVersion(firstVersion.sId)).toBeNull();
  });

  it("mirrors the current configuration's head fields onto the identity", async () => {
    const test = await createResourceTest({ role: "admin" });
    const { workspace } = test;
    // Changing scope needs the `publish` capability, which the test harness does not seed.
    await GroupPermissionResource.setForEverybody(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { grantType: "publish", resourceType: "agent" }
    );
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      test.user.sId,
      workspace.sId
    );
    const headFields = async (sId: string) => {
      const identity = await AgentModel.findOne({
        where: { sId, workspaceId: workspace.id },
      });
      assert(identity);
      return {
        name: identity.name,
        status: identity.status,
        scope: identity.scope,
        reinforcement: identity.reinforcement,
        templateId: identity.templateId,
      };
    };

    const template = await TemplateFactory.published();
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Before rename",
        scope: "hidden",
        templateId: template.sId,
        reinforcement: "off",
      }
    );
    expect(await headFields(agent.sId)).toEqual({
      name: "Before rename",
      status: "active",
      scope: "hidden",
      reinforcement: "off",
      templateId: template.id,
    });

    // An upgrade moves the pointer and re-mirrors whatever the new current version holds: the
    // factory clears `templateId` explicitly, and omits `reinforcement`, which a partial update
    // carries over.
    await AgentConfigurationFactory.updateTestAgent(authenticator, agent.sId, {
      name: "After rename",
    });
    expect(await headFields(agent.sId)).toEqual({
      name: "After rename",
      status: "active",
      scope: "hidden",
      reinforcement: "off",
      templateId: null,
    });

    // In-place writers on the current row update the identity as well.
    const scopeResult = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "visible"
    );
    assert(scopeResult.isOk());
    expect((await headFields(agent.sId)).scope).toBe("visible");

    const resource = await AgentResource.fetchById(authenticator, agent.sId);
    assert(resource);
    const archiveResult = await resource.archive(authenticator);
    assert(archiveResult.isOk());
    expect((await headFields(agent.sId)).status).toBe("archived");

    const archived = await AgentResource.fetchById(authenticator, agent.sId);
    assert(archived);
    const restoreResult = await archived.restore(authenticator);
    assert(restoreResult.isOk());
    expect((await headFields(agent.sId)).status).toBe("active");
  });

  it("re-mirrors the head fields of the version restored by a rollback", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const template = await TemplateFactory.published();
    const firstVersion = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Before rename",
        scope: "hidden",
        templateId: template.sId,
        reinforcement: "off",
      }
    );
    const secondVersion = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId,
      { name: "After rename" }
    );
    expect(secondVersion.version).toBe(1);

    const identityAfterUpgrade = await AgentModel.findOne({
      where: { sId: firstVersion.sId, workspaceId: workspace.id },
    });
    assert(identityAfterUpgrade);
    expect(identityAfterUpgrade.templateId).toBeNull();
    expect(identityAfterUpgrade.name).toBe("After rename");

    // Deleting the current version makes the previous one current again, so the identity has to
    // pick its head fields back up.
    await hardDeleteAgentVersion(authenticator, secondVersion);

    const identityAfterRollback = await AgentModel.findOne({
      where: { sId: firstVersion.sId, workspaceId: workspace.id },
    });
    assert(identityAfterRollback);
    expect(identityAfterRollback.currentVersion).toBe(0);
    expect(identityAfterRollback.templateId).toBe(template.id);
    expect(identityAfterRollback.reinforcement).toBe("off");
    expect(identityAfterRollback.scope).toBe("hidden");
    expect(identityAfterRollback.name).toBe("Before rename");
  });

  it("stores a draft agent as hidden on both the identity and its configuration", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const user = authenticator.getNonNullableUser();

    // A builder "try" preview is saved as a draft: whatever scope the form carries, it is persisted
    // hidden so an unpublished agent is never visible (see `agent-publish-capability`).
    const result = await AgentResource.makeNew(authenticator, {
      name: "Draft preview",
      description: "Draft preview description",
      instructions: "Draft instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "draft",
      scope: "visible",
      model: {
        providerId: "openai",
        modelId: "gpt-5-mini",
        temperature: 0.7,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });
    assert(result.isOk());

    const configuration = await AgentConfigurationModel.findOne({
      where: { sId: result.value.sId, workspaceId: workspace.id },
    });
    const identity = await AgentModel.findOne({
      where: { sId: result.value.sId, workspaceId: workspace.id },
    });
    assert(configuration && identity);

    expect(configuration.scope).toBe("hidden");
    expect(identity.scope).toBe("hidden");
    expect(identity.status).toBe("draft");
  });

  it("keeps a pending identity at version 0 through activation", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pending = await AgentResource.createPending(authenticator);
    assert(pending.isOk());
    const identityBefore = await AgentModel.findOne({
      where: { sId: pending.value.sId, workspaceId: workspace.id },
    });
    expect(identityBefore?.currentVersion).toBe(0);
    expect(identityBefore?.status).toBe("pending");
    expect(identityBefore?.name).toBe("__PENDING__");
    expect(identityBefore?.scope).toBe("hidden");

    // Activation updates the pending row in place, so the version does not move.
    const activated = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      pending.value.sId,
      { name: "Activated" }
    );
    const identityAfter = await AgentModel.findOne({
      where: { sId: pending.value.sId, workspaceId: workspace.id },
    });
    expect(activated.version).toBe(0);
    expect(identityAfter?.currentVersion).toBe(0);
    // The in-place activation does not move the pointer, so the head fields have to be mirrored on
    // their own. `scope` stays `hidden`: the factory updates the definition without publishing.
    expect(identityAfter?.status).toBe("active");
    expect(identityAfter?.name).toBe("Activated");
    expect(identityAfter?.scope).toBe("hidden");
  });

  it("deletes the identity and grants only after its last version is deleted", async () => {
    const { authenticator, globalGroup, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const secondVersion = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );
    const agentResource = await AgentResource.fetchById(
      authenticator,
      firstVersion.sId
    );
    assert(agentResource !== null);
    if (agentResource.id === null) {
      throw new Error("Agent identity was not created");
    }
    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        {
          grantType: "editor",
          resourceType: "agent",
          resourceId: agentResource.id,
        }
      );
    if (!grantGroup) {
      throw new Error("Agent editor grant was not created");
    }
    const replaceResult = await DiscoveryItemResource.setPinnedForGroup(
      authenticator,
      {
        groupModelId: globalGroup.id,
        item: { type: "agent", itemId: firstVersion.sId, position: 0 },
      }
    );
    expect(replaceResult.isOk()).toBe(true);

    await hardDeleteAgentVersion(authenticator, secondVersion);
    expect(
      await AgentModel.findOne({
        where: { sId: firstVersion.sId, workspaceId: workspace.id },
      })
    ).not.toBeNull();
    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        grantGroup.id,
      ])
    ).toHaveLength(1);
    expect(
      await GroupPinnedItemModel.count({
        where: {
          workspaceId: workspace.id,
          type: "agent",
          itemId: firstVersion.sId,
        },
      })
    ).toBe(1);

    await hardDeleteAgentVersion(authenticator, firstVersion);
    expect(
      await AgentModel.findOne({
        where: { sId: firstVersion.sId, workspaceId: workspace.id },
      })
    ).toBeNull();
    expect(
      await GroupResource.dangerouslyFetchByModelIds(authenticator, [
        grantGroup.id,
      ])
    ).toHaveLength(0);
    expect(
      await GroupPinnedItemModel.count({
        where: {
          workspaceId: workspace.id,
          type: "agent",
          itemId: firstVersion.sId,
        },
      })
    ).toBe(0);
  });
});

describe("saveAgentConfiguration with pending agent", () => {
  it("converts pending agent to active when agentConfigurationId points to a pending agent", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, { role: "user" });

    // Create a pending agent using the helper function
    const pendingAgentRes = await AgentResource.createPending(authenticator);
    if (pendingAgentRes.isErr()) {
      throw pendingAgentRes.error;
    }
    const { sId: pendingId } = pendingAgentRes.value;

    const pendingAgent = await AgentConfigurationModel.findOne({
      where: { sId: pendingId, workspaceId: workspace.id },
    });
    if (!pendingAgent) {
      throw new Error("Pending agent was not created");
    }
    const [pendingAgentResource] =
      await AgentResource.dangerouslyFromConfigurationModels(authenticator, [
        pendingAgent,
      ]);
    if (!pendingAgentResource.id) {
      throw new Error("Pending agent identity was not created");
    }
    const pendingGrantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        {
          grantType: "editor",
          resourceType: "agent",
          resourceId: pendingAgentResource.id,
        }
      );
    expect(pendingGrantGroup).not.toBeNull();
    if (!pendingGrantGroup) {
      throw new Error("Pending agent editor grant was not created");
    }
    expect(
      (await pendingGrantGroup.getActiveMembers(authenticator)).map(
        (editor) => editor.sId
      )
    ).toEqual([user.sId]);
    // Convert the pending agent to active by passing its sId as agentConfigurationId
    const result = await saveAgentConfiguration(authenticator, {
      name: "My New Agent",
      description: "A test agent",
      instructions: "Test instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.5,
      },
      agentConfigurationId: pendingId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON(), newEditor.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sId).toBe(pendingId);
      expect(result.value.status).toBe("active");
      expect(result.value.name).toBe("My New Agent");
      expect(result.value.description).toBe("A test agent");
    }

    const agent = await AgentConfigurationModel.findOne({
      where: { sId: pendingId, workspaceId: workspace.id },
    });
    expect(agent).not.toBeNull();
    if (!agent) {
      throw new Error("Pending agent was not converted");
    }
    expect(agent.status).toBe("active");
    expect(agent.name).toBe("My New Agent");
    expect(agent.version).toBe(0); // Version should remain 0 (updated in place)
    expect(
      new Set(
        (await pendingGrantGroup.getActiveMembers(authenticator)).map(
          (editor) => editor.sId
        )
      )
    ).toEqual(new Set([user.sId, newEditor.sId]));

    await AgentConfigurationFactory.updateTestAgent(authenticator, pendingId);
    expect(
      (await pendingGrantGroup.getActiveMembers(authenticator)).map(
        (editor) => editor.sId
      )
    ).toEqual([user.sId]);
  });

  it("rejects changing a pending agent's scope", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pending = await AgentResource.createPending(authenticator);
    assert(pending.isOk());
    const resource = await AgentResource.fetchById(
      authenticator,
      pending.value.sId
    );
    assert(resource?.isFull());

    const result = await resource.updateConfiguration(authenticator, {
      scope: "visible",
    });

    assert(result.isErr());
    expect(result.error.message).toBe("Only active agents can change scope.");
    const row = await AgentConfigurationModel.findOne({
      where: { sId: pending.value.sId, workspaceId: workspace.id },
    });
    expect(row?.scope).toBe("hidden");
  });

  it("requires publish to activate a legacy visible pending agent", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularAuto(
      workspace,
      "pending-agent-creators"
    );
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      grantType: "create",
      resourceType: "agent",
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await GroupFactory.withMembers(internalAuth, group, [user]);
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(authenticator.hasWorkspacePermission("publish", "agent")).toBe(
      false
    );
    const pending = await AgentResource.createPending(authenticator);
    assert(pending.isOk());

    // Simulate a pending agent made visible before non-active scopes were restricted.
    await AgentConfigurationModel.update(
      { scope: "visible" },
      {
        where: { sId: pending.value.sId, workspaceId: workspace.id },
      }
    );
    await AgentResource.invalidateCache(workspace.id, pending.value.sId);

    const result = await saveAgentConfiguration(authenticator, {
      name: "My New Agent",
      description: "A test agent",
      instructions: "Test instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "visible",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.5,
      },
      agentConfigurationId: pending.value.sId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    assert(result.isErr());
    expect(result.error.message).toBe(
      "You don't have permission to publish agents."
    );
    const row = await AgentConfigurationModel.findOne({
      where: { sId: pending.value.sId, workspaceId: workspace.id },
    });
    expect(row).toMatchObject({ status: "pending", scope: "visible" });
  });

  it("returns an error when agentConfigurationId does not exist", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });

    const nonExistentId = generateRandomModelSId();

    // `updateConfiguration` is an instance method reached through a read-gated fetch, so an id that
    // resolves to no agent cannot be saved (it no longer falls through to creating a new agent).
    const result = await saveAgentConfiguration(authenticator, {
      name: "Fallback Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: nonExistentId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Agent configuration not found.");
    }
  });

  it("returns error when trying to update pending agent owned by different user", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    // Create another user in the same workspace. Role is irrelevant to what this test asserts
    // (ownership of the pending agent), so use "admin" to bypass the create-agent capability
    // check in createPendingAgentConfiguration.
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "admin",
    });
    const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    // Create a pending agent owned by the other user using the helper function
    const otherPendingAgentRes =
      await AgentResource.createPending(otherAuthenticator);
    if (otherPendingAgentRes.isErr()) {
      throw otherPendingAgentRes.error;
    }
    const { sId: pendingId } = otherPendingAgentRes.value;

    // Should return an error because pending agents owned by other users cannot be updated
    const result = await saveAgentConfiguration(authenticator, {
      name: "My Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: pendingId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    // The caller is not the author, an editor, nor a reader of the other user's (hidden) pending
    // agent, so the read-gated fetch in front of `updateConfiguration` rejects the save.
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Agent configuration not found.");
    }
  });

  it("creates new version if agent is not in pending status", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });

    // Create an active agent (not pending) using the factory
    const existingAgent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const result = await saveAgentConfiguration(authenticator, {
      name: "Updated Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      // Keep the agent's current scope: this test is about a definition change bumping the version,
      // not about (un)publishing (which would need the `publish` capability the caller lacks).
      scope: "visible",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: existingAgent.sId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should have created a new version since the agent is not pending
      expect(result.value.sId).toBe(existingAgent.sId);
      expect(result.value.name).toBe("Updated Agent");
      expect(result.value.version).toBe(1); // Version bumped
    }
  });

  it("preserves suggestions when converting pending agent to active", async () => {
    // Role is irrelevant to what this test asserts (suggestion preservation across the
    // pending-to-active conversion), so use "admin" to bypass the create-agent capability check.
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });
    const pendingAgentRes = await AgentResource.createPending(authenticator);
    if (pendingAgentRes.isErr()) {
      throw pendingAgentRes.error;
    }
    const { sId: pendingId } = pendingAgentRes.value;
    const pendingAgent = await getAgentConfiguration(authenticator, {
      agentId: pendingId,
      variant: "light",
    });
    expect(pendingAgent).not.toBeNull();

    const originalAgentId = pendingAgent!.id;

    await AgentSuggestionFactory.createInstructions(
      authenticator,
      pendingAgent!,
      {
        suggestion: {
          content: "<p>new</p>",
          targetBlockId: "1234",
          type: "replace",
        },
      }
    );

    const result = await saveAgentConfiguration(authenticator, {
      name: "Agent From Pending With Suggestions",
      description: "Test agent",
      instructions: "Test instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.5,
      },
      agentConfigurationId: pendingId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sId).toBe(pendingId);
      expect(result.value.status).toBe("active");
      expect(result.value.id).toBe(originalAgentId);

      const suggestionsAfter =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          result.value.sId
        );
      expect(suggestionsAfter).toHaveLength(1);
    }
  });
});

describe("create agent capability", () => {
  async function memberAuthInGroup(
    workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"],
    group?: Awaited<ReturnType<typeof GroupFactory.regularAuto>>
  ) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    if (group) {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    return { authenticator, user };
  }

  it("rejects creating a brand-new agent for a user without the capability", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const { authenticator, user } = await memberAuthInGroup(workspace);

    const result = await saveAgentConfiguration(authenticator, {
      name: "Unauthorized Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Creating agents is restricted.");
    }
  });

  it("rejects a nonexistent agentConfigurationId used to bypass the capability check", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const { authenticator, user } = await memberAuthInGroup(workspace);

    const result = await saveAgentConfiguration(authenticator, {
      name: "Unauthorized Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      // Doesn't match any real row. The read-gated fetch in front of `updateConfiguration` returns
      // nothing, so the save is rejected before it could reach the create branch — the id cannot be
      // used to bypass the create-agent capability.
      agentConfigurationId: generateRandomModelSId(),
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Agent configuration not found.");
    }
  });

  it("allows creating a brand-new agent for a user granted via a group", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularAuto(workspace, "agent-creators");
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      grantType: "create",
      resourceType: "agent",
    });
    const { authenticator, user } = await memberAuthInGroup(workspace, group);

    const result = await saveAgentConfiguration(authenticator, {
      name: "Authorized Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
  });

  it("does not gate creating a new version of an existing agent", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const existingAgent = await AgentConfigurationFactory.createTestAgent(
      adminAuth,
      { scope: "hidden" }
    );
    const { authenticator, user } = await memberAuthInGroup(workspace);
    // No capability grant for this user; only editing rights on the existing agent matter here.
    // Grant the agent's `editor` role (read + write + admin) so the user can read the agent — a
    // prerequisite for saving it — and is authorized to edit it without the create capability.
    const editResource = await AgentResource.fetchById(
      adminAuth,
      existingAgent.sId
    );
    assert(editResource !== null);
    const grantRes = await GroupPermissionResource.grantToUser(adminAuth, {
      user: user.toJSON(),
      resourceType: "agent",
      resourceId: editResource.id,
      grantType: "editor",
    });
    if (grantRes.isErr()) {
      throw grantRes.error;
    }
    await authenticator.refresh();

    const result = await saveAgentConfiguration(authenticator, {
      name: "Updated Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: existingAgent.sId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects createPendingAgentConfiguration for a user without the capability", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const { authenticator } = await memberAuthInGroup(workspace);

    const result = await AgentResource.createPending(authenticator);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Creating agents is restricted.");
    }
  });

  it("allows createPendingAgentConfiguration for a user granted via a group", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularAuto(workspace, "agent-creators");
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      grantType: "create",
      resourceType: "agent",
    });
    const { authenticator } = await memberAuthInGroup(workspace, group);

    const result = await AgentResource.createPending(authenticator);

    expect(result.isOk()).toBe(true);
  });
});

describe("AgentResource.archive and AgentResource.restore", () => {
  it("keeps editor grants active while archiving and restoring", async () => {
    const { authenticator, globalGroup, workspace } = await createResourceTest({
      role: "admin",
    });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agentResource = await AgentResource.fetchById(
      authenticator,
      agent.sId
    );
    assert(agentResource !== null);
    if (agentResource.id === null) {
      throw new Error("Agent identity was not created");
    }
    const editorGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        {
          grantType: "editor",
          resourceType: "agent",
          resourceId: agentResource.id,
        }
      );
    if (!editorGroup) {
      throw new Error("Agent editor grant was not created");
    }

    const membershipsBeforeArchive = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsBeforeArchive.length).toBeGreaterThan(0);
    expect(membershipsBeforeArchive.every((m) => m.status === "active")).toBe(
      true
    );

    const replaceResult = await DiscoveryItemResource.setPinnedForGroup(
      authenticator,
      {
        groupModelId: globalGroup.id,
        item: { type: "agent", itemId: agent.sId, position: 0 },
      }
    );
    expect(replaceResult.isOk()).toBe(true);

    const archived = await (await AgentResource.fetchById(
      authenticator,
      agent.sId
    ))!.archive(authenticator);
    expect(archived).toEqual(new Ok(true));
    expect(
      await DiscoveryItemResource.listPinnedForAuth(authenticator)
    ).toHaveLength(0);

    const membershipsAfterArchive = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsAfterArchive.every((m) => m.status === "active")).toBe(
      true
    );

    const editorsAfterArchive =
      await editorGroup.getActiveMembers(authenticator);
    expect(editorsAfterArchive.map((editor) => editor.id)).toEqual([
      authenticator.getNonNullableUser().id,
    ]);

    const restoreResult = await (await AgentResource.fetchById(
      authenticator,
      agent.sId
    ))!.restore(authenticator);
    expect(restoreResult.isOk()).toBe(true);
    expect(restoreResult.isOk() && restoreResult.value.restored).toBe(true);

    const membershipsAfterRestore = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsAfterRestore.every((m) => m.status === "active")).toBe(
      true
    );
  });

  it("restore returns error when agent is not archived", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const restoreResult = await (await AgentResource.fetchById(
      authenticator,
      agent.sId
    ))!.restore(authenticator);
    expect(restoreResult.isErr()).toBe(true);
    if (restoreResult.isErr()) {
      expect(restoreResult.error.message).toBe(
        "Agent configuration is not archived"
      );
    }
  });

  it("does not combine restoring an archived agent with a scope change", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "visible" }
    );
    expect(
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      )
    ).toEqual(new Ok(true));
    const archived = await AgentResource.fetchById(authenticator, agent.sId);
    assert(archived?.isFull());

    const result = await archived.updateConfiguration(authenticator, {
      status: "active",
      scope: "hidden",
    });

    assert(result.isErr());
    expect(result.error.message).toBe("Only active agents can change scope.");
    const row = await AgentConfigurationModel.findOne({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(row).toMatchObject({ status: "archived", scope: "visible" });
  });

  it("cancels scheduled wake-ups when archiving", async () => {
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));

    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });

    const wakeUp = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agent,
      {
        reason: "Daily wake-up",
      }
    );

    const archived = await (await AgentResource.fetchById(
      authenticator,
      agent.sId
    ))!.archive(authenticator);
    expect(archived).toEqual(new Ok(true));

    expect(cancelSpy).toHaveBeenCalled();
    const refetched = await WakeUpResource.fetchById(authenticator, wakeUp.sId);
    expect(refetched?.status).toBe("cancelled");

    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it("reconciles the leaked schedule of a terminal cron wake-up when archiving", async () => {
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));

    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });

    const wakeUp = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agent,
      {
        reason: "Daily wake-up",
      }
    );

    // Drive the wake-up to a terminal state via a DB-only cancel (markCancelled
    // does not touch Temporal), simulating a cron schedule that leaked when the
    // wake-up became terminal.
    await wakeUp.markCancelled(authenticator);

    // Only count the Temporal calls made by archiving.
    cancelSpy.mockClear();

    const archived = await (await AgentResource.fetchById(
      authenticator,
      agent.sId
    ))!.archive(authenticator);
    expect(archived).toEqual(new Ok(true));

    // Archive must reconcile the leaked schedule even though the row is already
    // terminal (it used to skip non-scheduled wake-ups entirely).
    expect(cancelSpy).toHaveBeenCalled();

    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});

describe("AgentResource.delete scoped-resource cleanup", () => {
  it("removes triggers, wake-ups and favorites for the agent", async () => {
    const mockCreateSchedule = vi
      .spyOn(scheduleClient, "createOrUpdateAgentSchedule")
      .mockResolvedValue(new Ok("workflow-id"));
    const mockDeleteSchedule = vi
      .spyOn(scheduleClient, "deleteTriggerSchedule")
      .mockResolvedValue(new Ok(undefined));
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));

    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      status: "enabled",
      configuration: {
        cron: "0 9 * * 1",
        timezone: "UTC",
      },
    });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    await WakeUpFactory.cron(authenticator, conversation, agent, {
      reason: "Daily wake-up",
    });

    const favoriteResource = await AgentResource.fetchById(
      authenticator,
      agent.sId
    );
    assert(favoriteResource !== null);
    const favoriteResult = await favoriteResource.setUserFavorite(
      authenticator,
      true
    );
    expect(favoriteResult.isOk()).toBe(true);

    await (await AgentResource.fetchById(authenticator, agent.sId))!.delete(
      authenticator
    );

    const remainingTriggers = await TriggerResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remainingTriggers).toHaveLength(0);

    const remainingWakeUps = await WakeUpResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remainingWakeUps).toHaveLength(0);

    const remainingFavoriteCount =
      await AgentUserRelationResource.countForAgent(authenticator, agent.sId);
    expect(remainingFavoriteCount).toBe(0);

    expect(mockDeleteSchedule).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();

    mockCreateSchedule.mockRestore();
    mockDeleteSchedule.mockRestore();
    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it("keeps the wake-up row when Temporal cancellation fails", async () => {
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    // Simulate a transient Temporal failure when cancelling the schedule.
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Err(new Error("temporal unavailable")));

    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    await WakeUpFactory.cron(authenticator, conversation, agent, {
      reason: "Daily wake-up",
    });

    await (await AgentResource.fetchById(authenticator, agent.sId))!.delete(
      authenticator
    );

    // The Temporal schedule could not be deleted, so the row must survive to
    // keep the wake-up id available for a retry / the reconciler.
    const remainingWakeUps = await WakeUpResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remainingWakeUps).toHaveLength(1);
    expect(remainingWakeUps[0].status).toBe("scheduled");

    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});

describe("updateAgentConfigurationsScope", () => {
  // Production seeds the "publish agents" capability to everybody (see governance_seeding); the test
  // harness does not. Grant it and rebuild the authenticator so it resolves the new grant — only
  // callers who hold `publish` on an agent may change its scope.
  async function withPublishCapability(
    test: Awaited<ReturnType<typeof createResourceTest>>
  ): Promise<Authenticator> {
    await GroupPermissionResource.setForEverybody(
      await Authenticator.internalAdminForWorkspace(test.workspace.sId),
      { grantType: "publish", resourceType: "agent" }
    );
    return Authenticator.fromUserIdAndWorkspaceId(
      test.user.sId,
      test.workspace.sId
    );
  }

  it("updates the scope of a single agent", async () => {
    const test = await createResourceTest({ role: "admin" });
    const { workspace } = test;
    const authenticator = await withPublishCapability(test);
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "hidden" }
    );

    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "visible"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("visible");
  });

  it("updates the scope of multiple agents in a single call", async () => {
    const test = await createResourceTest({ role: "admin" });
    const { workspace } = test;
    const authenticator = await withPublishCapability(test);
    const agents = await Promise.all([
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "A1",
        scope: "hidden",
      }),
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "A2",
        scope: "hidden",
      }),
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "A3",
        scope: "hidden",
      }),
    ]);

    const result = await updateAgentConfigurationsScope(
      authenticator,
      agents.map((a) => a.sId),
      "visible"
    );
    expect(result.isOk()).toBe(true);

    for (const a of agents) {
      const row = await AgentConfigurationModel.findOne({
        where: { sId: a.sId, workspaceId: workspace.id },
      });
      expect(row!.scope).toBe("visible");
    }
  });

  it("returns Ok without changes when agentIds is empty", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const result = await updateAgentConfigurationsScope(
      authenticator,
      [],
      "visible"
    );
    expect(result.isOk()).toBe(true);
  });

  it("skips agents the caller cannot edit and is not admin of", async () => {
    const { authenticator: ownerAuth, workspace } = await createResourceTest({
      role: "user",
    });
    const ownedAgent = await AgentConfigurationFactory.createTestAgent(
      ownerAuth,
      { name: "Owned", scope: "hidden" }
    );

    // Another builder who has no editing rights on the agent.
    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    const result = await updateAgentConfigurationsScope(
      outsiderAuth,
      [ownedAgent.sId],
      "visible"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: ownedAgent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("hidden");
  });

  it("disables non-editor triggers when hiding an agent", async () => {
    const test = await createResourceTest({
      plan: "creditPriced",
      role: "admin",
    });
    const { workspace, user } = test;
    const authenticator = await withPublishCapability(test);

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "visible" }
    );

    // A workspace member who does not have an editor grant on the agent.
    const nonEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonEditor, {
      role: "user",
    });

    // Trigger owned by the admin (an agent editor).
    const editorTriggerRes = await TriggerResource.makeNew(authenticator, {
      workspaceId: workspace.id,
      name: "editor-trigger",
      kind: "webhook",
      agentConfigurationId: agent.sId,
      editor: user.id,
      customPrompt: null,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId: null,
      origin: "user",
      executionMode: "user_pool",
    });
    expect(editorTriggerRes.isOk()).toBe(true);
    const editorTrigger = editorTriggerRes.isOk()
      ? editorTriggerRes.value
      : null;

    // Trigger owned by the non-editor user.
    const nonEditorTriggerRes = await TriggerResource.makeNew(authenticator, {
      workspaceId: workspace.id,
      name: "non-editor-trigger",
      kind: "webhook",
      agentConfigurationId: agent.sId,
      editor: nonEditor.id,
      customPrompt: null,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId: null,
      origin: "user",
      executionMode: "user_pool",
    });
    expect(nonEditorTriggerRes.isOk()).toBe(true);
    const nonEditorTrigger = nonEditorTriggerRes.isOk()
      ? nonEditorTriggerRes.value
      : null;

    expect(
      (
        await MembershipResource.revokeMembership({
          user: nonEditor,
          workspace,
        })
      ).isOk()
    ).toBe(true);
    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "hidden"
    );
    expect(result.isOk()).toBe(true);

    const refreshedEditorTrigger = await TriggerResource.fetchById(
      authenticator,
      editorTrigger!.sId
    );
    const refreshedNonEditorTrigger = await TriggerResource.fetchById(
      authenticator,
      nonEditorTrigger!.sId
    );

    expect(refreshedEditorTrigger!.status).toBe("enabled");
    expect(refreshedNonEditorTrigger!.status).toBe("disabled");
  });
});

describe("publish agent capability", () => {
  type TestAgent = Awaited<
    ReturnType<typeof AgentConfigurationFactory.createTestAgent>
  >;

  // Builds a non-admin editor of `agent` (so they can save new versions and pass the canEdit
  // filter). With `withPublishCapability`, grants the workspace-wide publish permission to a group
  // the user belongs to. Editing an existing agent is not create-gated, so no create grant is
  // needed here — this isolates the publish/unpublish check.
  async function editorAuthFor(
    workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"],
    agent: TestAgent,
    { withPublishCapability = false }: { withPublishCapability?: boolean } = {}
  ) {
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const agentResourceToSeed = await AgentResource.fetchById(
      adminAuth,
      agent.sId
    );
    assert(agentResourceToSeed);
    const seedEditors =
      (await agentResourceToSeed.listEditors(adminAuth)) ?? [];
    const result = await agentResourceToSeed.updateConfiguration(adminAuth, {
      editors: [...seedEditors.map((u) => u.toJSON()), user.toJSON()],
    });
    assert(result.isOk());

    if (withPublishCapability) {
      const group = await GroupFactory.regularAuto(workspace, "publishers");
      await GroupPermissionResource.grantTypeWide(adminAuth, {
        group,
        grantType: "publish",
        resourceType: "agent",
      });
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }

    // Created after all group memberships so the authenticator resolves them without a refresh.
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    return { authenticator, user };
  }

  async function saveVersionWithScope(
    auth: Authenticator,
    agent: TestAgent,
    user: Awaited<ReturnType<typeof UserFactory.basic>>,
    scope: "hidden" | "visible"
  ) {
    return saveAgentConfiguration(auth, {
      name: agent.name,
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: agent.sId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });
  }

  it("rejects publishing (hidden → visible) for an editor without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent);

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "visible"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to publish agents."
      );
    }
  });

  it("allows publishing (hidden → visible) for an editor granted the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent, {
      withPublishCapability: true,
    });

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "visible"
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects unpublishing (visible → hidden) for an editor without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent);

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "hidden"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to publish agents."
      );
    }
  });

  it("allows unpublishing (visible → hidden) for an editor granted the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent, {
      withPublishCapability: true,
    });

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "hidden"
    );
    expect(result.isOk()).toBe(true);
  });

  it("does not gate a new version that keeps the agent visible", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent);

    // The published state does not change, so no publish permission is required to edit.
    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "visible"
    );
    expect(result.isOk()).toBe(true);
  });

  it("skips a bulk scope change to visible without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator } = await editorAuthFor(workspace, agent);

    // The editor can edit the agent but lacks the publish capability, so the resource skips it and
    // the scope is left unchanged.
    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "visible"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("hidden");
  });

  it("skips a bulk scope change to hidden without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator } = await editorAuthFor(workspace, agent);

    // The editor can edit the agent but lacks the publish capability, so the resource skips it and
    // the scope is left unchanged.
    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "hidden"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("visible");
  });

  it("allows a bulk scope change for an editor granted the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator } = await editorAuthFor(workspace, agent, {
      withPublishCapability: true,
    });

    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "visible"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("visible");
  });
});

it("revokes grant-only editors when saving the complete editor set", async () => {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "user",
  });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const editor = await UserFactory.basic();
  await MembershipFactory.associate(workspace, editor, { role: "user" });
  const resource = await AgentResource.fetchById(auth, agent.sId);
  assert(resource !== null);
  assert(resource.id !== null);
  assert(
    (
      await GroupPermissionResource.grantToUser(auth, {
        user: editor.toJSON(),
        resourceType: "agent",
        resourceId: resource.id,
        grantType: "editor",
      })
    ).isOk()
  );
  await AgentConfigurationFactory.updateTestAgent(auth, agent.sId);
  expect((await getEditors(auth, agent)).map((user) => user.id)).not.toContain(
    editor.id
  );
  const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
    editor.sId,
    workspace.sId
  );
  expect(
    (
      await getAgentConfiguration(editorAuth, {
        agentId: agent.sId,
        variant: "light",
      })
    )?.canEdit
  ).toBe(false);
});
