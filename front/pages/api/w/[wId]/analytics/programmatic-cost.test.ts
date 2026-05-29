import { getProgrammaticCost } from "@app/lib/api/analytics/programmatic_cost";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

import handler from "./programmatic-cost";

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
  const { req, res, workspace, ...rest } = await createPrivateApiMockRequest({
    role,
    method: "GET",
  });
  req.query.wId = workspace.sId;
  req.query.billingCycleStartDay = "1";
  return { req, res, workspace, ...rest };
}

describe("GET /api/w/[wId]/analytics/programmatic-cost", () => {
  it("returns 403 for non-admin users", async () => {
    const { req, res } = await setupTest({ role: "user" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("workspace_auth_error");
    expect(vi.mocked(getProgrammaticCost)).not.toHaveBeenCalled();
  });

  it("returns 200 with cost data for admin users", async () => {
    vi.mocked(getProgrammaticCost).mockResolvedValue(
      new Ok({ points: [], availableGroups: [] })
    );
    const { req, res } = await setupTest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ points: [], availableGroups: [] });
  });

  it("returns 400 when billingCycleStartDay is missing", async () => {
    const { req, res } = await setupTest();
    delete req.query.billingCycleStartDay;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "POST",
    });
    req.query.wId = workspace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error.type).toBe("method_not_supported_error");
  });
});
