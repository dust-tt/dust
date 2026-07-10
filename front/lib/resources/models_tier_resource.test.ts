import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("ModelsTierResource permissions", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let group: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    group = await GroupFactory.regularAuto(workspace, "tier-users");
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function grantsForTier(tierId: number) {
    return GroupPermissionResource.listForGroups(auth, {
      groupModelIds: (await GroupResource.listAllWorkspaceGroups(auth)).map(
        (entry) => entry.id
      ),
      permissionType: "use",
      resourceType: "models_tier",
      resourceId: tierId,
    });
  }

  it("grants and revokes a tier for a user via a regular_auto group", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const grantResult = await ModelsTierResource.grantToUser(auth, {
      user: user.toJSON(),
      tierName: "balanced",
    });
    expect(grantResult.isOk()).toBe(true);

    const grants = await grantsForTier(2);
    expect(grants).toHaveLength(1);

    const autoGroup = await GroupResource.fetchByModelIds(auth, [
      grants[0].groupId,
    ]);
    expect(autoGroup[0].kind).toBe("regular_auto");
    expect(await autoGroup[0].isMember(user)).toBe(true);

    const revokeResult = await ModelsTierResource.revokeFromUser(auth, {
      user: user.toJSON(),
      tierName: "balanced",
    });
    expect(revokeResult.isOk()).toBe(true);
    expect(await grantsForTier(2)).toHaveLength(0);
  });

  it("grants and revokes a tier for a regular group", async () => {
    await ModelsTierResource.grantToGroup(auth, {
      group,
      tierName: "premium",
    });

    const grants = await GroupPermissionResource.listForGroups(auth, {
      groupModelIds: [group.id],
      permissionType: "use",
      resourceType: "models_tier",
      resourceId: 3,
    });
    expect(grants).toHaveLength(1);

    await ModelsTierResource.revokeFromGroup(auth, {
      group,
      tierName: "premium",
    });
    expect(
      await GroupPermissionResource.listForGroups(auth, {
        groupModelIds: [group.id],
        permissionType: "use",
        resourceType: "models_tier",
        resourceId: 3,
      })
    ).toHaveLength(0);
  });
});
