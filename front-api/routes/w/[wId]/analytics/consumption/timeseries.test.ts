import type { ConsumptionAccessScope } from "@app/lib/api/analytics/consumption/scope";
import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/consumption/timeseries"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTimeseries: vi.fn() };
  }
);

const TIMESERIES: GetConsumptionTimeseriesResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  granularity: "day",
  mode: "daily",
  metric: "credit_micro",
  breakdownBy: null,
  groups: [{ groupKey: "total", name: "Total" }],
  points: [],
};

function postTimeseriesRequest(
  workspaceId: string,
  body: Record<string, unknown> = {},
  accessScope: ConsumptionAccessScope = "workspace"
) {
  const analyticsPath = accessScope === "user" ? "me/analytics" : "analytics";
  return honoApp.request(
    `/api/w/${workspaceId}/${analyticsPath}/consumption/timeseries`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/analytics/consumption/timeseries", () => {
  it("keeps the workspace view manager-only", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postTimeseriesRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionTimeseries)).not.toHaveBeenCalled();
  });

  it("lets members read only their own timeseries", async () => {
    vi.mocked(fetchConsumptionTimeseries).mockResolvedValue(new Ok(TIMESERIES));
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });

    const response = await postTimeseriesRequest(
      workspace.sId,
      { filter: { users: ["another-user"], models: ["model-1"] } },
      "user"
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTimeseries)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { users: [user.sId], models: ["model-1"] },
      })
    );
  });
});
