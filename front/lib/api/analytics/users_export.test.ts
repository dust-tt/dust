import { fetchUserExportRows } from "@app/lib/api/analytics/users_export";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep everything else real; only stub the Elasticsearch query so the test does
// not depend on a live cluster. Message metrics are irrelevant here: the rows
// come from the memberships, not from Elasticsearch.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

// The group memberships are read from the read replica; in tests there is no
// replica so point it at the primary test connection.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

function mockEsMetrics(buckets: unknown[] = []) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {
        by_user: { buckets },
      },
    })
  );
}

describe("fetchUserExportRows", () => {
  beforeEach(() => {
    mockEsMetrics();
  });

  it("returns one row per member with all export columns filled in", async () => {
    const { workspace, user: admin } = await createResourceTest({
      role: "admin",
    });

    const member = await UserFactory.basic();
    await member.recordLoginActivity(new Date("2025-01-10T09:15:00Z"));
    await MembershipFactory.associate(workspace, member, { role: "user" });

    // Two messages sent on two distinct days, the last one on 2025-01-12.
    mockEsMetrics([
      {
        key: member.sId,
        doc_count: 2,
        unique_messages: { value: 2 },
        last_message: { value: Date.UTC(2025, 0, 12, 8, 0, 0) },
        active_days: { buckets: [{ doc_count: 1 }, { doc_count: 1 }] },
        credit_micro: { value: 41_600_000 },
      },
    ]);

    const result = await fetchUserExportRows({
      baseQuery: { match_all: {} },
      owner: { ...workspace, ssoEnforced: false },
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: new Date(),
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toHaveLength(2);

    // Every column of the row, so a new one cannot be added unnoticed.
    expect(result.value.find((r) => r.userId === member.sId)).toEqual({
      userId: member.sId,
      userName: member.fullName(),
      userEmail: member.email,
      userStatus: "active",
      lastLoginAt: "2025-01-10",
      messageCount: 2,
      lastMessageSent: "2025-01-12",
      activeDaysCount: 2,
      groups: "",
      credits: 42,
    });

    // The admin has no activity in the window, so their metrics are zeroed.
    expect(result.value.find((r) => r.userId === admin.sId)).toMatchObject({
      userStatus: "active",
      messageCount: 0,
      lastMessageSent: "",
      activeDaysCount: 0,
      credits: 0,
    });
  });

  it("reports the last login date in the request timezone and the membership status", async () => {
    const { workspace, user: admin } = await createResourceTest({
      role: "admin",
    });

    const now = new Date();
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = daysAgo(30);
    const tenDaysAgo = daysAgo(10);

    // Logged in on 2025-01-10 at 23:30 UTC, i.e. already the 11th in Tokyo,
    // which is the timezone the export runs in.
    const activeUser = await UserFactory.basic();
    await activeUser.recordLoginActivity(new Date("2025-01-10T23:30:00Z"));
    await MembershipFactory.associate(workspace, activeUser, { role: "user" });

    const neverLoggedInUser = await UserFactory.withoutLastLogin();
    await MembershipFactory.associate(workspace, neverLoggedInUser, {
      role: "user",
    });

    const revokedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, revokedUser, {
      role: "user",
      startAt: thirtyDaysAgo,
    });
    const revokeResult = await MembershipResource.revokeMembership({
      user: revokedUser,
      workspace,
      endAt: tenDaysAgo,
    });
    expect(revokeResult.isOk()).toBe(true);

    const result = await fetchUserExportRows({
      baseQuery: { match_all: {} },
      owner: { ...workspace, ssoEnforced: false },
      startDate: daysAgo(60),
      // Memberships were created after `now` was captured, so the window has to
      // extend past them.
      endDate: new Date(),
      timezone: "Asia/Tokyo",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    const rowsByUserId = new Map(result.value.map((r) => [r.userId, r]));

    expect(rowsByUserId.get(activeUser.sId)).toMatchObject({
      lastLoginAt: "2025-01-11",
      userStatus: "active",
    });
    expect(rowsByUserId.get(neverLoggedInUser.sId)).toMatchObject({
      lastLoginAt: "",
      userStatus: "unregistered",
    });
    expect(rowsByUserId.get(revokedUser.sId)).toMatchObject({
      userStatus: "revoked",
    });
    // The admin created by the test harness is active too.
    expect(rowsByUserId.get(admin.sId)?.userStatus).toBe("active");
  });
});
