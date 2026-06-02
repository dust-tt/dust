import { getProgrammaticCost } from "@app/lib/api/analytics/programmatic_cost";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
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

vi.mock(import("@app/lib/api/analytics/programmatic_cost"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    getProgrammaticCost: vi.fn(),
  };
});

async function setupTest({ role = "admin" as MembershipRoleType } = {}) {
  const { workspace, ...rest } = await createPrivateApiMockRequest({
    role,
  });
  return { workspace, ...rest };
}

function getProgrammaticCostRequest(
  wId: string,
  query: Record<string, string> = { billingCycleStartDay: "1" }
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/analytics/programmatic-cost${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/w/:wId/analytics/programmatic-cost", () => {
  it("returns 403 for non-admin users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getProgrammaticCostRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
    expect(vi.mocked(getProgrammaticCost)).not.toHaveBeenCalled();
  });

  it("returns 200 with cost data for admin users", async () => {
    vi.mocked(getProgrammaticCost).mockResolvedValue(
      new Ok({ points: [], availableGroups: [] })
    );
    const { workspace } = await setupTest();

    const response = await getProgrammaticCostRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      points: [],
      availableGroups: [],
    });
  });

  it("returns 400 when billingCycleStartDay is missing", async () => {
    const { workspace } = await setupTest();

    const response = await getProgrammaticCostRequest(workspace.sId, {});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });
});
