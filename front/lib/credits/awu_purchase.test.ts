import { Authenticator } from "@app/lib/auth";
import { getAwuPurchaseInfo } from "@app/lib/credits/awu_purchase";
import { getMetronomeCustomerStripeCustomerId } from "@app/lib/metronome/client";
import { getCreditTypeFromContract } from "@app/lib/metronome/coupons";
import {
  type CachedContract,
  getActiveContract,
} from "@app/lib/metronome/plan_type";
import { getStripeClient } from "@app/lib/plans/stripe";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { isCreditPricedPlan } from "@app/types/plan";
import { Ok } from "@app/types/shared/result";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual("@app/lib/metronome/client");
  return {
    ...actual,
    getMetronomeCustomerStripeCustomerId: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/coupons", async () => {
  const actual = await vi.importActual("@app/lib/metronome/coupons");
  return {
    ...actual,
    getCreditTypeFromContract: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual("@app/lib/metronome/plan_type");
  return {
    ...actual,
    getActiveContract: vi.fn(),
    isLegacyPlan: vi.fn(),
  };
});

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    getStripeClient: vi.fn(),
  };
});

function makeInvoiceList(
  invoices: Stripe.Invoice[]
): Stripe.ApiList<Stripe.Invoice> {
  return {
    object: "list",
    url: "/v1/invoices",
    has_more: false,
    data: invoices,
  } as Stripe.ApiList<Stripe.Invoice>;
}

function makeAwuPurchaseInvoice({
  amountPaid,
  amountCredits,
}: {
  amountPaid: number;
  amountCredits: number;
}): Stripe.Invoice {
  return {
    id: "in_awu_purchase",
    status: "paid",
    amount_paid: amountPaid,
    metadata: {
      awu_purchase: "true",
      awu_amount_credits: String(amountCredits),
    },
  } as unknown as Stripe.Invoice;
}

describe("getAwuPurchaseInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tracks prior EUR purchases using the invoice credit metadata rather than amount_paid", async () => {
    const workspace = await WorkspaceFactory.metronome();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    const updateResult = await WorkspaceResource.updateMetronomeCustomerId(
      workspace.id,
      "m_customer"
    );
    expect(updateResult.isOk()).toBe(true);

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    vi.mocked(isCreditPricedPlan).mockReturnValue(true);
    vi.mocked(getMetronomeCustomerStripeCustomerId).mockResolvedValue(
      new Ok("cus_123")
    );
    vi.mocked(getActiveContract).mockResolvedValue({
      rate_card_id: "rc_123",
    } as CachedContract);
    vi.mocked(getCreditTypeFromContract).mockResolvedValue(
      new Ok({ creditTypeId: "eur-credit-type", currency: "eur" })
    );

    const listInvoices = vi
      .fn()
      .mockResolvedValueOnce(makeInvoiceList([]))
      .mockResolvedValueOnce(
        makeInvoiceList([
          makeAwuPurchaseInvoice({
            amountPaid: 870_000,
            amountCredits: 1_000_000,
          }),
        ])
      );

    vi.mocked(getStripeClient).mockReturnValue({
      invoices: {
        list: listInvoices,
      },
    } as unknown as Stripe);

    const result = await getAwuPurchaseInfo(auth);

    expect(result).toEqual({
      canPurchase: true,
      remainingCycleCredits: 0,
      currency: "eur",
    });
  });
});
