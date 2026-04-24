import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  getProductMauId,
  getProductWorkspaceSeatId,
} from "@app/lib/metronome/constants";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  listMetronomeDraftInvoices: vi.fn(),
}));

import { listMetronomeDraftInvoices } from "@app/lib/metronome/client";

import handler from "./invoice";

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

function makeCurrentDraftInvoice({
  contractId,
  creditTypeId,
  total,
  lineItems,
}: {
  contractId: string;
  creditTypeId: string;
  total: number;
  lineItems: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
  }>;
}) {
  const nowMs = Date.now();

  return {
    contract_id: contractId,
    start_timestamp: new Date(nowMs - 60_000).toISOString(),
    end_timestamp: new Date(nowMs + 60_000).toISOString(),
    credit_type: { id: creditTypeId },
    total,
    line_items: lineItems,
  };
}

describe("/api/w/[wId]/metronome/invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the workspace has no Metronome contract", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ invoice: null });
    expect(vi.mocked(listMetronomeDraftInvoices)).not.toHaveBeenCalled();
  });

  it("returns a USD invoice summary in cents for a Metronome-billed workspace", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await setActiveSubscriptionBilling({
      workspaceId: workspace.id,
      stripeSubscriptionId: null,
      metronomeContractId: "m-contract-usd",
    });

    vi.mocked(listMetronomeDraftInvoices).mockResolvedValue(
      new Ok([
        makeCurrentDraftInvoice({
          contractId: "m-contract-usd",
          creditTypeId: CREDIT_TYPE_USD_ID,
          total: 8700,
          lineItems: [
            {
              product_id: getProductWorkspaceSeatId(),
              quantity: 3,
              unit_price: 2900,
            },
          ],
        }),
      ] as never)
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      invoice: expect.objectContaining({
        currency: "usd",
        estimatedAmountCents: 8700,
        seatUnitPriceCents: 2900,
        mau: null,
        mauUnitPriceCents: null,
        mauTierUnitPricesCents: null,
      }),
    });
  });

  it("converts EUR Metronome amounts to cents", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await setActiveSubscriptionBilling({
      workspaceId: workspace.id,
      stripeSubscriptionId: null,
      metronomeContractId: "m-contract-eur",
    });

    vi.mocked(listMetronomeDraftInvoices).mockResolvedValue(
      new Ok([
        makeCurrentDraftInvoice({
          contractId: "m-contract-eur",
          creditTypeId: CREDIT_TYPE_EUR_ID,
          total: 87,
          lineItems: [
            {
              product_id: getProductMauId(),
              quantity: 3,
              unit_price: 29,
            },
          ],
        }),
      ] as never)
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      invoice: expect.objectContaining({
        currency: "eur",
        estimatedAmountCents: 8700,
        seatUnitPriceCents: null,
        mau: 3,
        mauUnitPriceCents: 2900,
        mauTierUnitPricesCents: null,
      }),
    });
  });

  it("still returns invoice data for shadow-billed workspaces", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await setActiveSubscriptionBilling({
      workspaceId: workspace.id,
      stripeSubscriptionId: "sub_shadow_invoice",
      metronomeContractId: "m-contract-shadow-invoice",
    });

    vi.mocked(listMetronomeDraftInvoices).mockResolvedValue(
      new Ok([
        makeCurrentDraftInvoice({
          contractId: "m-contract-shadow-invoice",
          creditTypeId: CREDIT_TYPE_USD_ID,
          total: 2900,
          lineItems: [
            {
              product_id: getProductWorkspaceSeatId(),
              quantity: 1,
              unit_price: 2900,
            },
          ],
        }),
      ] as never)
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      invoice: expect.objectContaining({
        estimatedAmountCents: 2900,
        seatUnitPriceCents: 2900,
      }),
    });
  });
});
