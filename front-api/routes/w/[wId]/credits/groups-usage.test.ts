import { Authenticator } from "@app/lib/auth";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/metronome/plan_type"), async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveContract: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seat_types"), async (importOriginal) => ({
  ...(await importOriginal()),
  getProductSeatTypes: vi.fn(),
}));

vi.mock(import("@app/lib/spend_limits/cycle"), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveSpendLimitCycleBounds: vi.fn(),
}));

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
  vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(null);
});

async function groupLimitsWorkspace({
  withFlag = true,
}: {
  withFlag?: boolean;
} = {}) {
  const workspace = await WorkspaceFactory.creditPriced();
  if (withFlag) {
    await FeatureFlagFactory.basic(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      "group_limits"
    );
  }
  return workspace;
}

function getGroupsUsage(wId: string) {
  return honoApp.request(`/api/w/${wId}/credits/groups-usage`);
}

describe("GET /api/w/[wId]/credits/groups-usage", () => {
  it("lists the limited groups with their limit for an admin", async () => {
    const workspace = await groupLimitsWorkspace();
    const engineering = await GroupFactory.regularManual(
      workspace,
      "Engineering"
    );
    await GroupFactory.regularManual(workspace, "Sales");
    await GroupFactory.withRawGroupLimit(engineering, {
      groupLimitAwuCredits: 10_000,
      groupLimitPriority: 1,
    });
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          limitAwuCredits: 10_000,
          usedAwuCredits: 0,
        },
      ],
    });
  });

  it.each(["user", "manager"] as const)("refuses a %s", async (role) => {
    const workspace = await groupLimitsWorkspace();
    await createPrivateApiMockRequest({ method: "GET", role, workspace });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(403);
  });

  it("returns 403 when group limits are not enabled", async () => {
    const workspace = await groupLimitsWorkspace({ withFlag: false });
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getGroupsUsage(workspace.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
    expect(getActiveContract).not.toHaveBeenCalled();
  });
});
