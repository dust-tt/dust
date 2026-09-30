import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/groups/group_limit_eligibility", () => ({
  areGroupLimitsEnabled: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(areGroupLimitsEnabled).mockResolvedValue(true);
});

async function makeGroup(workspace: WorkspaceType): Promise<GroupResource> {
  return GroupResource.makeNew({
    name: "Engineering",
    workspaceId: workspace.id,
    kind: "regular_manual",
  });
}

function putGroupLimit(
  wId: string,
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${wId}/groups/${groupId}/group_limit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/w/[wId]/groups/[groupId]/group_limit", () => {
  it("lets an admin set a group limit", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const group = await makeGroup(workspace);
    const { auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putGroupLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      limit: { kind: "limited", awuCredits: 10_000 },
    });
    const reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.groupLimitAwuCredits).toBe(10_000);
    expect(reloaded.value.groupLimitPriority).toBe(1);
  });

  it("refuses a workspace manager", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const group = await makeGroup(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "manager",
      workspace,
    });

    const response = await putGroupLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(403);
  });

  it("refuses a group manager of that group", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const group = await makeGroup(workspace);
    const { user: delegate } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "user",
      workspace,
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await FeatureFlagFactory.basic(adminAuth, "group_management");
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: delegate.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: group.id,
    });
    expect(grant.isOk()).toBe(true);

    const response = await putGroupLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 on an invalid amount", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const group = await makeGroup(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putGroupLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: -5,
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the group does not exist", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putGroupLimit(workspace.sId, "unknown-group", {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("returns 403 when group limits are not enabled", async () => {
    vi.mocked(areGroupLimitsEnabled).mockResolvedValue(false);
    const workspace = await WorkspaceFactory.creditPriced();
    const group = await makeGroup(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putGroupLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
  });
});
