import { fetchConsumptionGroupsWithActivity } from "@app/lib/api/analytics/consumption/groups_with_activity";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { makeSId } from "@app/lib/resources/string_ids";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function mockGroupBuckets(buckets: unknown[]) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({ aggregations: { by_group: { buckets } } }) as Awaited<
      ReturnType<typeof searchConsumptionAnalytics>
    >
  );
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth, workspace };
}

describe("fetchConsumptionGroupsWithActivity", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("resolves group names from Postgres and carries member sIds off the aggregation, sorted by name", async () => {
    const { auth, workspace } = await setup();
    const sales = await GroupFactory.regularManual(workspace, "Sales");
    const engineering = await GroupFactory.regularManual(
      workspace,
      "Engineering"
    );
    mockGroupBuckets([
      { key: sales.sId, members: { buckets: [{ key: "u1" }, { key: "u2" }] } },
      { key: engineering.sId, members: { buckets: [{ key: "u3" }] } },
    ]);

    const result = await fetchConsumptionGroupsWithActivity(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.groups).toEqual([
      { id: engineering.sId, name: "Engineering", memberIds: ["u3"] },
      { id: sales.sId, name: "Sales", memberIds: ["u1", "u2"] },
    ]);
  });

  it("silently drops a group sId that no longer resolves in Postgres (hard-deleted group)", async () => {
    const { auth, workspace } = await setup();
    const deletedGroupSId = makeSId("group", {
      id: 999_999_999,
      workspaceId: workspace.id,
    });
    mockGroupBuckets([
      { key: deletedGroupSId, members: { buckets: [{ key: "u1" }] } },
    ]);

    const result = await fetchConsumptionGroupsWithActivity(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.groups).toEqual([]);
  });

  it("returns an empty list when no document carries a group", async () => {
    const { auth } = await setup();
    mockGroupBuckets([]);

    const result = await fetchConsumptionGroupsWithActivity(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.groups).toEqual([]);
  });

  it("aggregates directly on user.group_ids, scoped to the workspace and period", async () => {
    const { auth } = await setup();
    mockGroupBuckets([]);

    await fetchConsumptionGroupsWithActivity(auth, {
      period: PERIOD,
      limit: 25,
    });

    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];
    expect(query.bool?.filter).toContainEqual({
      range: { completed_at: { gte: PERIOD.startDate, lt: PERIOD.endDate } },
    });
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "user.group_ids",
      size: 25,
    });
    expect(options?.aggregations?.by_group?.aggs?.members?.terms).toMatchObject(
      { field: "user.id" }
    );
  });
});
