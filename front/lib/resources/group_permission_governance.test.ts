import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

// A concrete capability used across the governance-state tests.
const CAPABILITY = { permissionType: "create", resourceType: "agent" } as const;

describe("GroupPermissionResource — governance state (reads)", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let globalGroup: GroupResource;
  let groupA: GroupResource;
  let groupB: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    groupA = await GroupFactory.regular(workspace, "A");
    groupB = await GroupFactory.regular(workspace, "B");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const fetched = await GroupResource.internalFetchWorkspaceGlobalGroup(
      workspace.id
    );
    assert(fetched, "global group should exist");
    globalGroup = fetched;
  });

  const stateOf = async (capability: typeof CAPABILITY) =>
    (
      await GroupPermissionResource.getCapabilitiesState(auth, [capability])
    ).get(`${capability.permissionType}:${capability.resourceType}`);

  it("reports disabled when there is no -1 row", async () => {
    expect(await stateOf(CAPABILITY)).toEqual({ scope: "disabled" });
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
      permissionType: "publish",
      resourceType: "agent",
    } as const;
    const groupsCap = {
      permissionType: "create",
      resourceType: "skill",
    } as const;
    const disabledCap = {
      permissionType: "admin",
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
    expect(states.get("admin:billing")).toEqual({ scope: "disabled" });
    const groupsState = states.get("create:skill");
    assert(groupsState?.scope === "groups", "expected groups scope");
    expect(groupsState.groups.map((g) => g.id)).toEqual([groupA.id]);
  });
});
