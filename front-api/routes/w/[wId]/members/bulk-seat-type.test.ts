import type { BulkSeatChangePreview } from "@app/lib/api/credits/bulk_seat_change";
import { computeBulkSeatChangePreview } from "@app/lib/api/credits/bulk_seat_change";
import { UserResource } from "@app/lib/resources/user_resource";
import * as bulkClient from "@app/temporal/bulk_seat_change/client";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/bulk_seat_change/client", () => ({
  runBulkChangeSeatTypeWorkflow: vi.fn(),
}));

vi.mock(
  import("@app/lib/api/credits/bulk_seat_change"),
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      computeBulkSeatChangePreview: vi.fn(),
    };
  }
);

function bulkSeatTypeUrl(wId: string) {
  return `/api/w/${wId}/members/bulk-seat-type`;
}

async function makeMetronomeWorkspace(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({ metronomeCustomerId: "cust_test_bulk" });
}

function post(wId: string, body: unknown, path = "") {
  return honoApp.request(`${bulkSeatTypeUrl(wId)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PREVIEW: BulkSeatChangePreview = {
  memberCount: 2,
  targetSeatType: "max",
  targetSeatName: "Max Seat",
  currency: "usd",
  moves: [
    {
      fromSeatType: "pro",
      fromSeatName: "Pro Seat",
      kind: "immediate",
      count: 2,
    },
  ],
  immediateDeltaMonthlyCents: 4000,
  deferredDeltaMonthlyCents: 0,
  nextBillingPeriodAt: null,
  seatTotals: [
    {
      seatType: "max",
      seatName: "Max Seat",
      committedSeats: 0,
      assignedBefore: 1,
      assignedAfter: 3,
    },
  ],
};

beforeEach(() => {
  vi.mocked(bulkClient.runBulkChangeSeatTypeWorkflow).mockResolvedValue(
    new Ok({ workflowId: "wf_test_bulk_seat" })
  );
  vi.mocked(computeBulkSeatChangePreview).mockResolvedValue(new Ok(PREVIEW));
  // The workspace-scoped search that validates membership. Default to "no
  // match"; tests that need members override with real UserFactory users.
  vi.spyOn(UserResource, "searchAllUsers").mockResolvedValue(
    new Ok({ users: [], total: 0 })
  );
});

describe("POST /api/w/[wId]/members/bulk-seat-type", () => {
  it("returns 403 when the caller is a user", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
      workspace,
    });

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["u1"] },
      seatType: "max",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(bulkClient.runBulkChangeSeatTypeWorkflow).not.toHaveBeenCalled();
  });

  it("allows a business admin to launch the workflow", async () => {
    const workspace = await makeMetronomeWorkspace();
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "business_admin",
      workspace,
    });
    await FeatureFlagFactory.basic(auth, "pricing_groups");

    const member = await UserFactory.basic();
    vi.mocked(UserResource.searchAllUsers).mockResolvedValue(
      new Ok({ users: [member], total: 1 })
    );

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: [member.sId] },
      seatType: "max",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workflowId: "wf_test_bulk_seat",
      memberCount: 1,
    });
    expect(bulkClient.runBulkChangeSeatTypeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: workspace.sId,
        userIds: [member.sId],
        seatType: "max",
      })
    );
  });

  it("returns 403 when the pricing_groups flag is off", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["u1"] },
      seatType: "max",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
    expect(bulkClient.runBulkChangeSeatTypeWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when the target seat type is not a paid seat", async () => {
    const workspace = await makeMetronomeWorkspace();
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    await FeatureFlagFactory.basic(auth, "pricing_groups");

    for (const seatType of ["free", "none"]) {
      const response = await post(workspace.sId, {
        selection: { mode: "ids", userIds: ["u1"] },
        seatType,
      });
      expect(response.status).toBe(400);
    }
    expect(bulkClient.runBulkChangeSeatTypeWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when no submitted ids are active members", async () => {
    const workspace = await makeMetronomeWorkspace();
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    await FeatureFlagFactory.basic(auth, "pricing_groups");

    const response = await post(workspace.sId, {
      selection: { mode: "ids", userIds: ["stale1", "stale2"] },
      seatType: "max",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    expect(bulkClient.runBulkChangeSeatTypeWorkflow).not.toHaveBeenCalled();
  });
});

describe("POST /api/w/[wId]/members/bulk-seat-type/preview", () => {
  it("returns the computed preview for a business admin", async () => {
    const workspace = await makeMetronomeWorkspace();
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "business_admin",
      workspace,
    });
    await FeatureFlagFactory.basic(auth, "pricing_groups");

    const member = await UserFactory.basic();
    vi.mocked(UserResource.searchAllUsers).mockResolvedValue(
      new Ok({ users: [member], total: 1 })
    );

    const response = await post(
      workspace.sId,
      {
        selection: { mode: "ids", userIds: [member.sId] },
        seatType: "max",
      },
      "/preview"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preview: PREVIEW });
    expect(computeBulkSeatChangePreview).toHaveBeenCalledWith(
      expect.anything(),
      { userIds: [member.sId], targetSeatType: "max" }
    );
  });

  it("returns 403 when the caller is a user", async () => {
    const workspace = await makeMetronomeWorkspace();
    await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
      workspace,
    });

    const response = await post(
      workspace.sId,
      {
        selection: { mode: "ids", userIds: ["u1"] },
        seatType: "max",
      },
      "/preview"
    );

    expect(response.status).toBe(403);
    expect(computeBulkSeatChangePreview).not.toHaveBeenCalled();
  });
});
