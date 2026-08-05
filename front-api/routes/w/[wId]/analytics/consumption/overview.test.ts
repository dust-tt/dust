import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// devModeConstants reads localStorage at module load. jsdom does not always
// have localStorage initialized when mock factories evaluate, which crashes
// any test whose mocked lib transitively imports AuthContext. Stub it here.
vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_STORAGE_KEY: "dust_dev_mode",
  DEV_MODE_ACTIVE: false,
}));

vi.mock(import("@app/lib/api/analytics/consumption/overview"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    fetchConsumptionOverview: vi.fn(),
  };
});

const OVERVIEW = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-07-13T00:00:00.000Z",
  },
  members: { active: 121, total: 130 },
  lastRecordAt: "2026-07-12T23:58:00.000Z",
};

async function setupTest({ role = "admin" as MembershipRoleType } = {}) {
  return createPrivateApiMockRequest({ role });
}

function getOverviewRequest(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/analytics/consumption/overview${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/w/:wId/analytics/consumption/overview", () => {
  it("returns 403 for non-manager users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getOverviewRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionOverview)).not.toHaveBeenCalled();
  });

  it("returns the overview for managers, defaulting to the current cycle", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest({ role: "admin" });

    const response = await getOverviewRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OVERVIEW);
    expect(vi.mocked(fetchConsumptionOverview)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodInput: { kind: "cycle" },
        filter: undefined,
      })
    );
  });

  it("forwards a days period and the Explore filter", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest();

    const response = await getOverviewRequest(workspace.sId, {
      period: "days",
      days: "7",
      filter: JSON.stringify({ agent: ["a1"], user: ["u1", "u2"] }),
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionOverview)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodInput: { kind: "days", days: 7 },
        filter: { agent: ["a1"], user: ["u1", "u2"] },
      })
    );
  });

  it("returns 400 on an unknown filter dimension", async () => {
    const { workspace } = await setupTest();

    const response = await getOverviewRequest(workspace.sId, {
      filter: JSON.stringify({ nope: ["x"] }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(vi.mocked(fetchConsumptionOverview)).not.toHaveBeenCalled();
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(
      new Err(
        Object.assign(new Error("boom"), { type: "query_error" as const })
      )
    );
    const { workspace } = await setupTest();

    const response = await getOverviewRequest(workspace.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
