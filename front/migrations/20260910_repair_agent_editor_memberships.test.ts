import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import logger from "@app/logger/logger";
import { repairEditorMemberships } from "@app/migrations/20260910_repair_agent_editor_memberships";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { literal, Op } from "sequelize";
import { afterEach, describe, expect, it, vi } from "vitest";

const REVOKED_AT = new Date("2026-05-02T12:00:00Z");

async function seedRevokedEditor() {
  vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
  const {
    authenticator: auth,
    workspace,
    user,
  } = await createResourceTest({ role: "admin" });
  const original = await AgentConfigurationFactory.createTestAgent(auth);
  const agent = await AgentConfigurationFactory.updateTestAgent(
    auth,
    original.sId
  );
  const legacy = await GroupResource.findEditorGroupForAgent(auth, agent);
  assert(legacy.isOk());
  const resource = await AgentResource.fetchByAgentConfiguration(auth, agent);
  assert(resource.id !== null);
  const grant = {
    grantType: "editor" as const,
    resourceType: "agent" as const,
    resourceId: resource.id,
  };
  const target = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    grant
  );
  assert(target);
  const unrelated = await UserFactory.basic();
  await MembershipFactory.associate(workspace, unrelated, { role: "user" });
  const added = await legacy.value.dangerouslyAddMember(auth, {
    user: unrelated.toJSON(),
  });
  assert(added.isOk());
  vi.setSystemTime(REVOKED_AT);
  for (const group of [legacy.value, target]) {
    const removed = await group.dangerouslyRemoveMember(auth, {
      user: user.toJSON(),
    });
    assert(removed.isOk());
  }
  const revoked = await MembershipResource.revokeMembership({
    user,
    workspace,
    allowLastAdminRevocation: true,
  });
  assert(revoked.isOk());
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  return {
    agent,
    auth,
    workspace,
    user,
    unrelated,
    grant,
    target,
    legacy: legacy.value,
  };
}

describe("repairEditorMemberships", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    false,
    true,
  ])("repairs never-ended editor memberships (already rejoined: %s)", async (rejoined) => {
    const { auth, workspace, user, unrelated, grant, target, legacy } =
      await seedRevokedEditor();
    // Reproduce workspace-only revocation: no ended memberships remain in the legacy group.
    await GroupMembershipModel.update(
      { endAt: null },
      {
        where: {
          workspaceId: workspace.id,
          groupId: legacy.id,
          userId: user.id,
        },
      }
    );
    if (rejoined) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
    } else {
      assert((await target.delete(auth)).isOk());
    }
    const before = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(before.getGrantedVerbs("agent", grant.resourceId)).not.toContain(
      "write"
    );
    const spec = {
      wId: workspace.sId,
      logger: logger.child({}, { level: "silent" }),
    };
    for (const execute of [false, false, true]) {
      await expect(
        repairEditorMemberships({ ...spec, execute })
      ).resolves.toEqual({ ended: 0, active: 1 });
    }
    await expect(
      repairEditorMemberships({ ...spec, execute: true })
    ).resolves.toEqual({ ended: 0, active: 0 });
    const repaired = await GroupPermissionResource.findRegularAutoGroupForGrant(
      auth,
      grant
    );
    assert(repaired);
    expect(await repaired.isMember(unrelated)).toBe(false);
    expect((await repaired.getActiveMembers(auth)).map(({ id }) => id)).toEqual(
      rejoined ? [user.id] : []
    );
    const after = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(
      after.getGrantedVerbs("agent", grant.resourceId).includes("write")
    ).toBe(rejoined);

    if (!rejoined) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const restored = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      expect(restored.getGrantedVerbs("agent", grant.resourceId)).toContain(
        "write"
      );
    }
  });

  it("rebuilds orphans from all current legacy editors and legacy history", async () => {
    const {
      auth,
      workspace,
      user,
      unrelated: currentEditor,
      grant,
      target,
      legacy,
    } = await seedRevokedEditor();
    await GroupPermissionResource.revoke(auth, { ...grant, group: target });
    const staleEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, staleEditor, { role: "user" });
    assert(
      (
        await target.dangerouslyAddMember(auth, { user: staleEditor.toJSON() })
      ).isOk()
    );
    // Legacy can retain an unended group row for a revoked workspace member.
    await GroupMembershipModel.create({
      workspaceId: workspace.id,
      groupId: legacy.id,
      userId: user.id,
      status: "active",
      startAt: REVOKED_AT,
    });
    const spec = {
      wId: workspace.sId,
      logger: logger.child({}, { level: "silent" }),
    };
    await expect(
      repairEditorMemberships({ ...spec, execute: false })
    ).resolves.toEqual({ ended: 1, active: 2 });
    expect(await target.isMember(staleEditor)).toBe(true);
    expect(
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, grant)
    ).toBeNull();

    await expect(
      repairEditorMemberships({ ...spec, execute: true })
    ).resolves.toEqual({ ended: 1, active: 2 });
    const rebuilt = await GroupPermissionResource.findRegularAutoGroupForGrant(
      auth,
      grant
    );
    assert(rebuilt);
    expect(rebuilt.id).not.toBe(target.id);
    expect(
      await GroupResource.dangerouslyFetchByModelIds(auth, [target.id])
    ).toHaveLength(0);
    expect((await rebuilt.getActiveMembers(auth)).map(({ id }) => id)).toEqual([
      currentEditor.id,
    ]);
    expect(await rebuilt.isMember(user)).toBe(true);
    const history = await GroupMembershipModel.findOne({
      where: {
        workspaceId: workspace.id,
        groupId: rebuilt.id,
        userId: user.id,
        endAt: REVOKED_AT,
      },
    });
    assert(history);
    expect(history.startAt.getTime()).toBeLessThan(REVOKED_AT.getTime());
    await expect(
      repairEditorMemberships({ ...spec, execute: true })
    ).resolves.toEqual({ ended: 0, active: 0 });
  });

  it("refuses to delete a colliding group that still has a grant", async () => {
    const { auth, workspace, grant, target } = await seedRevokedEditor();
    await GroupPermissionResource.revoke(auth, { ...grant, group: target });
    await GroupPermissionResource.grantTypeWide(auth, {
      group: target,
      grantType: "create",
      resourceType: "agent",
    });
    await expect(
      repairEditorMemberships({
        wId: workspace.sId,
        logger: logger.child({}, { level: "silent" }),
        execute: true,
      })
    ).rejects.toThrow("Colliding group still has grants.");
    expect(
      await GroupResource.dangerouslyFetchByModelIds(auth, [target.id])
    ).toHaveLength(1);
    expect(
      await GroupPermissionResource.listForGroup(auth, target)
    ).toHaveLength(1);
  });

  it("compares exact end timestamps and copies the earliest duplicate only once", async () => {
    const { workspace, user, legacy, target } = await seedRevokedEditor();
    const where = {
      workspaceId: workspace.id,
      groupId: legacy.id,
      userId: user.id,
    };
    await GroupMembershipModel.create({
      ...where,
      status: "active",
      startAt: REVOKED_AT,
      endAt: REVOKED_AT,
    });
    // Both source rows now end one microsecond after the already-copied target history.
    await GroupMembershipModel.update(
      { endAt: literal("\"endAt\" + INTERVAL '1 microsecond'") },
      { where: { ...where, endAt: REVOKED_AT } }
    );
    const spec = {
      wId: workspace.sId,
      logger: logger.child({}, { level: "silent" }),
    };
    for (const execute of [false, true]) {
      await expect(
        repairEditorMemberships({ ...spec, execute })
      ).resolves.toEqual({ ended: 1, active: 0 });
    }
    await expect(
      repairEditorMemberships({ ...spec, execute: true })
    ).resolves.toEqual({ ended: 0, active: 0 });
    const copied = await GroupMembershipModel.findOne({
      where: { ...where, groupId: target.id, endAt: { [Op.gt]: REVOKED_AT } },
    });
    assert(copied);
    expect(copied.startAt.getTime()).toBeLessThan(REVOKED_AT.getTime());
  });

  it("uses the latest non-draft configuration's editor group", async () => {
    const { auth, workspace, agent, target } = await seedRevokedEditor();
    assert((await target.delete(auth)).isOk());
    await GroupAgentModel.destroy({
      where: { workspaceId: workspace.id, agentConfigurationId: agent.id },
    });
    const spec = {
      wId: workspace.sId,
      logger: logger.child({}, { level: "silent" }),
      execute: false,
    };
    await expect(repairEditorMemberships(spec)).resolves.toEqual({
      ended: 0,
      active: 0,
    });
    await AgentConfigurationModel.update(
      { status: "draft" },
      { where: { workspaceId: workspace.id, id: agent.id } }
    );
    await expect(repairEditorMemberships(spec)).resolves.toEqual({
      ended: 1,
      active: 0,
    });
  });

  it.each([
    false,
    true,
  ])("repairs only affected editors (already rejoined: %s)", async (rejoined) => {
    const { auth, workspace, user, unrelated, grant, target, legacy } =
      await seedRevokedEditor();
    if (rejoined) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
      const restored = await legacy.dangerouslyAddMember(auth, {
        user: user.toJSON(),
      });
      assert(restored.isOk());
    } else {
      assert((await target.delete(auth)).isOk());
    }
    const spec = {
      wId: workspace.sId,
      logger: logger.child({}, { level: "silent" }),
    };
    const expected = rejoined
      ? { ended: 0, active: 1 }
      : { ended: 1, active: 0 };
    for (const execute of [false, false, true]) {
      await expect(
        repairEditorMemberships({ ...spec, execute })
      ).resolves.toEqual(expected);
    }
    await expect(
      repairEditorMemberships({ ...spec, execute: true })
    ).resolves.toEqual({ ended: 0, active: 0 });
    const repaired = await GroupPermissionResource.findRegularAutoGroupForGrant(
      auth,
      grant
    );
    assert(repaired);
    expect(await repaired.isMember(user)).toBe(rejoined);
    expect(await repaired.isMember(unrelated)).toBe(false);

    if (!rejoined) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
      await GroupResource.dangerouslyRestoreGroupMembershipsRevokedWith({
        user,
        workspace,
        revokedAt: REVOKED_AT,
      });
      expect(await repaired.isMember(user)).toBe(true);
    }
    expect(await legacy.isMember(unrelated)).toBe(true);
  });
});
