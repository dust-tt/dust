import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import assert from "assert";
import { expect, it } from "vitest";

it("updates the users holding a group-manager grant and removes an empty grant", async () => {
  const workspace = await WorkspaceFactory.basic();
  await GroupFactory.defaults(workspace);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const group = await GroupFactory.regularManual(workspace, "Sales");
  const alice = await UserFactory.basic();
  const bob = await UserFactory.basic();
  await MembershipFactory.associate(workspace, alice, { role: "user" });
  await MembershipFactory.associate(workspace, bob, { role: "user" });
  const grant = {
    grantType: "group_manager" as const,
    resourceType: "group" as const,
    resourceId: group.id,
  };

  await GroupPermissionResource.updateUsersForGrant(auth, {
    ...grant,
    usersToAdd: [alice.toJSON()],
    userIdsToRemove: [],
  });
  const changes = await GroupPermissionResource.updateUsersForGrant(auth, {
    ...grant,
    usersToAdd: [bob.toJSON()],
    userIdsToRemove: [alice.sId],
  });
  expect(changes.addedUsers.map((user) => user.sId)).toEqual([bob.sId]);
  expect(changes.removedUsers.map((user) => user.sId)).toEqual([alice.sId]);

  const holder = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    grant
  );
  assert(holder);
  expect((await holder.getActiveMembers(auth)).map((user) => user.sId)).toEqual(
    [bob.sId]
  );

  // A stale suspended row for Bob must not cause the update to end his active row.
  await GroupMembershipModel.create({
    workspaceId: workspace.id,
    groupId: holder.id,
    userId: bob.id,
    startAt: new Date(),
    endAt: null,
    status: "suspended",
  });
  await GroupPermissionResource.updateUsersForGrant(auth, {
    ...grant,
    usersToAdd: [bob.toJSON()],
    userIdsToRemove: [],
  });
  expect((await holder.getActiveMembers(auth)).map((user) => user.sId)).toEqual(
    [bob.sId]
  );

  await GroupPermissionResource.updateUsersForGrant(auth, {
    ...grant,
    usersToAdd: [],
    userIdsToRemove: [bob.sId],
  });
  expect(
    await GroupPermissionResource.findRegularAutoGroupForGrant(auth, grant)
  ).toBeNull();
});
