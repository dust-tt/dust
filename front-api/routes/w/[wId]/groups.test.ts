import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getGroups(
  workspace: { sId: string },
  query: Record<string, string> = {}
) {
  const search = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/groups${search ? `?${search}` : ""}`
  );
}

function postGroup(workspace: { sId: string }, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${workspace.sId}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getGroup(workspace: { sId: string }, groupId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/groups/${groupId}`);
}

function patchGroup(
  workspace: { sId: string },
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${workspace.sId}/groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteGroup(workspace: { sId: string }, groupId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/groups/${groupId}`, {
    method: "DELETE",
  });
}

describe("GET /api/w/:wId/groups", () => {
  it("returns groups with correct member counts", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regularManual(workspace, "Engineering");
    await GroupFactory.withMembers(auth, group, [user]);

    const response = await getGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    const globalGroup = groups.find(
      (g: { kind: string }) => g.kind === "global"
    );
    expect(globalGroup).toBeDefined();
    expect(globalGroup.memberCount).toBe(1);

    const engineeringGroup = groups.find(
      (g: { name: string }) => g.name === "Engineering"
    );
    expect(engineeringGroup).toBeDefined();
    expect(engineeringGroup.memberCount).toBe(1);
  });

  it("reflects multiple members correctly", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regularManual(workspace, "Design");

    const extraUsers = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
    ]);
    await Promise.all(
      extraUsers.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
      )
    );
    await GroupFactory.withMembers(auth, group, extraUsers);

    const response = await getGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    const designGroup = groups.find(
      (g: { name: string }) => g.name === "Design"
    );
    expect(designGroup).toBeDefined();
    expect(designGroup.memberCount).toBe(2);

    // Global group count should include all workspace members.
    const globalGroup = groups.find(
      (g: { kind: string }) => g.kind === "global"
    );
    expect(globalGroup.memberCount).toBe(3); // 1 original + 2 extra.
  });

  it("returns 0 for a group with no members", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await GroupFactory.regularManual(workspace, "Empty");

    const response = await getGroups(workspace);

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    const emptyGroup = groups.find((g: { name: string }) => g.name === "Empty");
    expect(emptyGroup).toBeDefined();
    expect(emptyGroup.memberCount).toBe(0);
  });

  it("filters groups by kind", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regularManual(workspace, "Backend");
    await GroupFactory.withMembers(auth, group, [user]);
    await GroupFactory.provisioned(workspace, "Directory");

    const response = await getGroups(workspace, { kind: "regular_manual" });

    expect(response.status).toBe(200);
    const { groups } = await response.json();

    expect(
      groups.every((g: { kind: string }) => g.kind === "regular_manual")
    ).toBe(true);
    const backendGroup = groups.find(
      (g: { name: string }) => g.name === "Backend"
    );
    expect(backendGroup).toBeDefined();
    expect(backendGroup.memberCount).toBe(1);
  });

  it("never lists internal group kinds, even when explicitly requested", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const group = await GroupFactory.regularAuto(workspace, "Backend");
    await GroupFactory.withMembers(auth, group, [user]);

    // `regular_auto` is an internal kind: it is never surfaced by this endpoint,
    // even for an admin explicitly asking for it.
    const response = await getGroups(workspace, { kind: "regular_auto" });

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    expect(groups.some((g: { name: string }) => g.name === "Backend")).toBe(
      false
    );
  });

  it("lets a manager list provisioned groups", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
    });

    await GroupFactory.provisioned(workspace, "Engineering");

    const response = await getGroups(workspace, { kind: "provisioned" });

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    expect(groups.map((g: { name: string }) => g.name)).toEqual([
      "Engineering",
    ]);
  });
});

describe("POST /api/w/:wId/groups", () => {
  it("lets an admin create a regular_manual group", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await postGroup(workspace, {
      name: "Finance",
      memberIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const { group } = await response.json();
    expect(group.name).toBe("Finance");
    expect(group.kind).toBe("regular_manual");

    const created = await GroupResource.fetchById(auth, group.sId);
    expect(created.isOk()).toBe(true);
  });

  it("creates a group seeded with the provided members", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const extraUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, extraUser, { role: "user" });

    const response = await postGroup(workspace, {
      name: "Seeded",
      memberIds: [user.sId, extraUser.sId],
    });

    expect(response.status).toBe(200);
    const { group } = await response.json();

    const created = await GroupResource.fetchById(auth, group.sId);
    if (created.isErr()) {
      throw created.error;
    }
    const members = await created.value.getActiveMembers(auth);
    expect(new Set(members.map((m) => m.sId))).toEqual(
      new Set([user.sId, extraUser.sId])
    );
  });

  it("returns 404 when a member id does not belong to the workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    // A user that exists but is not a member of this workspace.
    const outsider = await UserFactory.basic();

    const response = await postGroup(workspace, {
      name: "Bad members",
      memberIds: [outsider.sId],
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("user_not_found");
  });

  it("lets a manager create a regular_manual group", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "manager",
    });

    const response = await postGroup(workspace, {
      name: "Legal",
      memberIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const { group } = await response.json();
    expect(group.kind).toBe("regular_manual");
  });

  it("returns 403 for a regular user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await postGroup(workspace, { name: "Nope" });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 403 for a regular user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await postGroup(workspace, { name: "Nope" });

    expect(response.status).toBe(403);
  });

  it("returns 409 when a group with the same name already exists", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    await GroupFactory.regularManual(workspace, "Duplicate");

    const response = await postGroup(workspace, {
      name: "Duplicate",
      memberIds: [user.sId],
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 when name is missing or empty", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    expect((await postGroup(workspace, { memberIds: [user.sId] })).status).toBe(
      400
    );
    expect(
      (await postGroup(workspace, { name: "", memberIds: [user.sId] })).status
    ).toBe(400);
  });

  it("returns 400 when members are missing or empty", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    expect((await postGroup(workspace, { name: "No members" })).status).toBe(
      400
    );
    expect(
      (await postGroup(workspace, { name: "No members", memberIds: [] })).status
    ).toBe(400);
  });
});

describe("GET /api/w/:wId/groups/:groupId", () => {
  it("returns the group with its members inline", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const extraUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, extraUser, { role: "user" });

    const group = await GroupFactory.regularManual(workspace, "Finance");
    const addResult = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON(), extraUser.toJSON()],
    });
    if (addResult.isErr()) {
      throw addResult.error;
    }

    const response = await getGroup(workspace, group.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group.sId).toBe(group.sId);
    expect(body.group.kind).toBe("regular_manual");
    expect(new Set(body.members.map((m: { sId: string }) => m.sId))).toEqual(
      new Set([user.sId, extraUser.sId])
    );
  });

  it("lets an admin read the group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Legal");

    const response = await getGroup(workspace, group.sId);

    expect(response.status).toBe(200);
  });

  it("lets a manager read the group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
    });
    const group = await GroupFactory.regularManual(workspace, "Legal");

    const response = await getGroup(workspace, group.sId);

    expect(response.status).toBe(200);
  });

  it("returns 403 for a regular user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const group = await GroupFactory.regularManual(workspace, "Secret");

    const response = await getGroup(workspace, group.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 404 for a non-manageable group", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await getGroup(workspace, globalGroup.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });
});

describe("PATCH /api/w/:wId/groups/:groupId", () => {
  it("renames the group", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Old name");

    const response = await patchGroup(workspace, group.sId, {
      name: "New name",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group.name).toBe("New name");

    const refetched = await GroupResource.fetchById(auth, group.sId);
    if (refetched.isErr()) {
      throw refetched.error;
    }
    expect(refetched.value.name).toBe("New name");
  });

  it("sets the full member list", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const extraUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, extraUser, { role: "user" });

    const group = await GroupFactory.regularManual(workspace, "Team");
    // Seed with a single member that should be replaced by the PATCH.
    const seed = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (seed.isErr()) {
      throw seed.error;
    }

    const response = await patchGroup(workspace, group.sId, {
      memberIds: [extraUser.sId],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(new Set(body.members.map((m: { sId: string }) => m.sId))).toEqual(
      new Set([extraUser.sId])
    );
  });

  it("clears all members with an empty array", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Team");
    const seed = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (seed.isErr()) {
      throw seed.error;
    }

    const response = await patchGroup(workspace, group.sId, {
      memberIds: [],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members).toEqual([]);
  });

  it("renames and sets members in a single request", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Old name");

    const response = await patchGroup(workspace, group.sId, {
      name: "New name",
      memberIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group.name).toBe("New name");
    expect(new Set(body.members.map((m: { sId: string }) => m.sId))).toEqual(
      new Set([user.sId])
    );
  });

  it("leaves members unchanged when only renaming", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Old name");
    const seed = await group.dangerouslyAddMembers(auth, {
      users: [user.toJSON()],
    });
    if (seed.isErr()) {
      throw seed.error;
    }

    const response = await patchGroup(workspace, group.sId, {
      name: "New name",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(new Set(body.members.map((m: { sId: string }) => m.sId))).toEqual(
      new Set([user.sId])
    );
  });

  it("lets a manager update the group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
    });
    const group = await GroupFactory.regularManual(workspace, "Old name");

    const response = await patchGroup(workspace, group.sId, {
      name: "New name",
    });

    expect(response.status).toBe(200);
  });

  it("returns 403 for a regular user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    const group = await GroupFactory.regularManual(workspace, "Old name");

    const response = await patchGroup(workspace, group.sId, {
      name: "New name",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 404 for a non-regular_manual group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.provisioned(workspace, "Automatic");

    const response = await patchGroup(workspace, group.sId, {
      name: "New name",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("returns 409 when renaming to an existing group name", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    await GroupFactory.regularManual(workspace, "Taken");
    const group = await GroupFactory.regularManual(workspace, "Original");

    const response = await patchGroup(workspace, group.sId, {
      name: "Taken",
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 when a member id does not belong to the workspace", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Team");
    const outsider = await UserFactory.basic();

    const response = await patchGroup(workspace, group.sId, {
      memberIds: [outsider.sId],
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("user_not_found");
  });

  it("returns 400 for an empty name", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Team");

    const response = await patchGroup(workspace, group.sId, { name: "" });

    expect(response.status).toBe(400);
  });

  it("returns 400 for an empty body", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Team");

    const response = await patchGroup(workspace, group.sId, {});

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("DELETE /api/w/:wId/groups/:groupId", () => {
  it("lets an admin delete the group", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const group = await GroupFactory.regularManual(workspace, "Doomed");

    const response = await deleteGroup(workspace, group.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);

    const refetched = await GroupResource.fetchById(auth, group.sId);
    expect(refetched.isErr()).toBe(true);
  });

  it("lets a manager delete the group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "manager",
    });
    const group = await GroupFactory.regularManual(workspace, "Doomed");

    const response = await deleteGroup(workspace, group.sId);

    expect(response.status).toBe(200);
  });

  it("returns 403 for a regular user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    const group = await GroupFactory.regularManual(workspace, "Doomed");

    const response = await deleteGroup(workspace, group.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 404 for a non-regular_manual group", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
    });
    const group = await GroupFactory.provisioned(workspace, "Automatic");

    const response = await deleteGroup(workspace, group.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");

    // The group must not have been deleted.
    const refetched = await GroupResource.fetchById(auth, group.sId);
    expect(refetched.isOk()).toBe(true);
  });
});
