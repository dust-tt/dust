import { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getGroupRequest(wId: string, groupId: string) {
  return honoApp.request(`/api/w/${wId}/groups/${groupId}`);
}

function patchGroupRequest(
  wId: string,
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${wId}/groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/:wId/groups/:groupId", () => {
  it("returns the members of a manually-managed group", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice]);

    const response = await getGroupRequest(workspace.sId, sales.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group).toEqual(
      expect.objectContaining({ sId: sales.sId, name: "Sales", memberCount: 1 })
    );
    expect(body.members).toEqual([expect.objectContaining({ sId: alice.sId })]);
  });

  it("returns the members of a provisioned group", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const bob = await UserFactory.basic();
    await MembershipFactory.associate(workspace, bob, { role: "user" });
    const engineering = await GroupFactory.provisioned(
      workspace,
      "Engineering"
    );
    await GroupFactory.withMembers(adminAuth, engineering, [bob]);

    const response = await getGroupRequest(workspace.sId, engineering.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.group).toEqual(
      expect.objectContaining({
        sId: engineering.sId,
        name: "Engineering",
        kind: "provisioned",
        memberCount: 1,
      })
    );
    expect(body.members).toEqual([expect.objectContaining({ sId: bob.sId })]);
  });

  it("returns 404 on a non-manageable group", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await getGroupRequest(workspace.sId, globalGroup.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });
});

describe("PATCH /api/w/:wId/groups/:groupId", () => {
  it("applies memberChanges without touching unlisted members and ignores no-ops", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const [alice, bob, carol, dave, erin] = await Promise.all(
      Array.from({ length: 5 }, () => UserFactory.basic())
    );
    for (const u of [alice, bob, carol, dave, erin]) {
      await MembershipFactory.associate(workspace, u, { role: "user" });
    }
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice, bob, carol]);

    // `bob` is already a member and `erin` is not one: both are no-ops. `carol` is not listed.
    const response = await patchGroupRequest(workspace.sId, sales.sId, {
      memberChanges: {
        addMemberIds: [dave.sId, bob.sId],
        removeMemberIds: [alice.sId, erin.sId],
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members.map((m: { sId: string }) => m.sId).toSorted()).toEqual(
      [bob.sId, carol.sId, dave.sId].toSorted()
    );
  });

  it("rejects memberIds combined with memberChanges", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [user]);

    const response = await patchGroupRequest(workspace.sId, sales.sId, {
      memberIds: [user.sId],
      memberChanges: { addMemberIds: [], removeMemberIds: [] },
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when editing a provisioned group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const engineering = await GroupFactory.provisioned(
      workspace,
      "Engineering"
    );

    const response = await patchGroupRequest(workspace.sId, engineering.sId, {
      name: "Engineering renamed",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("replaces managers without changing a provisioned group's members", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "group_management");
    const alice = await UserFactory.basic();
    const bob = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    await MembershipFactory.associate(workspace, bob, { role: "user" });
    const group = await GroupFactory.provisioned(workspace, "Engineering");

    const first = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [alice.sId],
    });
    expect(first.status).toBe(200);
    expect(
      (await first.json()).managers.map((u: { sId: string }) => u.sId)
    ).toEqual([alice.sId]);

    const second = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [bob.sId],
    });
    expect(second.status).toBe(200);
    const body = await (await getGroupRequest(workspace.sId, group.sId)).json();
    expect(body.managers.map((u: { sId: string }) => u.sId)).toEqual([bob.sId]);
    expect(body.members).toEqual([]);

    const cleared = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [],
    });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).managers).toEqual([]);
  });

  it("rejects inactive managers and mixed updates before changing assignments", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "group_management");
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const outsider = await UserFactory.basic();
    const group = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(auth, group, [alice]);

    const invalid = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [alice.sId, outsider.sId],
    });
    expect(invalid.status).toBe(400);

    const mixed = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [alice.sId],
      name: "New Sales",
    });
    expect(mixed.status).toBe(400);
    const body = await (await getGroupRequest(workspace.sId, group.sId)).json();
    expect(body.group.name).toBe("Sales");
    expect(body.managers).toEqual([]);
  });

  it("keeps assignments admin-only and behind the feature flag", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const group = await GroupFactory.provisioned(workspace, "Engineering");
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });

    const disabled = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [alice.sId],
    });
    expect(disabled.status).toBe(403);

    await FeatureFlagFactory.basic(auth, "group_management");
    await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
      workspace,
    });
    const manager = await patchGroupRequest(workspace.sId, group.sId, {
      managerIds: [alice.sId],
    });
    expect(manager.status).toBe(403);
  });
});
