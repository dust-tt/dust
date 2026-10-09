import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/metronome/plan_type"), async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveContract: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seat_types"), async (importOriginal) => ({
  ...(await importOriginal()),
  getProductSeatTypes: vi.fn(),
}));

vi.mock(import("@app/lib/api/audit/workos_audit"), async (importOriginal) => ({
  ...(await importOriginal()),
  emitAuditLogEvent: vi.fn(),
}));

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
  vi.mocked(emitAuditLogEvent).mockResolvedValue(undefined);
});

async function sharedUsageLimitsWorkspace({
  withFlag = true,
}: {
  withFlag?: boolean;
} = {}) {
  const workspace = await WorkspaceFactory.creditPriced();
  if (withFlag) {
    await FeatureFlagFactory.basic(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      "group_limits"
    );
  }
  return workspace;
}

async function makeLimitedGroup(
  workspace: LightWorkspaceType,
  name: string,
  priority: number
) {
  const group = await GroupFactory.regularManual(workspace, name);
  await GroupFactory.withRawSharedUsageLimit(group, {
    sharedUsageLimitAwuCredits: 1_000,
    sharedUsageLimitPriority: priority,
  });
  return group;
}

async function makeLimitedGroups(workspace: LightWorkspaceType) {
  return {
    engineering: await makeLimitedGroup(workspace, "Engineering", 2),
    sales: await makeLimitedGroup(workspace, "Sales", 5),
    support: await makeLimitedGroup(workspace, "Support", 9),
  };
}

async function listOrder(workspace: LightWorkspaceType) {
  const groups = await GroupResource.listGroupsWithSharedUsageLimit(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );
  return groups.map((group) => [group.sId, group.sharedUsageLimitPriority]);
}

function putPriorities(
  wId: string,
  body: { orderedGroupIds: string[]; expectedOrderedGroupIds: string[] }
) {
  return honoApp.request(`/api/w/${wId}/groups/shared_usage_limit_priorities`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/w/[wId]/groups/shared_usage_limit_priorities", () => {
  it("reorders the groups with a budget, keeping their priority numbers", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const orderedGroupIds = [support.sId, engineering.sId, sales.sId];
    const response = await putPriorities(workspace.sId, {
      orderedGroupIds,
      expectedOrderedGroupIds: [engineering.sId, sales.sId, support.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderedGroupIds });
    expect(await listOrder(workspace)).toEqual([
      [support.sId, 2],
      [engineering.sId, 5],
      [sales.sId, 9],
    ]);
  });

  it("emits one audit event per group whose position changed", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    await putPriorities(workspace.sId, {
      orderedGroupIds: [sales.sId, engineering.sId, support.sId],
      expectedOrderedGroupIds: [engineering.sId, sales.sId, support.sId],
    });

    expect(emitAuditLogEvent).toHaveBeenCalledTimes(2);
    expect(emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "group.shared_usage_limit_priority_updated",
        metadata: { position: "1", previous_position: "2" },
      })
    );
    expect(emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "group.shared_usage_limit_priority_updated",
        metadata: { position: "2", previous_position: "1" },
      })
    );
  });

  it("lets a workspace manager reorder", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "manager",
      workspace,
    });

    const response = await putPriorities(workspace.sId, {
      orderedGroupIds: [sales.sId, engineering.sId, support.sId],
      expectedOrderedGroupIds: [engineering.sId, sales.sId, support.sId],
    });

    expect(response.status).toBe(200);
  });

  it("refuses a regular member", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "user",
      workspace,
    });

    const response = await putPriorities(workspace.sId, {
      orderedGroupIds: [sales.sId, engineering.sId, support.sId],
      expectedOrderedGroupIds: [engineering.sId, sales.sId, support.sId],
    });

    expect(response.status).toBe(403);
  });

  it("refuses a group manager", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
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
      resourceId: sales.id,
    });
    expect(grant.isOk()).toBe(true);

    const response = await putPriorities(workspace.sId, {
      orderedGroupIds: [sales.sId, engineering.sId, support.sId],
      expectedOrderedGroupIds: [engineering.sId, sales.sId, support.sId],
    });

    expect(response.status).toBe(403);
  });

  it("returns 409 and writes nothing when the order changed since it was loaded", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putPriorities(workspace.sId, {
      orderedGroupIds: [support.sId, engineering.sId, sales.sId],
      expectedOrderedGroupIds: [sales.sId, engineering.sId, support.sId],
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.type).toBe(
      "shared_usage_limit_order_changed"
    );
    expect(await listOrder(workspace)).toEqual([
      [engineering.sId, 2],
      [sales.sId, 5],
      [support.sId, 9],
    ]);
  });

  it.each([
    ["misses a group", (ids: string[]) => ids.slice(0, 2)],
    ["repeats a group", (ids: string[]) => [ids[0], ids[0], ids[1]]],
    ["lists an unknown group", (ids: string[]) => [...ids.slice(0, 2), "x"]],
  ])("returns 400 when the order %s", async (_, makeOrder) => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });
    const currentOrder = [engineering.sId, sales.sId, support.sId];

    const response = await putPriorities(workspace.sId, {
      orderedGroupIds: makeOrder(currentOrder),
      expectedOrderedGroupIds: currentOrder,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe(
      "invalid_shared_usage_limit_order"
    );
  });

  it("returns 403 when shared usage limits are not enabled", async () => {
    const workspace = await sharedUsageLimitsWorkspace({ withFlag: false });
    const { engineering, sales, support } = await makeLimitedGroups(workspace);
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putPriorities(workspace.sId, {
      orderedGroupIds: [sales.sId, engineering.sId, support.sId],
      expectedOrderedGroupIds: [engineering.sId, sales.sId, support.sId],
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
  });
});
