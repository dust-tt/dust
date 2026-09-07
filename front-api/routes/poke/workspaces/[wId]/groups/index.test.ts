import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function createGroupWithMember() {
  const { workspace, auth, user } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });
  const group = await GroupFactory.regularManual(
    workspace,
    "Poke member count group"
  );
  const revokedUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, revokedUser, { role: "user" });
  const addMemberResult = await GroupFactory.withMembers(auth, group, [
    user,
    revokedUser,
  ]);
  if (addMemberResult.isErr()) {
    throw addMemberResult.error;
  }
  const revokeResult = await MembershipResource.revokeMembership({
    user: revokedUser,
    workspace,
  });
  if (revokeResult.isErr()) {
    throw new Error(revokeResult.error.type);
  }

  return { workspace, group };
}

async function createCappedGroup() {
  const { workspace } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });
  const group = await GroupFactory.regularManual(
    workspace,
    "Poke capped group"
  );
  const capRes = await group.updatePoolCap(9876);
  if (capRes.isErr()) {
    throw capRes.error;
  }

  return { workspace, group };
}

describe("GET /api/poke/workspaces/:wId/groups", () => {
  it("excludes revoked workspace members from group counts", async () => {
    const { workspace, group } = await createGroupWithMember();

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/groups`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const responseGroup = data.groups.find(
      (g: { sId: string }) => g.sId === group.sId
    );
    expect(responseGroup?.memberCount).toBe(1);
  });

  it("omits poolCapAwuCredits unless withPoolCaps=true is requested", async () => {
    const { workspace, group } = await createCappedGroup();

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/groups`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const responseGroup = data.groups.find(
      (g: { sId: string }) => g.sId === group.sId
    );
    expect(responseGroup).toBeDefined();
    expect(responseGroup.poolCapAwuCredits).toBeUndefined();
  });

  it("returns poolCapAwuCredits when withPoolCaps=true is requested", async () => {
    const { workspace, group } = await createCappedGroup();

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/groups?withPoolCaps=true`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const responseGroup = data.groups.find(
      (g: { sId: string }) => g.sId === group.sId
    );
    expect(responseGroup?.poolCapAwuCredits).toBe(9876);
    // Groups without a cap row report null, not undefined.
    const otherGroups = data.groups.filter(
      (g: { sId: string }) => g.sId !== group.sId
    );
    expect(otherGroups.length).toBeGreaterThan(0);
    for (const other of otherGroups) {
      expect(other.poolCapAwuCredits).toBeNull();
    }
  });
});

describe("GET /api/poke/workspaces/:wId/groups/:groupId/details", () => {
  it("excludes revoked workspace members from the group count", async () => {
    const { workspace, group } = await createGroupWithMember();

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/groups/${group.sId}/details`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.group.memberCount).toBe(1);
  });
});
