import type Stripe from "stripe";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { getCustomerStatus } from "@app/lib/credits/free";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { isEnterpriseSubscription } from "@app/lib/plans/stripe";
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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);

    const { authenticator } = await createResourceTest({ role: "admin" });
    auth = authenticator;

    getMembersCountSpy = vi
      .spyOn(MembershipResource, "getMembersCountForWorkspace")
      .mockResolvedValue(10);
  });

  afterEach(() => {
    vi.useRealTimers();
    getMembersCountSpy.mockRestore();
  });

  describe("Enterprise subscriptions", () => {
    it("should allow purchase with $1000 limit for enterprise", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: true,
        maxAmountCents: 100_000,
      });
    });

    it("should not call getCustomerStatus for enterprise", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);

      await getCreditPurchaseLimits(auth, makeSubscription());

      expect(getCustomerStatus).not.toHaveBeenCalled();
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

    it("should not allow purchase for null customer status", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
      vi.mocked(getCustomerStatus).mockResolvedValue(null);

      const result = await getCreditPurchaseLimits(auth, makeSubscription());

      expect(result).toEqual({
        canPurchase: false,
        reason: "trialing",
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
  });
});
