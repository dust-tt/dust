import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import { repairEditorMemberships } from "@app/migrations/20260910_repair_agent_editor_memberships";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
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
