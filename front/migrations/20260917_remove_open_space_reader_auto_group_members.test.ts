import { GroupResource } from "@app/lib/resources/group_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import logger from "@app/logger/logger";
import { removeWorkspaceStaleOpenSpaceMembers } from "@app/migrations/20260917_remove_open_space_reader_auto_group_members";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

const silentLogger = logger.child({}, { level: "silent" });

// An open regular space with one member in its `regular_auto` group. `attachGroup` rewrites the
// grants through `writeGroupPermissions`, which gives the auto group a `member` grant; the
// historical `reader` grant is reproduced by rewriting that row directly.
async function seedOpenSpaceWithMember({
  autoGroupGrant,
}: {
  autoGroupGrant: "reader" | "member";
}) {
  const {
    authenticator: auth,
    workspace,
    globalGroup,
  } = await createResourceTest({ role: "admin" });

  const space = await SpaceFactory.regular(workspace);
  await SpaceFactory.attachGroup(space, globalGroup, "project_viewer");

  const autoGroup = (await space.fetchGroupResources(auth)).find((group) =>
    group.isRegularAuto()
  );
  assert(autoGroup);

  const member = await UserFactory.basic();
  await MembershipFactory.associate(workspace, member, { role: "user" });
  const added = await GroupFactory.withMembers(auth, autoGroup, [member]);
  assert(added.isOk());

  await GroupPermissionModel.update(
    { grantType: autoGroupGrant },
    {
      where: {
        workspaceId: workspace.id,
        resourceType: "space",
        resourceId: space.id,
        groupId: autoGroup.id,
      },
    }
  );

  return { auth, workspace, space, autoGroup, member };
}

async function memberIdsOf(
  auth: Parameters<typeof GroupResource.getActiveMembershipsForGroups>[0],
  group: GroupResource
) {
  const memberships = await GroupResource.getActiveMembershipsForGroups(auth, [
    group,
  ]);
  return memberships[group.id] ?? [];
}

async function autoGroupGrantOf(space: SpaceResource, groupId: number) {
  return GroupPermissionModel.findOne({
    where: {
      workspaceId: space.workspaceId,
      resourceType: "space",
      resourceId: space.id,
      groupId,
    },
  });
}

describe("removeWorkspaceStaleOpenSpaceMembers", () => {
  it("removes the members of an open space whose auto group holds a reader grant", async () => {
    const { auth, workspace, space, autoGroup, member } =
      await seedOpenSpaceWithMember({ autoGroupGrant: "reader" });

    await removeWorkspaceStaleOpenSpaceMembers(false, silentLogger, workspace);
    expect(await memberIdsOf(auth, autoGroup)).toEqual([member.id]);

    await removeWorkspaceStaleOpenSpaceMembers(true, silentLogger, workspace);
    expect(await memberIdsOf(auth, autoGroup)).toEqual([]);

    // Grants are left for the grant fix to converge.
    const grant = await autoGroupGrantOf(space, autoGroup.id);
    expect(grant?.grantType).toBe("reader");
  });

  it("keeps the members of an open space whose auto group holds a member grant", async () => {
    const { auth, workspace, autoGroup, member } =
      await seedOpenSpaceWithMember({ autoGroupGrant: "member" });

    await removeWorkspaceStaleOpenSpaceMembers(true, silentLogger, workspace);
    expect(await memberIdsOf(auth, autoGroup)).toEqual([member.id]);
  });
});
