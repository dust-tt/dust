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

  it("reports disabled when there is no -1 row", async () => {
    expect(
      await GroupPermissionResource.isCapabilityDisabled(auth, CAPABILITY)
    ).toBe(true);
    expect(
      await GroupPermissionResource.isCapabilityForEverybody(auth, CAPABILITY)
    ).toBe(false);
    expect(
      await GroupPermissionResource.getCapabilityGroups(auth, CAPABILITY)
    ).toEqual([]);
  });

  it("reports everybody when the global group holds the -1 row", async () => {
    await GroupPermissionResource.grantOnAllResourcesOfType(auth, {
      group: globalGroup,
      ...CAPABILITY,
    });

    expect(
      await GroupPermissionResource.isCapabilityForEverybody(auth, CAPABILITY)
    ).toBe(true);
    expect(
      await GroupPermissionResource.isCapabilityDisabled(auth, CAPABILITY)
    ).toBe(false);
    // The global group is not surfaced as a "specific" group.
    expect(
      await GroupPermissionResource.getCapabilityGroups(auth, CAPABILITY)
    ).toEqual([]);
  });

  it("reports the specific groups when non-global groups hold -1 rows", async () => {
    await GroupPermissionResource.grantOnAllResourcesOfTypeForGroups(auth, {
      groups: [groupA, groupB],
      ...CAPABILITY,
    });

    expect(
      await GroupPermissionResource.isCapabilityForEverybody(auth, CAPABILITY)
    ).toBe(false);
    expect(
      await GroupPermissionResource.isCapabilityDisabled(auth, CAPABILITY)
    ).toBe(false);

    const groups = await GroupPermissionResource.getCapabilityGroups(
      auth,
      CAPABILITY
    );
    expect(new Set(groups.map((g) => g.id))).toEqual(
      new Set([groupA.id, groupB.id])
    );
  });
});
