import type { Authenticator } from "@app/lib/auth";
import { getCustomerPaymentStatus } from "@app/lib/credits/free";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type Stripe from "stripe";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    isEnterpriseSubscription: vi.fn(),
  };
});

vi.mock("@app/lib/credits/free", async () => {
  const actual = await vi.importActual("@app/lib/credits/free");
  return {
    ...actual,
    getCustomerPaymentStatus: vi.fn(),
  };
});

const MONTH_SECONDS = 30 * 24 * 60 * 60;
const NOW = 1700000000;
const NOW_MS = NOW * 1000;

function makeSubscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: "sub_test",
    current_period_start: NOW,
    current_period_end: NOW + MONTH_SECONDS,
    start_date: NOW - MONTH_SECONDS * 3,
    status: "active",
    items: { data: [], has_more: false, object: "list", url: "" },
    ...overrides,
  } as Stripe.Subscription;
}

describe("getCreditPurchaseLimits", () => {
  let auth: Authenticator;
  let sumCommittedCreditsSpy: MockInstance;
  let fetchProgrammaticConfigSpy: MockInstance;
  let listPendingCommittedSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;

    sumCommittedCreditsSpy = vi
      .spyOn(CreditResource, "sumCommittedCreditsPurchasedInPeriod")
      .mockResolvedValue(0);

    fetchProgrammaticConfigSpy = vi
      .spyOn(ProgrammaticUsageConfigurationResource, "fetchByWorkspaceId")
      .mockResolvedValue(null);

    listPendingCommittedSpy = vi
      .spyOn(CreditResource, "listPendingCommitted")
      .mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    sumCommittedCreditsSpy.mockRestore();
    fetchProgrammaticConfigSpy.mockRestore();
    listPendingCommittedSpy.mockRestore();
  });

  describe("Enterprise subscriptions", () => {
    beforeEach(() => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
    });

    it("should allow purchase with $5000 minimum limit when no payg cap", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue(null);

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 5_000_000_000, // $5000 minimum
      });
    });

    it("should use $5000 minimum when payg cap is low", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue({
        paygCapMicroUsd: 1_000_000_000, // $1000 payg cap -> $500 half
      });

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 5_000_000_000, // $5000 minimum (half of $1000 is $500, less than $5000)
      });
    });

    it("should use half of payg cap when greater than $5000", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue({
        paygCapMicroUsd: 20_000_000_000, // $20,000 payg cap -> $10,000 half
      });

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 10_000_000_000, // Half of $20,000 = $10,000
      });
    });

    it("should not call getCustomerPaymentStatus for enterprise", async () => {
      await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(getCustomerPaymentStatus).not.toHaveBeenCalled();
    });

    it("should subtract already purchased credits from limit", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue(null);
      sumCommittedCreditsSpy.mockResolvedValue(300_000_000); // $300 already purchased

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 4_700_000_000, // $5000 - $300 = $4700
      });
    });

    it("should subtract already purchased from payg-based limit", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue({
        paygCapMicroUsd: 20_000_000_000, // $20,000 payg cap -> $10,000 half
      });
      sumCommittedCreditsSpy.mockResolvedValue(2_000_000_000); // $2000 already purchased

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 8_000_000_000, // $10,000 - $2,000 = $8,000
      });
    });

    it("should return 0 if limit is exhausted", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue(null);
      sumCommittedCreditsSpy.mockResolvedValue(5_000_000_000); // $5000 already purchased

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 0,
      });
    });
  });

  describe("Pro subscriptions - trialing", () => {
    it("should not allow purchase for trialing customers", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
      vi.mocked(getCustomerPaymentStatus).mockResolvedValue("trialing");

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: false,
        reason: "trialing",
      });
    });
  });

  describe("Pro subscriptions - payment issue", () => {
    it("should not allow purchase for not_paying status", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
      vi.mocked(getCustomerPaymentStatus).mockResolvedValue("not_paying");

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: false,
        reason: "payment_issue",
      });
    });
  });

  describe("Pro subscriptions - paying", () => {
    beforeEach(() => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
      vi.mocked(getCustomerPaymentStatus).mockResolvedValue("paying");
    });

    it("should allow a flat $5000 per billing cycle", async () => {
      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 5_000_000_000, // Flat $5000
      });
    });

    it("should subtract already purchased credits from the limit", async () => {
      sumCommittedCreditsSpy.mockResolvedValue(200_000_000); // $200 already purchased

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 4_800_000_000, // $5000 - $200 = $4800
      });
    });

    it("should return 0 if the limit is exhausted", async () => {
      sumCommittedCreditsSpy.mockResolvedValue(5_000_000_000); // $5000 already purchased

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 0,
      });
    });

    it("should not allow purchase when pending committed credits exist", async () => {
      listPendingCommittedSpy.mockResolvedValue([{ id: 1 } as CreditResource]);

      const result = await getCreditPurchaseLimits(auth, {
        type: "stripe-subscription",
        stripeSubscription: makeSubscription(),
      });

      expect(result).toEqual({
        canPurchase: false,
        reason: "pending_payment",
      });
    });
  });
});
