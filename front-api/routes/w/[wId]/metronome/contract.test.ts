import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
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

function contractUrl(wId: string) {
  return `/api/w/${wId}/metronome/contract`;
}

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
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await honoApp.request(contractUrl(workspace.sId));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ contract: null });
      expect(vi.mocked(getMetronomeContractById)).not.toHaveBeenCalled();
    });

    it("returns the contract summary for a Metronome-billed workspace", async () => {
      const { workspace } = await createPrivateApiMockRequest({
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

      const response = await honoApp.request(contractUrl(workspace.sId));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        contract: {
          planFamily: "pro",
          contractEndingAtMs: new Date("2025-05-01T00:00:00.000Z").getTime(),
          hasSeatSubscription: false,
          hasPersonalCreditSeats: false,
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
      const { workspace } = await createPrivateApiMockRequest({
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

      const response = await honoApp.request(contractUrl(workspace.sId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
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
      const { workspace } = await createPrivateApiMockRequest({
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

      const response = await honoApp.request(contractUrl(workspace.sId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
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
        const { workspace } = await createPrivateApiMockRequest({
          method: "PATCH",
          role: "admin",
        });

        await setActiveSubscriptionBilling({
          workspaceId: workspace.id,
          stripeSubscriptionId,
          metronomeContractId,
        });

        const response = await honoApp.request(contractUrl(workspace.sId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        expect(response.status).toBe(400);
        expect((await response.json()).error.type).toBe(
          "subscription_state_invalid"
        );
      }

      expect(vi.mocked(scheduleMetronomeContractEnd)).not.toHaveBeenCalled();
      expect(vi.mocked(reactivateMetronomeContract)).not.toHaveBeenCalled();
    });
  });
});
