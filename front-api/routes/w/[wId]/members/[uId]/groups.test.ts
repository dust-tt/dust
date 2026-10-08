import { updateGroupManagers } from "@app/lib/api/groups/manager_assignments";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getMemberGroups(workspace: { sId: string }, userId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/members/${userId}/groups`);
}

function postMemberGroup(
  workspace: { sId: string },
  userId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${workspace.sId}/members/${userId}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteMemberGroup(
  workspace: { sId: string },
  userId: string,
  groupId: string
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/members/${userId}/groups/${groupId}`,
    { method: "DELETE" }
  );
}

describe("GET /api/w/:wId/members/:uId/groups", () => {
  it("returns the manageable groups of the member with their member counts", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const manualGroup = await GroupFactory.regularManual(workspace, "Billing");
    const addManualRes = await manualGroup.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (addManualRes.isErr()) {
      throw addManualRes.error;
    }

    const provisionedGroup = await GroupFactory.provisioned(workspace, "Dev");
    const addProvisionedRes = await provisionedGroup.dangerouslyAddMembers(
      auth,
      { users: [user.toJSON()], allowProvisionedGroups: true }
    );
    if (addProvisionedRes.isErr()) {
      throw addProvisionedRes.error;
    }

    // Groups the member is not part of, and kinds that are not manageable, must not show up.
    await GroupFactory.regularManual(workspace, "Other");
    const autoGroup = await GroupFactory.regularAuto(workspace, "Automatic");
    const addAutoRes = await autoGroup.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (addAutoRes.isErr()) {
      throw addAutoRes.error;
    }

    const response = await getMemberGroups(workspace, user.sId);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    expect(
      groups
        .map((g: { name: string }) => g.name)
        .sort((a: string, b: string) => a.localeCompare(b))
    ).toEqual(["Billing", "Dev"]);
    expect(
      groups.find((g: { name: string }) => g.name === "Billing").memberCount
    ).toBe(1);
    expect(groups.find((g: { name: string }) => g.name === "Dev").kind).toBe(
      "provisioned"
    );
  });

  it("returns 403 for a regular user", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await getMemberGroups(workspace, user.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 404 when the user is not a member of the workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const outsider = await UserFactory.basic();

    const response = await getMemberGroups(workspace, outsider.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("workspace_user_not_found");
  });
});

describe("POST /api/w/:wId/members/:uId/groups", () => {
  it("lets a manager add a member to a manual group", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "manager",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const group = await GroupFactory.regularManual(workspace, "Billing");

    const response = await postMemberGroup(workspace, otherUser.sId, {
      groupId: group.sId,
    });

    expect(response.status).toBe(200);
    const { group: updatedGroup } = await response.json();
    expect(updatedGroup.memberCount).toBe(1);

    const members = await group.getActiveMembers(auth);
    expect(members.map((m) => m.sId)).toEqual([otherUser.sId]);
  });

  it("returns 400 when the member is already in the group", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Billing");
    const addRes = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (addRes.isErr()) {
      throw addRes.error;
    }

    const response = await postMemberGroup(workspace, user.sId, {
      groupId: group.sId,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for a provisioned group", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const group = await GroupFactory.provisioned(workspace, "Dev");

    const response = await postMemberGroup(workspace, user.sId, {
      groupId: group.sId,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("returns 403 for a regular user", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const group = await GroupFactory.regularManual(workspace, "Billing");

    const response = await postMemberGroup(workspace, user.sId, {
      groupId: group.sId,
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 when groupId is missing", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await postMemberGroup(workspace, user.sId, {});

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/w/:wId/members/:uId/groups/:groupId", () => {
  it("lets an admin remove a member from a manual group", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const group = await GroupFactory.regularManual(workspace, "Billing");
    const addRes = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON(), otherUser.toJSON()],
    });
    if (addRes.isErr()) {
      throw addRes.error;
    }

    const response = await deleteMemberGroup(workspace, user.sId, group.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const members = await group.getActiveMembers(auth);
    expect(members.map((m) => m.sId)).toEqual([otherUser.sId]);
  });

  it("returns 400 when removing the last member of a manual group", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Billing");
    const addRes = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (addRes.isErr()) {
      throw addRes.error;
    }

    const response = await deleteMemberGroup(workspace, user.sId, group.sId);

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.type).toBe("invalid_request_error");
    expect(error.message).toBe(
      "A group must always keep at least one member. To remove everyone, " +
        "delete the group instead."
    );

    const members = await group.getActiveMembers(auth);
    expect(members.map((m) => m.sId)).toEqual([user.sId]);
  });

  it("returns 400 when the member is not in the group", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Billing");

    const response = await deleteMemberGroup(workspace, user.sId, group.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for a provisioned group", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const group = await GroupFactory.provisioned(workspace, "Dev");
    const addRes = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
      allowProvisionedGroups: true,
    });
    if (addRes.isErr()) {
      throw addRes.error;
    }

    const response = await deleteMemberGroup(workspace, user.sId, group.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("returns 403 for a user", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    const group = await GroupFactory.regularManual(workspace, "Billing");

    const response = await deleteMemberGroup(workspace, user.sId, group.sId);

    expect(response.status).toBe(403);
  });
});

describe("delegated membership writes", () => {
  it("allows scoped membership edits but rejects disabled, unrelated, and restricted edits", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const manual = await GroupFactory.regularManual(workspace, "Managed");
    const other = await GroupFactory.regularManual(workspace, "Other");
    const provisioned = await GroupFactory.provisioned(workspace, "Directory");
    const admins = await GroupResource.makeNew({
      name: "Admins",
      kind: "regular_manual",
      workspaceId: workspace.id,
      grantedRole: "admin",
    });
    await GroupFactory.withMembers(adminAuth, manual, [member]);
    for (const group of [manual, provisioned, admins]) {
      await updateGroupManagers(adminAuth, group, [user.sId], []);
    }
    const addSelf = (groupId: string) =>
      postMemberGroup(workspace, user.sId, { groupId });
    const patch = (groupId: string, body: Record<string, unknown>) =>
      honoApp.request(`/api/w/${workspace.sId}/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await addSelf(manual.sId)).status).toBe(403);
    await FeatureFlagFactory.basic(adminAuth, "group_management");
    expect((await addSelf(other.sId)).status).toBe(403);
    expect((await addSelf(provisioned.sId)).status).toBe(404);
    expect((await addSelf(admins.sId)).status).toBe(403);
    expect(
      (await patch(admins.sId, { memberDiff: { add: [user.sId], remove: [] } }))
        .status
    ).toBe(403);
    expect(await admins.getActiveMembers(adminAuth)).toHaveLength(0);
    expect((await patch(manual.sId, { name: "Renamed" })).status).toBe(403);
    expect(
      (await manual.getActiveMembers(adminAuth)).map((m) => m.sId)
    ).toEqual([member.sId]);
    expect(
      (
        await patch(manual.sId, {
          managerDiff: { add: [member.sId], remove: [] },
        })
      ).status
    ).toBe(403);

    expect((await addSelf(manual.sId)).status).toBe(200);
    const saved = await patch(manual.sId, {
      memberDiff: { add: [], remove: [] },
    });
    expect(saved.status).toBe(200);
    const detail = await saved.json();
    for (const person of [...detail.members, ...detail.managers]) {
      expect(person).not.toHaveProperty("id");
      expect(person).not.toHaveProperty("lastLoginAt");
      expect(person).not.toHaveProperty("provider");
    }
    expect(
      (await deleteMemberGroup(workspace, member.sId, manual.sId)).status
    ).toBe(200);
    expect(
      (await deleteMemberGroup(workspace, user.sId, manual.sId)).status
    ).toBe(400);
    await updateGroupManagers(adminAuth, manual, [], [user.sId]);
    expect(
      (
        await patch(manual.sId, {
          memberDiff: { add: [member.sId], remove: [] },
        })
      ).status
    ).toBe(403);
  });

  it("preserves role synchronization when a delegate adds themselves", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await GroupResource.makeNew({
      name: "Managers",
      kind: "regular_manual",
      workspaceId: workspace.id,
      grantedRole: "manager",
    });
    await updateGroupManagers(adminAuth, group, [user.sId], []);
    await FeatureFlagFactory.basic(adminAuth, "group_management");
    expect(
      (await postMemberGroup(workspace, user.sId, { groupId: group.sId }))
        .status
    ).toBe(200);
    const refreshed = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    expect(refreshed.isManager()).toBe(true);
  });
});
