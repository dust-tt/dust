import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  listMetronomeDraftInvoices: vi.fn(),
  scheduleMetronomeContractEnd: vi.fn(),
  reactivateMetronomeContract: vi.fn(),
}));

import {
  getMetronomeContractById,
  listMetronomeDraftInvoices,
  reactivateMetronomeContract,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";

import handler from "./contract";

async function setActiveSubscriptionBilling({
  workspaceId,
  stripeSubscriptionId,
  metronomeContractId,
}: {
  workspaceId: number;
  stripeSubscriptionId: string | null;
  metronomeContractId: string | null;
}) {
  const currentSubscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspaceId);

  if (!currentSubscription) {
    throw new Error("Expected an active subscription.");
  }

  await currentSubscription.markAsEnded("ended");

  await SubscriptionResource.makeNew(
    {
      sId: generateRandomModelSId(),
      workspaceId,
      planId: currentSubscription.planId,
      status: "active",
      trialing: false,
      startDate: new Date(),
      endDate: null,
      stripeSubscriptionId,
      metronomeContractId,
    },
    currentSubscription.getPlan()
  );

  if (metronomeContractId) {
    const updateResult = await WorkspaceResource.updateMetronomeCustomerId(
      workspaceId,
      "m-customer"
    );

    if (updateResult.isErr()) {
      throw updateResult.error;
    }
  }
}

function makeCurrentDraftInvoice({ contractId }: { contractId: string }) {
  const nowMs = Date.now();

  return {
    contract_id: contractId,
    start_timestamp: new Date(nowMs - 60_000).toISOString(),
    end_timestamp: new Date(nowMs + 60_000).toISOString(),
  };
}

describe("/api/w/[wId]/metronome/contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns null when the workspace has no Metronome contract", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ contract: null });
      expect(vi.mocked(getMetronomeContractById)).not.toHaveBeenCalled();
    });

    it("returns the contract summary for a Metronome-billed workspace", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      await setActiveSubscriptionBilling({
        workspaceId: workspace.id,
        stripeSubscriptionId: null,
        metronomeContractId: "m-contract-get",
      });

      vi.mocked(getMetronomeContractById).mockResolvedValue(
        new Ok({
          custom_fields: {},
          ending_before: "2025-05-01T00:00:00.000Z",
        } as never)
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        contract: {
          planFamily: "pro",
          mauTiers: null,
          contractEndingAt: new Date("2025-05-01T00:00:00.000Z").getTime(),
        },
      });
      expect(vi.mocked(getMetronomeContractById)).toHaveBeenCalledWith({
        metronomeCustomerId: "m-customer",
        metronomeContractId: "m-contract-get",
      });
    });
  });

  describe("PATCH", () => {
    it("cancels a true Metronome-billed subscription", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      await setActiveSubscriptionBilling({
        workspaceId: workspace.id,
        stripeSubscriptionId: null,
        metronomeContractId: "m-contract-cancel",
      });

      vi.mocked(listMetronomeDraftInvoices).mockResolvedValue(
        new Ok([
          makeCurrentDraftInvoice({ contractId: "m-contract-cancel" }),
        ] as never)
      );
      vi.mocked(scheduleMetronomeContractEnd).mockResolvedValue(
        new Ok(undefined)
      );

      req.body = { action: "cancel" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ success: true });
      expect(vi.mocked(scheduleMetronomeContractEnd)).toHaveBeenCalledWith({
        metronomeCustomerId: "m-customer",
        contractId: "m-contract-cancel",
        endingBefore: expect.any(Date),
      });

      const updatedSubscription =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
      expect(updatedSubscription?.endDate).not.toBeNull();
    });

    it("reactivates a true Metronome-billed subscription", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      await setActiveSubscriptionBilling({
        workspaceId: workspace.id,
        stripeSubscriptionId: null,
        metronomeContractId: "m-contract-reactivate",
      });

      const subscription =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
      if (!subscription) {
        throw new Error("Expected an active subscription.");
      }
      await subscription.markAsCanceled({
        endDate: new Date(Date.now() + 60_000),
      });

      vi.mocked(reactivateMetronomeContract).mockResolvedValue(
        new Ok(undefined)
      );

      req.body = { action: "reactivate" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ success: true });
      expect(vi.mocked(reactivateMetronomeContract)).toHaveBeenCalledWith({
        metronomeCustomerId: "m-customer",
        contractId: "m-contract-reactivate",
      });

      const updatedSubscription =
        await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
      expect(updatedSubscription?.endDate).toBeNull();
      expect(updatedSubscription?.requestCancelAt).toBeNull();
    });

    it.each([
      {
        title: "stripe-billed subscriptions",
        stripeSubscriptionId: "sub_stripe_only",
        metronomeContractId: null,
      },
      {
        title: "shadow-billed subscriptions",
        stripeSubscriptionId: "sub_shadow",
        metronomeContractId: "m-contract-shadow",
      },
    ])("rejects cancel and reactivate for $title", async ({
      stripeSubscriptionId,
      metronomeContractId,
    }) => {
      for (const action of ["cancel", "reactivate"] as const) {
        const { req, res, workspace } = await createPrivateApiMockRequest({
          method: "PATCH",
          role: "admin",
        });

        await setActiveSubscriptionBilling({
          workspaceId: workspace.id,
          stripeSubscriptionId,
          metronomeContractId,
        });

        req.body = { action };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(res._getJSONData().error.type).toBe(
          "subscription_state_invalid"
        );
      }

      expect(vi.mocked(scheduleMetronomeContractEnd)).not.toHaveBeenCalled();
      expect(vi.mocked(reactivateMetronomeContract)).not.toHaveBeenCalled();
    });
  });
});
