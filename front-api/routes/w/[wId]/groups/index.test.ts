import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getGroupsRequest(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(`/api/w/${wId}/groups${qs ? `?${qs}` : ""}`);
}

describe("GET /api/w/:wId/groups", () => {
  it("returns memberCount but no memberIds by default", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice]);

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toEqual([
      expect.objectContaining({
        sId: sales.sId,
        name: "Sales",
        memberCount: 1,
      }),
    ]);
    expect(body.groups[0].memberIds).toBeUndefined();
  });

  it("returns memberIds when withMembers=true is requested", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const alice = await UserFactory.basic();
    await MembershipFactory.associate(workspace, alice, { role: "user" });
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withMembers(adminAuth, sales, [alice]);

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
      withMembers: "true",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.groups).toEqual([
      expect.objectContaining({
        sId: sales.sId,
        name: "Sales",
        memberCount: 1,
        memberIds: [alice.sId],
      }),
    ]);
  });

  it("returns each group's managers only when requested", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    const support = await GroupFactory.regularManual(workspace, "Support");
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: user.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: sales.id,
    });
    expect(grant.isOk()).toBe(true);

    const response = await getGroupsRequest(workspace.sId, {
      kind: "regular_manual",
      withManagers: "true",
    });

    expect(response.status).toBe(200);
    const groups = (await response.json()).groups;
    expect(
      groups.find((group: { sId: string }) => group.sId === sales.sId)
    ).toHaveProperty("managers", [
      {
        sId: user.sId,
        fullName: user.toJSON().fullName,
        image: user.toJSON().image,
      },
    ]);
    expect(
      groups.find((group: { sId: string }) => group.sId === support.sId)
    ).toHaveProperty("managers", []);
  });

  it("advertises delegated actions for group managers", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await GroupFactory.regularManual(workspace, "Support");
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: user.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: group.id,
    });
    expect(grant.isOk()).toBe(true);

    const readActions = async () => {
      const response = await getGroupsRequest(workspace.sId, {
        kind: "regular_manual",
      });
      expect(response.status).toBe(200);
      return (await response.json()).groups[0].allowedActions;
    };
    expect(await readActions()).toEqual({
      canEditMembers: true,
      canEditDetails: false,
      canReadUsage: true,
      canSetUsageLimits: true,
      canAssignManagers: false,
    });
  });
});
