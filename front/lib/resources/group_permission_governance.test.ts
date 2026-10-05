import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { getNamespace } from "@app/tests/utils/test_cls";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import assert from "assert";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, it } from "vitest";

// A concrete capability used across the governance-state tests.
const CAPABILITY = { grantType: "create", resourceType: "agent" } as const;

describe("GroupPermissionResource — governance state (reads)", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let globalGroup: GroupResource;
  let groupA: GroupResource;
  let groupB: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    groupA = await GroupFactory.regularAuto(workspace, "A");
    groupB = await GroupFactory.regularAuto(workspace, "B");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const fetched = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    assert(fetched.isOk(), "global group should exist");
    globalGroup = fetched.value;
  });

  const stateOf = async (capability: typeof CAPABILITY) =>
    (
      await GroupPermissionResource.getCapabilitiesState(auth, [capability])
    ).get(`${capability.grantType}:${capability.resourceType}`);

  it("reports disabled when there is no -1 row", async () => {
    expect(await stateOf(CAPABILITY)).toEqual({ scope: "admins_only" });
  });

  it("reports everyone when the global group holds the -1 row", async () => {
    await GroupPermissionResource.grantTypeWide(auth, {
      group: globalGroup,
      ...CAPABILITY,
    });

    expect(await stateOf(CAPABILITY)).toEqual({ scope: "everyone" });
  });

  it("reports the specific groups when non-global groups hold -1 rows", async () => {
    await GroupPermissionResource.grantTypeWideForGroups(auth, {
      groups: [groupA, groupB],
      ...CAPABILITY,
    });

    const state = await stateOf(CAPABILITY);
    assert(state?.scope === "groups", "expected groups scope");
    expect(new Set(state.groups.map((g) => g.id))).toEqual(
      new Set([groupA.id, groupB.id])
    );
  });

  it("resolves multiple capabilities in one call", async () => {
    const everyoneCap = {
      grantType: "publish",
      resourceType: "agent",
    } as const;
    const groupsCap = {
      grantType: "create",
      resourceType: "skill",
    } as const;
    const disabledCap = {
      grantType: "admin",
      resourceType: "billing",
    } as const;
    await GroupPermissionResource.grantTypeWide(auth, {
      group: globalGroup,
      ...everyoneCap,
    });
    await GroupPermissionResource.grantTypeWideForGroups(auth, {
      groups: [groupA],
      ...groupsCap,
    });

    const states = await GroupPermissionResource.getCapabilitiesState(auth, [
      everyoneCap,
      groupsCap,
      disabledCap,
    ]);
    expect(states.get("publish:agent")).toEqual({ scope: "everyone" });
    expect(states.get("admin:billing")).toEqual({ scope: "admins_only" });
    const groupsState = states.get("create:skill");
    assert(groupsState?.scope === "groups", "expected groups scope");
    expect(groupsState.groups.map((g) => g.id)).toEqual([groupA.id]);
  });

  describe("transitions", () => {
    // The test harness wraps each test in an (uncommitted) CLS transaction, so the multi-step
    // transitions must run inside it to see the groups created above. Production callers pass no
    // transaction and the methods open their own.
    let transaction: Transaction | undefined;
    beforeEach(() => {
      transaction = getNamespace("test-namespace")?.get("transaction");
    });

    it("setForEverybody clears specific groups (mutual exclusivity)", async () => {
      await GroupPermissionResource.setGroups(auth, CAPABILITY, [groupA], {
        transaction,
      });
      await GroupPermissionResource.setForEverybody(auth, CAPABILITY, {
        transaction,
      });

      expect(await stateOf(CAPABILITY)).toEqual({ scope: "everyone" });
    });

    it("setGroups clears the everybody row (mutual exclusivity)", async () => {
      await GroupPermissionResource.setForEverybody(auth, CAPABILITY, {
        transaction,
      });
      await GroupPermissionResource.setGroups(
        auth,
        CAPABILITY,
        [groupA, groupB],
        { transaction }
      );

      const state = await stateOf(CAPABILITY);
      assert(state?.scope === "groups", "expected groups scope");
      expect(new Set(state.groups.map((g) => g.id))).toEqual(
        new Set([groupA.id, groupB.id])
      );
    });

    it("setGroups replaces the previous set of groups", async () => {
      await GroupPermissionResource.setGroups(
        auth,
        CAPABILITY,
        [groupA, groupB],
        { transaction }
      );
      await GroupPermissionResource.setGroups(auth, CAPABILITY, [groupB], {
        transaction,
      });

      const state = await stateOf(CAPABILITY);
      assert(state?.scope === "groups", "expected groups scope");
      expect(state.groups.map((g) => g.id)).toEqual([groupB.id]);
    });

    it("disable removes all -1 rows", async () => {
      await GroupPermissionResource.setForEverybody(auth, CAPABILITY, {
        transaction,
      });
      await GroupPermissionResource.disable(auth, CAPABILITY, { transaction });

      expect(await stateOf(CAPABILITY)).toEqual({ scope: "admins_only" });
    });

    it("setGroups([]) disables the capability", async () => {
      await GroupPermissionResource.setForEverybody(auth, CAPABILITY, {
        transaction,
      });
      await GroupPermissionResource.setGroups(auth, CAPABILITY, [], {
        transaction,
      });

      expect(await stateOf(CAPABILITY)).toEqual({ scope: "admins_only" });
    });

    it("setGroups rejects the system group", async () => {
      const systemGroup = await GroupResource.internalFetchWorkspaceSystemGroup(
        workspace.id
      );
      await expect(
        GroupPermissionResource.setGroups(auth, CAPABILITY, [systemGroup])
      ).rejects.toThrow(/system group/);
    });

    it("setGroups rejects the global group", async () => {
      await expect(
        GroupPermissionResource.setGroups(auth, CAPABILITY, [globalGroup])
      ).rejects.toThrow(/setForEverybody/);
    });
  });
});
