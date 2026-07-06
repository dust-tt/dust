import {
  CREDIT_TYPE_EUR_ID,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { Invoice } from "@metronome/sdk/resources/v1/customers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  listMetronomeDraftInvoices: vi.fn(),
}));

import { listMetronomeDraftInvoices } from "@app/lib/metronome/client";

function invoiceLinesUrl(wId: string) {
  return `/api/w/${wId}/metronome/invoice/lines`;
}

async function setActiveSubscriptionBilling({
  workspaceId,
  metronomeContractId,
}: {
  workspaceId: number;
  metronomeContractId: string;
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
      stripeSubscriptionId: null,
      metronomeContractId,
    },
    currentSubscription.getPlan()
  );

  const updateResult = await WorkspaceResource.updateMetronomeCustomerId(
    workspaceId,
    "m-customer"
  );

  if (updateResult.isErr()) {
    throw updateResult.error;
  }
}

function makeCurrentDraftInvoice({
  contractId,
  lineItems,
}: {
  contractId: string;
  lineItems: Invoice.LineItem[];
}): Invoice {
  const nowMs = Date.now();

  return {
    id: "inv-1",
    type: "USAGE",
    status: "DRAFT",
    customer_id: "m-customer",
    contract_id: contractId,
    start_timestamp: new Date(nowMs - 60_000).toISOString(),
    end_timestamp: new Date(nowMs + 60_000).toISOString(),
    credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
    total: 0,
    line_items: lineItems,
  };
}

describe("/api/w/[wId]/metronome/invoice/lines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns charge lines and applied credit lines for a discounted invoice", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await setActiveSubscriptionBilling({
      workspaceId: workspace.id,
      metronomeContractId: "m-contract-lines",
    });

    vi.mocked(listMetronomeDraftInvoices).mockResolvedValue(
      new Ok([
        makeCurrentDraftInvoice({
          contractId: "m-contract-lines",
          lineItems: [
            {
              name: "Pro Seat",
              type: "subscription",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              quantity: 3,
              unit_price: 29,
              total: 87,
              is_prorated: false,
            },
            {
              name: "Coupon: WELCOME100 applied",
              type: "applied_commit_or_credit",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              total: -87,
              applied_commit_or_credit: { id: "credit-1", type: "CREDIT" },
            },
            // Sub-cent noise: dropped.
            {
              name: "Rounding artifact",
              type: "usage",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              total: 0.001,
            },
            // Non-fiat (AWU) line: dropped by the currency filter.
            {
              name: "Credits (AWU)",
              type: "usage",
              credit_type: { id: getCreditTypeAwuId(), name: "AWU" },
              total: 500,
            },
          ],
        }),
      ])
    );

    const response = await honoApp.request(invoiceLinesUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currency).toBe("eur");
    expect(body.lineItems).toHaveLength(2);
    expect(body.lineItems[0]).toMatchObject({
      name: "Pro Seat",
      type: "subscription",
      quantity: 3,
      unitPriceCents: 2900,
      totalCents: 8700,
    });
    expect(body.lineItems[1]).toMatchObject({
      name: "Coupon: WELCOME100 applied",
      type: "applied_commit_or_credit",
      totalCents: -8700,
    });
  });

  it("merges charge lines split by credit application and credit lines sharing a coupon", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await setActiveSubscriptionBilling({
      workspaceId: workspace.id,
      metronomeContractId: "m-contract-merge",
    });

    const periodStart = "2026-08-01T00:00:00.000Z";
    const periodEnd = "2026-09-01T00:00:00.000Z";

    vi.mocked(listMetronomeDraftInvoices).mockResolvedValue(
      new Ok([
        makeCurrentDraftInvoice({
          contractId: "m-contract-merge",
          lineItems: [
            // A single Max Seat split by Metronome into the portion covered
            // by the coupon credit and the uncovered remainder.
            {
              name: "Max Seat",
              type: "subscription",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              quantity: 1 / 3,
              unit_price: 150,
              total: 50,
              is_prorated: false,
              starting_at: periodStart,
              ending_before: periodEnd,
              applied_commit_or_credit: { id: "credit-1", type: "CREDIT" },
            },
            {
              name: "Max Seat",
              type: "subscription",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              quantity: 2 / 3,
              unit_price: 150,
              total: 100,
              is_prorated: false,
              starting_at: periodStart,
              ending_before: periodEnd,
            },
            // A prorated Max Seat line over a different period: not merged.
            {
              name: "Max Seat",
              type: "subscription",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              quantity: 1,
              unit_price: 145.97,
              total: 145.97,
              is_prorated: true,
              starting_at: "2026-07-02T00:00:00.000Z",
              ending_before: periodEnd,
            },
            // The same coupon applied to two products: one applied line each.
            {
              name: "Coupon: SEAT50 applied",
              type: "applied_commit_or_credit",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              total: -50,
              starting_at: periodStart,
              ending_before: periodEnd,
              applied_commit_or_credit: { id: "credit-1", type: "CREDIT" },
            },
            {
              name: "Coupon: SEAT50 applied",
              type: "applied_commit_or_credit",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              total: -30,
              starting_at: periodStart,
              ending_before: periodEnd,
              applied_commit_or_credit: { id: "credit-1", type: "CREDIT" },
            },
            // The same coupon applied over a different period: not merged.
            {
              name: "Coupon: SEAT50 applied",
              type: "applied_commit_or_credit",
              credit_type: { id: CREDIT_TYPE_EUR_ID, name: "EUR" },
              total: -10,
              starting_at: "2026-07-02T00:00:00.000Z",
              ending_before: periodStart,
              applied_commit_or_credit: { id: "credit-1", type: "CREDIT" },
            },
          ],
        }),
      ])
    );

    const response = await honoApp.request(invoiceLinesUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.currency).toBe("eur");
    expect(body.lineItems).toHaveLength(4);
    expect(body.lineItems[0]).toMatchObject({
      name: "Max Seat",
      unitPriceCents: 15000,
      totalCents: 15000,
      periodStartMs: new Date(periodStart).getTime(),
      periodEndMs: new Date(periodEnd).getTime(),
    });
    expect(body.lineItems[0].quantity).toBeCloseTo(1, 6);
    expect(body.lineItems[1]).toMatchObject({
      name: "Max Seat",
      isProrated: true,
      totalCents: 14597,
    });
    expect(body.lineItems[2]).toMatchObject({
      name: "Coupon: SEAT50 applied",
      totalCents: -8000,
      periodStartMs: new Date(periodStart).getTime(),
      periodEndMs: new Date(periodEnd).getTime(),
    });
    expect(body.lineItems[3]).toMatchObject({
      name: "Coupon: SEAT50 applied",
      totalCents: -1000,
      periodStartMs: new Date("2026-07-02T00:00:00.000Z").getTime(),
      periodEndMs: new Date(periodStart).getTime(),
    });
  });
});
