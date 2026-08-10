import { fetchConsumptionGroupsWithActivity } from "@app/lib/api/analytics/consumption/groups_with_activity";
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

vi.mock(
  import("@app/lib/api/analytics/consumption/groups_with_activity"),
  async (orig) => {
    const mod = await orig();
    return {
      ...mod,
      fetchConsumptionGroupsWithActivity: vi.fn(),
    };
  }
);

const GROUPS_WITH_ACTIVITY = {
  groups: [
    { id: "g1", name: "Engineering", memberIds: ["u1", "u2"] },
    { id: "g2", name: "Sales", memberIds: ["u3"] },
  ],
};

async function setupTest({ role = "admin" as MembershipRoleType } = {}) {
  return createPrivateApiMockRequest({ role });
}

function getGroupsWithActivityRequest(
  wId: string,
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/analytics/consumption/groups-with-activity${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/w/:wId/analytics/consumption/groups-with-activity", () => {
  it("returns 403 for non-manager users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getGroupsWithActivityRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(
      vi.mocked(fetchConsumptionGroupsWithActivity)
    ).not.toHaveBeenCalled();
  });

  it("returns the groups with activity for managers, defaulting to the current cycle", async () => {
    vi.mocked(fetchConsumptionGroupsWithActivity).mockResolvedValue(
      new Ok(GROUPS_WITH_ACTIVITY)
    );
    const { workspace } = await setupTest({ role: "admin" });

    const response = await getGroupsWithActivityRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(GROUPS_WITH_ACTIVITY);
    expect(vi.mocked(fetchConsumptionGroupsWithActivity)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        period: expect.objectContaining({}),
        limit: 10,
      })
    );
  });

  it("forwards a days period and a custom limit", async () => {
    vi.mocked(fetchConsumptionGroupsWithActivity).mockResolvedValue(
      new Ok(GROUPS_WITH_ACTIVITY)
    );
    const { workspace } = await setupTest();

    const response = await getGroupsWithActivityRequest(workspace.sId, {
      period: "days",
      days: "7",
      limit: "50",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionGroupsWithActivity)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 50 })
    );
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionGroupsWithActivity).mockResolvedValue(
      new Err(
        Object.assign(new Error("boom"), { type: "query_error" as const })
      )
    );
    const { workspace } = await setupTest();

    const response = await getGroupsWithActivityRequest(workspace.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
