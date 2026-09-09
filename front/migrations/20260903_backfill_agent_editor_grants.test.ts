import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { backfillAgentEditorGrants } from "@app/migrations/20260903_backfill_agent_editor_grants";
import baseLogger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { afterEach, describe, expect, it, vi } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

describe("backfillAgentEditorGrants", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    true,
    false,
  ])("preserves revoked editors for rejoin (existing grant group: %s)", async (keepGrantGroup) => {
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const legacyGroup = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    assert(legacyGroup.isOk());
    const agentResource = await AgentResource.fetchByAgentConfiguration(
      authenticator,
      agent
    );
    assert(agentResource.id !== null);
    const grant = {
      grantType: "editor" as const,
      resourceType: "agent" as const,
      resourceId: agentResource.id,
    };
    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        grant
      );
    assert(grantGroup);

    const removedEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, removedEditor, {
      role: "user",
    });
    assert(
      (
        await legacyGroup.value.dangerouslyAddMember(authenticator, {
          user: removedEditor.toJSON(),
        })
      ).isOk()
    );
    assert(
      (
        await legacyGroup.value.dangerouslyRemoveMembers(authenticator, {
          users: [removedEditor.toJSON()],
        })
      ).isOk()
    );

    const revokedAt = new Date("2026-05-02T12:00:00Z");
    vi.setSystemTime(revokedAt);
    assert(
      (
        await legacyGroup.value.dangerouslyRemoveMembers(authenticator, {
          users: [user.toJSON()],
        })
      ).isOk()
    );
    assert(
      (
        await grantGroup.dangerouslyRemoveMembers(authenticator, {
          users: [user.toJSON()],
        })
      ).isOk()
    );
    for (const editor of [user, removedEditor]) {
      assert(
        (
          await MembershipResource.revokeMembership({
            user: editor,
            workspace,
            allowLastAdminRevocation: true,
          })
        ).isOk()
      );
    }
    if (!keepGrantGroup) {
      assert((await grantGroup.delete(authenticator)).isOk());
    }

    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
    const spec = { workspace, logger };
    const expectedHistory = keepGrantGroup ? 1 : 2;
    for (const execute of [false, false, true]) {
      await expect(
        backfillAgentEditorGrants({ ...spec, execute })
      ).resolves.toMatchObject({
        editorGrantsToAdd: 0,
        endedMembershipsToAdd: expectedHistory,
        mismatchedAgentCount: 0,
      });
    }
    await expect(
      backfillAgentEditorGrants({ ...spec, execute: true })
    ).resolves.toMatchObject({ endedMembershipsToAdd: 0 });
    const migratedGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        grant
      );
    assert(migratedGroup);
    expect(await migratedGroup.isMember(user)).toBe(false);
    expect(await migratedGroup.isMember(removedEditor)).toBe(false);

    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    for (const editor of [user, removedEditor]) {
      await MembershipFactory.associate(workspace, editor, { role: "user" });
      await GroupResource.dangerouslyRestoreGroupMembershipsRevokedWith({
        user: editor,
        workspace,
        revokedAt,
      });
    }
    expect(
      (await migratedGroup.getActiveMembers(authenticator)).map(({ id }) => id)
    ).toEqual([user.id]);
    await expect(
      backfillAgentEditorGrants({ ...spec, execute: true })
    ).resolves.toMatchObject({
      editorGrantsToAdd: 0,
      editorGrantsToRemove: 0,
      endedMembershipsToAdd: 0,
      mismatchedAgentCount: 0,
    });
  });

  it("treats a missing legacy editor group as empty through execute and rerun", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const legacyGroup = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    assert(legacyGroup.isOk());
    expect((await legacyGroup.value.delete(authenticator)).isOk()).toBe(true);

    await expect(
      backfillAgentEditorGrants({ execute: false, logger, workspace })
    ).resolves.toMatchObject({
      editorGrantsToRemove: 1,
      mismatchedAgentCount: 1,
    });

    await expect(
      backfillAgentEditorGrants({ execute: true, logger, workspace })
    ).resolves.toMatchObject({
      editorGrantsToRemove: 1,
      mismatchedAgentCount: 0,
    });
    await expect(
      backfillAgentEditorGrants({ execute: true, logger, workspace })
    ).resolves.toMatchObject({
      editorGrantsToAdd: 0,
      editorGrantsToRemove: 0,
      mismatchedAgentCount: 0,
    });
    const afterRerun = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    assert(afterRerun.isErr());
    expect(afterRerun.error.code).toBe("group_not_found");
  });

  it("syncs archived agents from their latest legacy group", async () => {
    const {
      authenticator,
      user: author,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const [legacyOnlyEditor, grantOnlyEditor, staleEditor] = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);
    await Promise.all([
      MembershipFactory.associate(workspace, legacyOnlyEditor, {
        role: "user",
      }),
      MembershipFactory.associate(workspace, grantOnlyEditor, {
        role: "user",
      }),
      MembershipFactory.associate(workspace, staleEditor, { role: "user" }),
    ]);

    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agent = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );
    const legacyGroupResult = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    if (legacyGroupResult.isErr()) {
      throw legacyGroupResult.error;
    }
    const legacyGroup = legacyGroupResult.value;
    const addLegacyEditor = await legacyGroup.dangerouslyAddMember(
      authenticator,
      { user: legacyOnlyEditor.toJSON() }
    );
    if (addLegacyEditor.isErr()) {
      throw addLegacyEditor.error;
    }
    const firstVersionModel = await AgentConfigurationModel.findOne({
      where: { id: firstVersion.id, workspaceId: workspace.id },
    });
    assert(firstVersionModel);
    // A stale group linked only to an obsolete version must not contribute grants.
    const staleGroup = await GroupResource.makeNew(
      {
        workspaceId: workspace.id,
        name: `Stale editors ${agent.sId}`,
        kind: "agent_editors",
      },
      { memberIds: [staleEditor.id] }
    );
    const staleLink = await staleGroup.addGroupToAgentConfiguration({
      auth: authenticator,
      agentConfiguration: firstVersionModel,
    });
    if (staleLink.isErr()) {
      throw staleLink.error;
    }

    const agentResource = await AgentResource.fetchByAgentConfiguration(
      authenticator,
      agent
    );
    assert(agentResource.id !== null);
    const resourceId = agentResource.id;
    const addGrantEditor = await GroupPermissionResource.grantToUser(
      authenticator,
      {
        user: grantOnlyEditor.toJSON(),
        grantType: "editor",
        resourceType: "agent",
        resourceId,
      }
    );
    if (addGrantEditor.isErr()) {
      throw addGrantEditor.error;
    }
    expect(await archiveAgentConfiguration(authenticator, agent.sId)).toBe(
      true
    );

    const dryRun = await backfillAgentEditorGrants({
      execute: false,
      logger,
      workspace,
    });
    expect(dryRun).toEqual({
      agentCount: 1,
      editorGrantsToAdd: 1,
      editorGrantsToRemove: 1,
      endedMembershipsToAdd: 0,
      mismatchedAgentCount: 1,
    });

    const firstRun = await backfillAgentEditorGrants({
      execute: true,
      logger,
      workspace,
    });
    expect(firstRun).toEqual({
      agentCount: 1,
      editorGrantsToAdd: 1,
      editorGrantsToRemove: 1,
      endedMembershipsToAdd: 0,
      mismatchedAgentCount: 0,
    });

    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        { grantType: "editor", resourceType: "agent", resourceId }
      );
    assert(grantGroup);
    expect(
      (await grantGroup.getActiveMembers(authenticator))
        .map(({ sId }) => sId)
        .sort()
    ).toEqual([author.sId, legacyOnlyEditor.sId].sort());

    await expect(
      backfillAgentEditorGrants({ execute: true, logger, workspace })
    ).resolves.toMatchObject({
      editorGrantsToAdd: 0,
      editorGrantsToRemove: 0,
      mismatchedAgentCount: 0,
    });
  });
});
