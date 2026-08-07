import { fetchConsumptionRelevantGroups } from "@app/lib/api/analytics/consumption/relevant_groups";
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
  import("@app/lib/api/analytics/consumption/relevant_groups"),
  async (orig) => {
    const mod = await orig();
    return {
      ...mod,
      fetchConsumptionRelevantGroups: vi.fn(),
    };
  }
);

const RELEVANT_GROUPS = {
  groups: [
    { id: "g1", name: "Engineering", memberIds: ["u1", "u2"] },
    { id: "g2", name: "Sales", memberIds: ["u3"] },
  ],
};

async function setupTest({ role = "admin" as MembershipRoleType } = {}) {
  return createPrivateApiMockRequest({ role });
}

function getRelevantGroupsRequest(
  wId: string,
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/analytics/consumption/relevant-groups${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/w/:wId/analytics/consumption/relevant-groups", () => {
  it("returns 403 for non-manager users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getRelevantGroupsRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionRelevantGroups)).not.toHaveBeenCalled();
  });

  it("returns the relevant groups for managers, defaulting to the current cycle", async () => {
    vi.mocked(fetchConsumptionRelevantGroups).mockResolvedValue(
      new Ok(RELEVANT_GROUPS)
    );
    const { workspace } = await setupTest({ role: "admin" });

    const response = await getRelevantGroupsRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RELEVANT_GROUPS);
    expect(vi.mocked(fetchConsumptionRelevantGroups)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        period: expect.objectContaining({}),
        limit: 10,
      })
    );
  });

  it("forwards a days period and a custom limit", async () => {
    vi.mocked(fetchConsumptionRelevantGroups).mockResolvedValue(
      new Ok(RELEVANT_GROUPS)
    );
    const { workspace } = await setupTest();

    const response = await getRelevantGroupsRequest(workspace.sId, {
      period: "days",
      days: "7",
      limit: "50",
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionRelevantGroups)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 50 })
    );
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionRelevantGroups).mockResolvedValue(
      new Err(
        Object.assign(new Error("boom"), { type: "query_error" as const })
      )
    );
    const { workspace } = await setupTest();

    const response = await getRelevantGroupsRequest(workspace.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
