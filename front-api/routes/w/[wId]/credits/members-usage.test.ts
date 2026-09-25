import * as membersUsage from "@app/lib/api/credits/members_usage";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { makeMemberUsage } from "@app/tests/utils/MemberUsageFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/credits/members_usage", async () => {
  const actual = await vi.importActual<typeof membersUsage>(
    "@app/lib/api/credits/members_usage"
  );
  return { ...actual, getMembersUsage: vi.fn() };
});

function membersUsageUrl(wId: string) {
  return `/api/w/${wId}/credits/members-usage`;
}

const MEMBER_USAGE = makeMemberUsage();

const CREDITS_RESET_AT = "2026-08-01T00:00:00.000Z";

beforeEach(() => {
  vi.mocked(membersUsage.getMembersUsage).mockResolvedValue({
    members: [MEMBER_USAGE],
    total: 1,
    creditsResetAt: CREDITS_RESET_AT,
  });
});

describe("GET /api/w/[wId]/credits/members-usage", () => {
  it("returns 403 when the caller is not a manager", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(membersUsage.getMembersUsage).not.toHaveBeenCalled();
  });

  it("allows a manager to read members usage", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [MEMBER_USAGE],
      total: 1,
      creditsResetAt: CREDITS_RESET_AT,
    });
    expect(membersUsage.getMembersUsage).toHaveBeenCalled();
  });

  it("allows an admin to read members usage", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(membersUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [MEMBER_USAGE],
      total: 1,
      creditsResetAt: CREDITS_RESET_AT,
    });
  });

  it("allows a group manager only when group management is enabled", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await GroupResource.makeNew({
      name: "Support",
      kind: "regular_manual",
      workspaceId: workspace.id,
    });
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: user.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: group.id,
    });
    expect(grant.isOk()).toBe(true);

    expect((await honoApp.request(membersUsageUrl(workspace.sId))).status).toBe(
      403
    );
    await FeatureFlagFactory.basic(adminAuth, "group_management");

    expect((await honoApp.request(membersUsageUrl(workspace.sId))).status).toBe(
      200
    );
  });
});
