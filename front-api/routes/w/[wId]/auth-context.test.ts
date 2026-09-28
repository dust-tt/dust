import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/auth-context group management", () => {
  it("returns only eligible managed groups when enabled", async () => {
    const { workspace, user } = await createPrivateApiMockRequest();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const manual = await GroupResource.makeNew({
      name: "Support",
      kind: "regular_manual",
      workspaceId: workspace.id,
    });
    const adminGroup = await GroupResource.makeNew({
      name: "Admins",
      kind: "regular_manual",
      workspaceId: workspace.id,
      grantedRole: "admin",
    });
    for (const group of [manual, adminGroup]) {
      const result = await GroupPermissionResource.grantToUser(adminAuth, {
        user: user.toJSON(),
        grantType: "group_manager",
        resourceType: "group",
        resourceId: group.id,
      });
      expect(result.isOk()).toBe(true);
    }

    const url = `/api/w/${workspace.sId}/auth-context`;
    expect(
      (await (await honoApp.request(url)).json()).groupManagement
    ).toBeUndefined();

    await FeatureFlagFactory.basic(adminAuth, "group_management");
    const response = await honoApp.request(url);
    expect(response.status).toBe(200);
    const { groupManagement } = await response.json();
    expect(groupManagement.write).toEqual({
      kind: "ids",
      groupIds: [manual.sId],
    });
    expect(new Set(groupManagement.read_usage.groupIds)).toEqual(
      new Set([manual.sId, adminGroup.sId])
    );
    expect(new Set(groupManagement.set_usage_limits.groupIds)).toEqual(
      new Set([manual.sId, adminGroup.sId])
    );
  });
});
