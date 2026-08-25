import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

describe("fetchConsumptionOverview", () => {
  afterEach(() => {
    vi.mocked(resolveDimensionLabels).mockReset();
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("returns the top user from the overview aggregation", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "user-1",
          {
            name: "Aubin",
            pictureUrl: null,
            description: null,
          },
        ],
      ])
    );
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        active_members: { value: 1 },
        total_credit_micro: { value: 5_000_000 },
        top_user: {
          buckets: [
            {
              key: "user-1",
              doc_count: 3,
              credit_micro: { value: 3_000_000 },
            },
          ],
        },
      })
    );

    const result = await fetchConsumptionOverview(auth, {
      periodInput: { kind: "days", days: 7 },
      includeWorkspaceContext: false,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.topUser).toEqual({
      userId: "user-1",
      name: "Aubin",
      credits: 3,
    });
    expect(
      vi.mocked(searchConsumptionAnalytics).mock.calls[0]?.[1]?.aggregations
        ?.top_user
    ).toEqual({
      terms: {
        field: "user.id",
        size: 1,
        order: { credit_micro: "desc" },
      },
      aggs: {
        credit_micro: { sum: { field: "credit_micro" } },
      },
    });
  });
});
