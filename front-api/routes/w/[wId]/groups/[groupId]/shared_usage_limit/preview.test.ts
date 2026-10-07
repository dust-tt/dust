import {
  makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import { resolveMetronomeCycle } from "@app/lib/api/credits/members_usage";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import {
  expireRateLimiterKey,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
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
  resolveSpendLimitCycleBounds: vi.fn(),
}));

vi.mock(
  import("@app/lib/api/credits/members_usage"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    resolveMetronomeCycle: vi.fn(),
  })
);

vi.mock(import("@app/lib/api/elasticsearch"), async (importOriginal) => ({
  ...(await importOriginal()),
  searchConsumptionAnalytics: vi.fn(),
}));

const CYCLE = {
  cycleStart: new Date("2026-10-01T00:00:00Z"),
  cycleEnd: new Date("2026-11-01T00:00:00Z"),
};

const BOUNDS = makeSpendLimitCycleWindowBounds(
  CYCLE.cycleStart,
  CYCLE.cycleEnd
);

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
  vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(BOUNDS);
  vi.mocked(resolveMetronomeCycle).mockResolvedValue(CYCLE);
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: { by_shared_usage_limit_group: { buckets: [] } },
    })
  );
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

async function makeMembers(
  workspace: LightWorkspaceType,
  count: number
): Promise<UserResource[]> {
  const users: UserResource[] = [];
  for (let i = 0; i < count; i++) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    users.push(user);
  }
  return users;
}

async function makeGroup(
  workspace: LightWorkspaceType,
  name: string,
  members: UserResource[],
  sharedUsageLimit?: { awuCredits: number; priority: number }
): Promise<GroupResource> {
  const group = await GroupFactory.regularManual(workspace, name);
  const added = await GroupFactory.withMembers(
    await Authenticator.internalAdminForWorkspace(workspace.sId),
    group,
    members
  );
  if (added.isErr()) {
    throw added.error;
  }
  if (sharedUsageLimit) {
    await GroupFactory.withRawSharedUsageLimit(group, {
      sharedUsageLimitAwuCredits: sharedUsageLimit.awuCredits,
      sharedUsageLimitPriority: sharedUsageLimit.priority,
    });
  }
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

function getPreview(wId: string, groupId: string, query: string) {
  return honoApp.request(
    `/api/w/${wId}/groups/${groupId}/shared_usage_limit/preview?${query}`
  );
}

describe("GET /api/w/[wId]/groups/[groupId]/shared_usage_limit/preview", () => {
  it("lists the members who already draw from another group when setting a new limit", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const [alice, bob] = await makeMembers(workspace, 2);
    const sales = await makeGroup(workspace, "Sales", [bob], {
      awuCredits: 6_000,
      priority: 1,
    });
    const engineering = await makeGroup(workspace, "Engineering", [alice, bob]);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=10000"
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      usedAwuCredits: 0,
      blocksDrawingMembers: false,
      membersDrawingElsewhereCount: 1,
    });
    expect(
      body.membersDrawingElsewhere.map(
        (m: { user: { sId: string }; group: { sId: string } }) => [
          m.user.sId,
          m.group.sId,
        ]
      )
    ).toEqual([[bob.sId, sales.sId]]);
  });

  it("caps the members drawing from another group while reporting their full count", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const members = await makeMembers(workspace, 22);
    await makeGroup(workspace, "Sales", members, {
      awuCredits: 6_000,
      priority: 1,
    });
    const engineering = await makeGroup(workspace, "Engineering", members);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=10000"
    );

    const body = await response.json();
    expect(body.membersDrawingElsewhere).toHaveLength(20);
    expect(body.membersDrawingElsewhereCount).toBe(22);
  });

  it("warns that a new amount below this cycle's usage blocks the group's members", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const [alice] = await makeMembers(workspace, 1);
    const engineering = await makeGroup(workspace, "Engineering", [alice], {
      awuCredits: 10_000,
      priority: 1,
    });
    await setCounter(workspace, engineering, 5_000_000_000);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const below = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=4000"
    );
    const above = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=8000"
    );

    expect(await below.json()).toMatchObject({
      usedAwuCredits: 5_000,
      blocksDrawingMembers: true,
      membersDrawingElsewhereCount: 0,
    });
    expect((await above.json()).blocksDrawingMembers).toBe(false);
  });

  it("reports only this cycle's usage when removing the limit", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const [alice] = await makeMembers(workspace, 1);
    const engineering = await makeGroup(workspace, "Engineering", [alice], {
      awuCredits: 10_000,
      priority: 1,
    });
    await setCounter(workspace, engineering, 5_000_000_000);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=unlimited"
    );

    expect(await response.json()).toEqual({
      usedAwuCredits: 5_000,
      blocksDrawingMembers: false,
      membersDrawingElsewhere: [],
      membersDrawingElsewhereCount: 0,
    });
  });

  it("returns 400 on an invalid amount", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeGroup(workspace, "Engineering", []);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=-5"
    );

    expect(response.status).toBe(400);
  });

  it.each(["user", "manager"] as const)("refuses a %s", async (role) => {
    const workspace = await sharedUsageLimitsWorkspace();
    const engineering = await makeGroup(workspace, "Engineering", []);
    await createPrivateApiMockRequest({ method: "GET", role, workspace });

    const response = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=10000"
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when shared usage limits are not enabled", async () => {
    const workspace = await sharedUsageLimitsWorkspace({ withFlag: false });
    const engineering = await makeGroup(workspace, "Engineering", []);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getPreview(
      workspace.sId,
      engineering.sId,
      "kind=limited&awuCredits=10000"
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
  });
});
