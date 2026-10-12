import { Authenticator } from "@app/lib/auth";
import type * as planType from "@app/lib/metronome/plan_type";
import type * as seatTypes from "@app/lib/metronome/seat_types";
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
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return { ...actual, getActiveContract: vi.fn() };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return { ...actual, getProductSeatTypes: vi.fn() };
});

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
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

function putSharedUsageLimit(
  wId: string,
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${wId}/groups/${groupId}/shared_usage_limit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/w/[wId]/groups/[groupId]/shared_usage_limit", () => {
  it("lets an admin set a shared usage limit", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    const { auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putSharedUsageLimit(workspace.sId, group.sId, {
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
    expect(reloaded.value.sharedUsageLimitAwuCredits).toBe(10_000);
    expect(reloaded.value.sharedUsageLimitPriority).toBe(1);
  });

  it("lets a workspace manager set a shared usage limit", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    const { auth } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "manager",
      workspace,
    });

    const response = await putSharedUsageLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(200);
    const reloaded = await GroupResource.fetchById(auth, group.sId);
    if (reloaded.isErr()) {
      throw reloaded.error;
    }
    expect(reloaded.value.sharedUsageLimitAwuCredits).toBe(10_000);
  });

  it("refuses a regular member", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "user",
      workspace,
    });

    const response = await putSharedUsageLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(403);
  });

  it("refuses a group manager of that group", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    const { user: delegate } = await createPrivateApiMockRequest({
      method: "PUT",
      role: "user",
      workspace,
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: delegate.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: group.id,
    });
    expect(grant.isOk()).toBe(true);

    const response = await putSharedUsageLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 on an invalid amount", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putSharedUsageLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: -5,
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the group does not exist", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putSharedUsageLimit(workspace.sId, "unknown-group", {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("returns 403 when shared usage limits are not enabled", async () => {
    const workspace = await sharedUsageLimitsWorkspace({ withFlag: false });
    const group = await GroupFactory.regularManual(workspace, "Engineering");
    await createPrivateApiMockRequest({
      method: "PUT",
      role: "admin",
      workspace,
    });

    const response = await putSharedUsageLimit(workspace.sId, group.sId, {
      kind: "limited",
      awuCredits: 10_000,
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
  });
});
