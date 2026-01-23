import type Stripe from "stripe";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import * as common from "@app/lib/credits/common";
import { getCustomerPaymentStatus } from "@app/lib/credits/free";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";

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
  let countEligibleUsersSpy: MockInstance;
  let sumCommittedCreditsSpy: MockInstance;
  let fetchProgrammaticConfigSpy: MockInstance;
  let listPendingCommittedSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;

    countEligibleUsersSpy = vi
      .spyOn(common, "countEligibleUsersForCredits")
      .mockResolvedValue(10);

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
    countEligibleUsersSpy.mockRestore();
    sumCommittedCreditsSpy.mockRestore();
    fetchProgrammaticConfigSpy.mockRestore();
    listPendingCommittedSpy.mockRestore();
  });

  describe("Enterprise subscriptions", () => {
    beforeEach(() => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
    });

    it("should allow purchase with $1000 minimum limit when no payg cap", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue(null);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 1_000_000_000, // $1000 minimum
      });
    });

    it("should use $1000 minimum when payg cap is low", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue({
        paygCapMicroUsd: 1_000_000_000, // $1000 payg cap -> $500 half
      });

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 1_000_000_000, // $1000 minimum (half of $1000 is $500, less than $1000)
      });
    });

    it("should use half of payg cap when greater than $1000", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue({
        paygCapMicroUsd: 10_000_000_000, // $10,000 payg cap -> $5,000 half
      });

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 5_000_000_000, // Half of $10,000 = $5,000
      });
    });

    it("should not call getCustomerPaymentStatus for enterprise", async () => {
      await getCreditPurchaseLimits(auth, makeSubscription());

      expect(getCustomerPaymentStatus).not.toHaveBeenCalled();
    });

    it("should subtract already purchased credits from limit", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue(null);
      sumCommittedCreditsSpy.mockResolvedValue(300_000_000); // $300 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 700_000_000, // $1000 - $300 = $700
      });
    });

    it("should subtract already purchased from payg-based limit", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue({
        paygCapMicroUsd: 10_000_000_000, // $10,000 payg cap -> $5,000 half
      });
      sumCommittedCreditsSpy.mockResolvedValue(2_000_000_000); // $2000 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 3_000_000_000, // $5,000 - $2,000 = $3,000
      });
    });

    it("should return 0 if limit is exhausted", async () => {
      fetchProgrammaticConfigSpy.mockResolvedValue(null);
      sumCommittedCreditsSpy.mockResolvedValue(1_000_000_000); // $1000 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

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

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

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

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

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

    it("should calculate limit based on user count ($50/user)", async () => {
      countEligibleUsersSpy.mockResolvedValue(10);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 500_000_000, // 10 users * $50 = $500 in microUsd
      });
    });

    it("should cap at $1000 for large teams", async () => {
      countEligibleUsersSpy.mockResolvedValue(100);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 1_000_000_000, // Capped at $1000
      });
    });

    it("should allow $50 for single user", async () => {
      countEligibleUsersSpy.mockResolvedValue(1);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 50_000_000, // 1 user * $50 in microUsd
      });
    });

    it("should allow $250 for 5 users", async () => {
      countEligibleUsersSpy.mockResolvedValue(5);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 250_000_000, // 5 users * $50 = $250 in microUsd
      });
    });

    it("should cap exactly at $1000 for 20 users", async () => {
      countEligibleUsersSpy.mockResolvedValue(20);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 1_000_000_000, // 20 users * $50 = $1000 (exactly at cap)
      });
    });

    it("should cap at $1000 for more than 20 users", async () => {
      countEligibleUsersSpy.mockResolvedValue(25);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 1_000_000_000, // Capped at $1000
      });
    });

    it("should subtract already purchased credits from per-user limit", async () => {
      countEligibleUsersSpy.mockResolvedValue(10); // $500 limit
      sumCommittedCreditsSpy.mockResolvedValue(200_000_000); // $200 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 300_000_000, // $500 - $200 = $300
      });
    });

    it("should return 0 if per-user limit is exhausted", async () => {
      countEligibleUsersSpy.mockResolvedValue(5); // $250 limit
      sumCommittedCreditsSpy.mockResolvedValue(250_000_000); // $250 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountMicroUsd: 0,
      });
    });

    it("should not allow purchase when pending committed credits exist", async () => {
      listPendingCommittedSpy.mockResolvedValue([{ id: 1 } as CreditResource]);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: false,
        reason: "pending_payment",
      });
    });
  });
});
