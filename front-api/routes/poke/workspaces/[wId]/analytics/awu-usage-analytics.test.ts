import { getAwuUsageFromAnalytics } from "@app/lib/api/analytics/awu_usage_analytics";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// devModeConstants reads localStorage at module load. jsdom does not always
// have localStorage initialized when mock factories evaluate, which crashes
// any test whose mocked lib transitively imports AuthContext. Stub it here.
vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_STORAGE_KEY: "dust_dev_mode",
  DEV_MODE_ACTIVE: false,
}));

vi.mock(import("@app/lib/api/analytics/awu_usage_analytics"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    getAwuUsageFromAnalytics: vi.fn(),
  };
});

function getAwuUsageAnalyticsRequest(
  wId: string,
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/poke/workspaces/${wId}/analytics/awu-usage-analytics${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/poke/workspaces/:wId/analytics/awu-usage-analytics", () => {
  it("returns 401 for non-super-users", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: false,
      role: "admin",
    });

    const response = await getAwuUsageAnalyticsRequest(workspace.sId);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { type: "not_authenticated" },
    });
    expect(vi.mocked(getAwuUsageFromAnalytics)).not.toHaveBeenCalled();
  });

  it("returns 200 with usage data for super-users", async () => {
    vi.mocked(getAwuUsageFromAnalytics).mockResolvedValue(
      new Ok({
        granularity: "day",
        groups: [{ groupKey: "total", name: "Total usage" }],
        points: [{ timestamp: 0, values: { total: 42 } }],
      })
    );
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await getAwuUsageAnalyticsRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      granularity: "day",
      groups: [{ groupKey: "total", name: "Total usage" }],
      points: [{ timestamp: 0, values: { total: 42 } }],
    });
  });

  it("returns a CSV attachment when format=csv", async () => {
    vi.mocked(getAwuUsageFromAnalytics).mockResolvedValue(
      new Ok({
        granularity: "day",
        groups: [{ groupKey: "total", name: "Total usage" }],
        points: [{ timestamp: 0, values: { total: 42 } }],
      })
    );
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await getAwuUsageAnalyticsRequest(workspace.sId, {
      format: "csv",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const body = await response.text();
    expect(body).toContain("date,granularity,series,credits");
    expect(body).toContain("Total usage");
  });
});
