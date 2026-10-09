import * as membersUsage from "@app/lib/api/credits/members_usage";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { getCachedSeatDataByUserId } from "@app/lib/metronome/seats";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { makeMemberUsage } from "@app/tests/utils/MemberUsageFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { makeSearchResponse } from "@app/tests/utils/SearchResponseFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/credits/members_usage", async () => {
  const actual = await vi.importActual<typeof membersUsage>(
    "@app/lib/api/credits/members_usage"
  );
  return { ...actual, getMembersUsage: vi.fn() };
});

vi.mock(import("@app/lib/api/elasticsearch"), async (importOriginal) => ({
  ...(await importOriginal()),
  searchConsumptionAnalytics: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/contracts"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCachedMetronomeCurrentBillingPeriod: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seats"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCachedSeatDataByUserId: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/plan_type"), async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveContract: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seat_types"), async (importOriginal) => ({
  ...(await importOriginal()),
  getProductSeatTypes: vi.fn(),
}));

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

describe("GET /api/w/[wId]/credits/members-usage sharedUsageLimitGroup", () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof membersUsage>(
      "@app/lib/api/credits/members_usage"
    );
    vi.mocked(membersUsage.getMembersUsage).mockImplementation(
      actual.getMembersUsage
    );
    mockActiveContract(POOL_ONLY_SEATS);
    vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
      new Ok(null)
    );
    vi.mocked(getCachedSeatDataByUserId).mockResolvedValue(new Ok(null));
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok(makeSearchResponse())
    );
  });

  async function setUpBudgets({ withFlag = true } = {}) {
    const workspace = await WorkspaceFactory.creditPriced();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    if (withFlag) {
      await FeatureFlagFactory.basic(adminAuth, "group_limits");
    }
    const salesMember = await UserFactory.basic();
    const supportMember = await UserFactory.basic();
    for (const user of [salesMember, supportMember]) {
      await MembershipFactory.associate(workspace, user, { role: "user" });
    }
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    const support = await GroupFactory.regularManual(workspace, "Support");
    await GroupFactory.withRawSharedUsageLimit(sales, {
      sharedUsageLimitAwuCredits: 1_000,
      sharedUsageLimitPriority: 1,
    });
    await GroupFactory.withRawSharedUsageLimit(support, {
      sharedUsageLimitAwuCredits: 500,
      sharedUsageLimitPriority: 2,
    });
    await GroupFactory.withMembers(adminAuth, sales, [salesMember]);
    await GroupFactory.withMembers(adminAuth, support, [
      salesMember,
      supportMember,
    ]);
    return { workspace, adminAuth, sales, support, salesMember, supportMember };
  }

  async function fetchSharedUsageLimitGroups(
    workspace: WorkspaceType,
    users: UserResource[]
  ) {
    vi.spyOn(UserResource, "searchUsers").mockImplementation(
      async (_auth, { restrictToUserIds }) => {
        const pageUsers = users.filter(
          (user) => !restrictToUserIds || restrictToUserIds.includes(user.sId)
        );
        return new Ok({ users: pageUsers, total: pageUsers.length });
      }
    );

    const response = await honoApp.request(membersUsageUrl(workspace.sId));
    expect(response.status).toBe(200);
    const { members } = await response.json();
    return users.map(
      (user) =>
        members.find((m: { sId: string }) => m.sId === user.sId)
          ?.sharedUsageLimitGroup
    );
  }

  it.each<MembershipRoleType>(["admin", "manager"])(
    "returns each member's budget group to a workspace %s",
    async (role) => {
      const { workspace, sales, support, salesMember, supportMember } =
        await setUpBudgets();
      const { user: caller } = await createPrivateApiMockRequest({
        method: "GET",
        role,
        workspace,
      });

      expect(
        await fetchSharedUsageLimitGroups(workspace, [
          salesMember,
          supportMember,
          caller,
        ])
      ).toEqual([
        { kind: "visible", groupId: sales.sId, name: "Sales" },
        { kind: "visible", groupId: support.sId, name: "Support" },
        null,
      ]);
    }
  );

  it("hides the budget groups a group manager cannot read usage of", async () => {
    const { workspace, adminAuth, support, salesMember, supportMember } =
      await setUpBudgets();
    await FeatureFlagFactory.basic(adminAuth, "group_management");
    const { user: caller } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: caller.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: support.id,
    });
    expect(grant.isOk()).toBe(true);

    expect(
      await fetchSharedUsageLimitGroups(workspace, [salesMember, supportMember])
    ).toEqual([
      { kind: "hidden" },
      { kind: "visible", groupId: support.sId, name: "Support" },
    ]);
  });

  it("returns no budget group when group budgets are disabled", async () => {
    const { workspace, salesMember, supportMember } = await setUpBudgets({
      withFlag: false,
    });
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    expect(
      await fetchSharedUsageLimitGroups(workspace, [salesMember, supportMember])
    ).toEqual([null, null]);
  });
});
