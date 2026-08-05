import type { Authenticator } from "@app/lib/auth";
import { upsertCreditPricedPlans } from "@app/lib/plans/credit_priced_plans";
import { CREDIT_PRICED_BUSINESS_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetCreditsResponseBody } from "@app/types/credits";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function creditsUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/credits`;
}

async function createFreeCredit({
  auth,
  invoiceOrLineItemId,
  startDate,
  expirationDate,
}: {
  auth: Authenticator;
  invoiceOrLineItemId: string;
  startDate: Date;
  expirationDate: Date;
}) {
  const credit = await CreditResource.makeNew(auth, {
    type: "free",
    initialAmountMicroUsd: 100_000_000,
    consumedAmountMicroUsd: 0,
    discount: null,
    invoiceOrLineItemId,
  });
  const result = await credit.start(auth, { startDate, expirationDate });
  if (result.isErr()) {
    throw result.error;
  }
}

describe("GET /api/w/[wId]/credits", () => {
  it("uses the recurring grant expiration rather than a one-off free credit", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const nowMs = Date.now();
    const recurringExpirationDate = new Date(nowMs + 10 * 24 * 60 * 60 * 1000);

    await createFreeCredit({
      auth,
      invoiceOrLineItemId: `free-poke-${workspace.sId}-${nowMs}`,
      startDate: new Date(nowMs - 24 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs + 24 * 60 * 60 * 1000),
    });
    await createFreeCredit({
      auth,
      invoiceOrLineItemId: `free-renewal-sub_test-${nowMs}`,
      startDate: new Date(nowMs - 2 * 24 * 60 * 60 * 1000),
      expirationDate: recurringExpirationDate,
    });

    const response = await honoApp.request(creditsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body: GetCreditsResponseBody = await response.json();
    expect(body.freeCreditRenewalDateMs).toBe(
      recurringExpirationDate.getTime()
    );
  });

  it("omits the renewal date when there is no active recurring grant", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const nowMs = Date.now();

    await createFreeCredit({
      auth,
      invoiceOrLineItemId: `free-poke-${workspace.sId}-${nowMs}`,
      startDate: new Date(nowMs - 24 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs + 24 * 60 * 60 * 1000),
    });

    const response = await honoApp.request(creditsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body: GetCreditsResponseBody = await response.json();
    expect(body.freeCreditRenewalDateMs).toBeUndefined();
  });

  it("omits legacy recurring grant dates for credit-priced plans", async () => {
    await upsertCreditPricedPlans(CREDIT_PRICED_BUSINESS_PLAN_CODE);
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const nowMs = Date.now();

    await createFreeCredit({
      auth,
      invoiceOrLineItemId: `free-renewal-sub_legacy-${nowMs}`,
      startDate: new Date(nowMs - 24 * 60 * 60 * 1000),
      expirationDate: new Date(nowMs + 10 * 24 * 60 * 60 * 1000),
    });
    await auth.getNonNullableSubscriptionResource().swapMetronomeContract({
      metronomeContractId: `contract_credit_priced_${workspace.sId}`,
      planCode: CREDIT_PRICED_BUSINESS_PLAN_CODE,
    });
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await honoApp.request(creditsUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body: GetCreditsResponseBody = await response.json();
    expect(body.freeCreditRenewalDateMs).toBeUndefined();
  });
});
