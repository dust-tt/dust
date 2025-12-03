import type Stripe from "stripe";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { getCustomerStatus } from "@app/lib/credits/free";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
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
    getCustomerStatus: vi.fn(),
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
  let getMembersCountSpy: MockInstance;
  let sumCreditsSpy: MockInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;

    getMembersCountSpy = vi
      .spyOn(MembershipResource, "getMembersCountForWorkspace")
      .mockResolvedValue(10);

    sumCreditsSpy = vi
      .spyOn(CreditResource, "sumCommittedCreditsPurchasedInPeriod")
      .mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    getMembersCountSpy.mockRestore();
    sumCreditsSpy.mockRestore();
  });

  describe("Enterprise subscriptions", () => {
    beforeEach(() => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
    });

    it("should allow purchase with $1000 limit for enterprise", async () => {
      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 100_000,
      });
    });

    it("should not call getCustomerStatus for enterprise", async () => {
      await getCreditPurchaseLimits(auth, makeSubscription());

      expect(getCustomerStatus).not.toHaveBeenCalled();
    });

    it("should subtract already purchased credits from limit", async () => {
      sumCreditsSpy.mockResolvedValue(30_000); // $300 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 70_000, // $1000 - $300 = $700
      });
    });

    it("should return 0 when limit is exhausted", async () => {
      sumCreditsSpy.mockResolvedValue(100_000); // $1000 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 0,
      });
    });

    it("should not return negative when over limit", async () => {
      sumCreditsSpy.mockResolvedValue(120_000); // $1200 already purchased (over limit)

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 0,
      });
    });
  });

  describe("Pro subscriptions - trialing", () => {
    it("should not allow purchase for trialing customers", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
      vi.mocked(getCustomerStatus).mockResolvedValue("trialing");

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: false,
        reason: "trialing",
      });
    });
  });

  describe("Pro subscriptions - payment issue", () => {
    it("should not allow purchase when customer status is null", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
      vi.mocked(getCustomerStatus).mockResolvedValue(null);

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
      vi.mocked(getCustomerStatus).mockResolvedValue("paying");
    });

    it("should calculate limit based on user count ($50/user)", async () => {
      getMembersCountSpy.mockResolvedValue(10);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 50_000, // 10 users * $50
      });
    });

    it("should cap at $1000 for large teams", async () => {
      getMembersCountSpy.mockResolvedValue(100);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 100_000, // Capped at $1000
      });
    });

    it("should allow $50 for single user", async () => {
      getMembersCountSpy.mockResolvedValue(1);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 5_000, // 1 user * $50
      });
    });

    it("should allow $250 for 5 users", async () => {
      getMembersCountSpy.mockResolvedValue(5);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 25_000, // 5 users * $50
      });
    });

    it("should cap exactly at $1000 for 20 users", async () => {
      getMembersCountSpy.mockResolvedValue(20);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 100_000, // 20 users * $50 = $1000 (exactly at cap)
      });
    });

    it("should cap at $1000 for more than 20 users", async () => {
      getMembersCountSpy.mockResolvedValue(25);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 100_000, // Capped at $1000
      });
    });

    it("should subtract already purchased credits from limit", async () => {
      getMembersCountSpy.mockResolvedValue(10); // $500 limit
      sumCreditsSpy.mockResolvedValue(20_000); // $200 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 30_000, // $500 - $200 = $300
      });
    });

    it("should return 0 when cycle limit is exhausted", async () => {
      getMembersCountSpy.mockResolvedValue(10); // $500 limit
      sumCreditsSpy.mockResolvedValue(50_000); // $500 already purchased

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 0,
      });
    });

    it("should not return negative when over cycle limit", async () => {
      getMembersCountSpy.mockResolvedValue(10); // $500 limit
      sumCreditsSpy.mockResolvedValue(60_000); // $600 already purchased (over limit)

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 0,
      });
    });

    it("should use billing cycle dates from subscription", async () => {
      const customPeriodStart = NOW - 10 * 24 * 60 * 60; // 10 days ago
      const customPeriodEnd = NOW + 20 * 24 * 60 * 60; // 20 days from now

      await getCreditPurchaseLimits(
        auth,
        makeSubscription({
          current_period_start: customPeriodStart,
          current_period_end: customPeriodEnd,
        })
      );

      expect(sumCreditsSpy).toHaveBeenCalledWith(
        auth,
        new Date(customPeriodStart * 1000),
        new Date(customPeriodEnd * 1000)
      );
    });
  });
});
