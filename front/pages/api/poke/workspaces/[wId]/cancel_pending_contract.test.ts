import {
  archiveMetronomeContract,
  reactivateMetronomeContract,
} from "@app/lib/metronome/client";
import { clearScheduledSubscriptionCancellation } from "@app/lib/plans/stripe";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./cancel_pending_contract";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    archiveMetronomeContract: vi.fn(),
    reactivateMetronomeContract: vi.fn(),
  };
});

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual<typeof import("@app/lib/plans/stripe")>(
    "@app/lib/plans/stripe"
  );
  return {
    ...actual,
    clearScheduledSubscriptionCancellation: vi.fn(),
  };
});

const METRONOME_CUSTOMER_ID = "cust_test_xxx";
const CURRENT_CONTRACT_ID = "contract_current_xxx";
const PENDING_CONTRACT_ID = "contract_pending_yyy";
const STRIPE_SUB_ID = "sub_stripe_xxx";

async function makeSubscriptionMetronomeBilled(
  workspace: WorkspaceType,
  contractId: string | null,
  { stripeSubscriptionId = null }: { stripeSubscriptionId?: string | null } = {}
): Promise<number> {
  const workspaceModelId = (await WorkspaceResource.fetchById(workspace.sId))!
    .id;
  await WorkspaceResource.updateMetronomeCustomerId(
    workspaceModelId,
    METRONOME_CUSTOMER_ID
  );
  const sub =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspaceModelId);
  if (!sub) {
    throw new Error("Test setup: workspace has no active subscription");
  }
  await sub.markAsEnded("ended");
  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId: workspaceModelId,
      planId: sub.planId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId,
      metronomeContractId: contractId,
    },
    sub.getPlan()
  );
  return workspaceModelId;
}

beforeEach(() => {
  vi.mocked(archiveMetronomeContract).mockResolvedValue(new Ok(undefined));
  vi.mocked(reactivateMetronomeContract).mockResolvedValue(new Ok(undefined));
  vi.mocked(clearScheduledSubscriptionCancellation).mockResolvedValue(
    new Ok(undefined)
  );
});

describe("POST /api/poke/workspaces/[wId]/cancel_pending_contract", () => {
  it("archives the pending contract, restores the current contract/sub, and deletes the pending subscription", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    const workspaceModelId = await makeSubscriptionMetronomeBilled(
      workspace,
      CURRENT_CONTRACT_ID,
      { stripeSubscriptionId: STRIPE_SUB_ID }
    );
    await SubscriptionResource.createPendingMetronomeContract({
      workspaceModelId,
      planCode: "PRO_PLAN_SEAT_29",
      metronomeContractId: PENDING_CONTRACT_ID,
      startDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    req.query.wId = workspace.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(reactivateMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        contractId: CURRENT_CONTRACT_ID,
      })
    );
    expect(clearScheduledSubscriptionCancellation).toHaveBeenCalledWith({
      stripeSubscriptionId: STRIPE_SUB_ID,
    });
    expect(archiveMetronomeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        metronomeCustomerId: METRONOME_CUSTOMER_ID,
        contractId: PENDING_CONTRACT_ID,
      })
    );

    const pending =
      await SubscriptionResource.fetchPendingByWorkspaceModelId(
        workspaceModelId
      );
    expect(pending).toBeNull();
  });

  it("does not touch Stripe when the current subscription is not Stripe-billed", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    const workspaceModelId = await makeSubscriptionMetronomeBilled(
      workspace,
      CURRENT_CONTRACT_ID
    );
    await SubscriptionResource.createPendingMetronomeContract({
      workspaceModelId,
      planCode: "PRO_PLAN_SEAT_29",
      metronomeContractId: PENDING_CONTRACT_ID,
      startDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    req.query.wId = workspace.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(clearScheduledSubscriptionCancellation).not.toHaveBeenCalled();
    expect(archiveMetronomeContract).toHaveBeenCalled();
  });

  it("returns 400 when there is no pending subscription", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    await makeSubscriptionMetronomeBilled(workspace, CURRENT_CONTRACT_ID);

    req.query.wId = workspace.sId;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "No pending subscription"
    );
    expect(archiveMetronomeContract).not.toHaveBeenCalled();
    expect(reactivateMetronomeContract).not.toHaveBeenCalled();
  });
});
