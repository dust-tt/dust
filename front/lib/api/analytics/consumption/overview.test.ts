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

function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

describe("fetchConsumptionOverview", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("counts distinct messages in the scoped period", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        active_members: { value: 2 },
        message_count: { value: 7 },
        total_credit_micro: { value: 0 },
      })
    );

    const result = await fetchConsumptionOverview(auth, {
      periodInput: { kind: "days", days: 7 },
      filter: { agents: ["agent-1"] },
      includeWorkspaceContext: false,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.members).toEqual({ active: 2, total: 2 });
    expect(result.value.messageCount).toBe(7);
    expect(
      vi.mocked(searchConsumptionAnalytics).mock.calls[0]?.[1]?.aggregations
        ?.message_count?.cardinality
    ).toEqual({
      field: "agent_message_id",
      precision_threshold: 40_000,
    });
  });
});
