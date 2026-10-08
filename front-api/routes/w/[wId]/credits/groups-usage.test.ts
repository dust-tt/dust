import {
  makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import {
  resolveMetronomeCycle,
  resolveSpendLimitCycleBounds,
} from "@app/lib/spend_limits/cycle";
import {
  expireRateLimiterKey,
  getFixedWindowCount,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { makeBillingCycle } from "@app/tests/utils/BillingCycleFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/api/redis");

vi.mock(import("@app/lib/metronome/plan_type"), async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveContract: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seat_types"), async (importOriginal) => ({
  ...(await importOriginal()),
  getProductSeatTypes: vi.fn(),
}));

vi.mock(import("@app/lib/spend_limits/cycle"), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveMetronomeCycle: vi.fn(),
  resolveSpendLimitCycleBounds: vi.fn(),
}));

vi.mock(import("@app/lib/api/elasticsearch"), async (importOriginal) => ({
  ...(await importOriginal()),
  searchConsumptionAnalytics: vi.fn(),
}));

const CYCLE = makeBillingCycle();

const BOUNDS = makeSpendLimitCycleWindowBounds(
  CYCLE.cycleStart,
  CYCLE.cycleEnd
);

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
  vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(BOUNDS);
  vi.mocked(resolveMetronomeCycle).mockResolvedValue(CYCLE);
  mockConsumedBySharedUsageLimitGroup([]);
});

function mockConsumedBySharedUsageLimitGroup(
  consumed: { group: GroupResource; microCredits: number }[]
) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {
        by_shared_usage_limit_group: {
          buckets: consumed.map(({ group, microCredits }) => ({
            key: group.sId,
            credits: { value: microCredits },
          })),
        },
      },
    })
  );
}

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
  { awuCredits, priority }: { awuCredits: number; priority: number }
) {
  const group = await GroupFactory.regularManual(workspace, name);
  await GroupFactory.withRawSharedUsageLimit(group, {
    sharedUsageLimitAwuCredits: awuCredits,
    sharedUsageLimitPriority: priority,
  });
  const expired = await expireRateLimiterKey({
    key: `${makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group)}:${BOUNDS.label}`,
  });
  if (expired.isErr()) {
    throw expired.error;
  }
  return group;
}

async function setCounter(
  workspace: LightWorkspaceType,
  group: GroupResource,
  microCredits: number
) {
  const result = await setFixedWindowCount({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds: BOUNDS,
    value: microCredits,
    logger,
  });
  if (result.isErr()) {
    throw result.error;
  }
}

async function readCounter(
  workspace: LightWorkspaceType,
  group: GroupResource
) {
  const result = await getFixedWindowCount({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds: BOUNDS,
  });
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function getGroupsUsage(wId: string) {
  return honoApp.request(`/api/w/${wId}/credits/groups-usage`);
}

describe("GET /api/w/[wId]/credits/groups-usage", () => {
  it("reports each limited group's limit and usage this cycle", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    const sales = await makeLimitedGroup(workspace, "Sales", {
      awuCredits: 6_000,
      priority: 2,
    });
    const support = await makeLimitedGroup(workspace, "Support", {
      awuCredits: 3_000,
      priority: 3,
    });
    await GroupFactory.regularManual(workspace, "Marketing");
    await setCounter(workspace, engineering, 2_500_000_000);
    mockConsumedBySharedUsageLimitGroup([
      { group: sales, microCredits: 500_000_000 },
    ]);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          limitAwuCredits: 10_000,
          usedAwuCredits: 2_500,
          usageTarget: "on_target",
        },
        {
          groupId: sales.sId,
          limitAwuCredits: 6_000,
          usedAwuCredits: 500,
          usageTarget: "on_target",
        },
        {
          groupId: support.sId,
          limitAwuCredits: 3_000,
          usedAwuCredits: 0,
          usageTarget: "on_target",
        },
      ],
    });
  });

  it("fills every group without a counter from a single analytics query, without seeding", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    const sales = await makeLimitedGroup(workspace, "Sales", {
      awuCredits: 6_000,
      priority: 2,
    });
    mockConsumedBySharedUsageLimitGroup([
      { group: engineering, microCredits: 2_000_000_000 },
      { group: sales, microCredits: 500_000_000 },
    ]);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    expect(await readCounter(workspace, engineering)).toBe(0);
    expect(await readCounter(workspace, sales)).toBe(0);
  });

  it("reports no usage when the analytics index cannot be read", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("connection_error", "es down"))
    );
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          limitAwuCredits: 10_000,
          usedAwuCredits: 0,
          usageTarget: "on_target",
        },
      ],
    });
  });

  it("reports no usage when the billing cycle is unknown", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    await setCounter(workspace, engineering, 2_500_000_000);
    vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(null);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          limitAwuCredits: 10_000,
          usedAwuCredits: 0,
          usageTarget: null,
        },
      ],
    });
    expect(searchConsumptionAnalytics).not.toHaveBeenCalled();
  });

  it("reports each limited group's pace against the billing cycle", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    const sales = await makeLimitedGroup(workspace, "Sales", {
      awuCredits: 10_000,
      priority: 2,
    });
    const support = await makeLimitedGroup(workspace, "Support", {
      awuCredits: 10_000,
      priority: 3,
    });
    await setCounter(workspace, engineering, 500_000_000);
    await setCounter(workspace, sales, 2_500_000_000);
    await setCounter(workspace, support, 6_000_000_000);
    vi.mocked(resolveMetronomeCycle).mockResolvedValue(
      makeBillingCycle({ elapsedDays: 3, remainingDays: 27 })
    );
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    expect(
      groups.map(({ usageTarget }: { usageTarget: string }) => usageTarget)
    ).toEqual(["on_target", "elevated", "critical"]);
  });

  it("reports every limited group to a workspace manager", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    const sales = await makeLimitedGroup(workspace, "Sales", {
      awuCredits: 6_000,
      priority: 2,
    });
    await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          limitAwuCredits: 10_000,
          usedAwuCredits: 0,
          usageTarget: "on_target",
        },
        {
          groupId: sales.sId,
          limitAwuCredits: 6_000,
          usedAwuCredits: 0,
          usageTarget: "on_target",
        },
      ],
    });
  });

  it("reports only the groups a group manager manages", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeLimitedGroup(workspace, "Engineering", {
      awuCredits: 10_000,
      priority: 1,
    });
    await makeLimitedGroup(workspace, "Sales", {
      awuCredits: 6_000,
      priority: 2,
    });
    const { user: delegate } = await createPrivateApiMockRequest({
      method: "GET",
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
      resourceId: engineering.id,
    });
    expect(grant.isOk()).toBe(true);

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          limitAwuCredits: 10_000,
          usedAwuCredits: 0,
          usageTarget: "on_target",
        },
      ],
    });
  });

  it("refuses a regular member", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(403);
  });

  it("returns 403 when shared usage limits are not enabled", async () => {
    const workspace = await sharedUsageLimitsWorkspace({ withFlag: false });
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
    expect(getActiveContract).not.toHaveBeenCalled();
  });
});
