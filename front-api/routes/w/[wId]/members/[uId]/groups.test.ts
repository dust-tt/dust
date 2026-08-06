import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
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
    const group = await GroupFactory.regularManual(workspace, "Billing");
    const addRes = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (addRes.isErr()) {
      throw addRes.error;
    }

    const response = await deleteMemberGroup(workspace, user.sId, group.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const members = await group.getActiveMembers(auth);
    expect(members).toEqual([]);
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
