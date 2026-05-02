import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
  getCustomerPaymentStatus,
} from "@app/lib/credits/free";
import {
  getSubscriptionInvoices,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { LightWorkspaceType } from "@app/types/user";
import type Stripe from "stripe";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual("@app/lib/plans/stripe");
  return {
    ...actual,
    getSubscriptionInvoices: vi.fn(),
    isEnterpriseSubscription: vi.fn(),
  };
});

vi.mock("@app/lib/auth", async () => {
  const actual = await vi.importActual("@app/lib/auth");
  return {
    ...actual,
    getFeatureFlags: vi.fn(),
  };
});

const MONTH_SECONDS = 30 * 24 * 60 * 60;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const NOW = 1700000000; // Fixed timestamp for tests
const NOW_MS = NOW * 1000;

function makeSubscription(
  currentPeriodStart: number,
  startDate: number,
  status: Stripe.Subscription.Status = "active",
  interval: "month" | "year" = "month"
): Stripe.Subscription {
  return {
    id: "sub_123",
    current_period_start: currentPeriodStart,
    start_date: startDate,
    status,
    items: {
      data: [{ price: { recurring: { interval } } }],
    },
  } as Stripe.Subscription;
}

function makeInvoice(periodEnd: number): Stripe.Invoice {
  return {
    period_end: periodEnd,
    billing_reason: "subscription_cycle",
    status: "paid",
  } as Stripe.Invoice;
}

function makeWorkspace(
  overrides: Partial<LightWorkspaceType> = {}
): LightWorkspaceType {
  return {
    id: 1,
    sId: "ws_123",
    name: "Test Workspace",
    role: "admin",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    metadata: null,
    metronomeCustomerId: null,
    sharingPolicy: "all_scopes",
    ...overrides,
  };
}

describe("checkCustomerStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("paying customers (have recent paid invoice)", () => {
    it("returns 'paying' with recent payment (within 2 billing cycles)", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
      expect(getSubscriptionInvoices).toHaveBeenCalledWith({
        subscriptionId: "sub_123",
        status: "paid",
        createdSinceDate: expect.any(Date),
      });
    });

    it("returns 'paying' with payment exactly at 2 billing cycles", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 2),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for trialing customer who paid early", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW, "trialing")
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for new customer who paid early", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 0.5),
      ]);
      const result = await getCustomerPaymentStatus(makeSubscription(NOW, NOW));
      expect(result).toBe("paying");
    });
  });

  describe("trialing customers (no paid invoice but trialing or new)", () => {
    it("returns 'trialing' for new subscription without paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(makeSubscription(NOW, NOW));
      expect(result).toBe("trialing");
    });

    it("returns 'trialing' for subscription started just under 1 month ago", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS + 1)
      );
      expect(result).toBe("trialing");
    });

    it("returns 'trialing' for trialing subscription without paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 2, "trialing")
      );
      expect(result).toBe("trialing");
    });
  });

  describe("not eligible (no recent payment and not trialing/new)", () => {
    it("returns 'not_paying' when no recent invoice (Stripe filters old ones)", async () => {
      // Stripe's createdSince filter would exclude old invoices, so mock returns empty
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("not_paying");
    });

    it("returns 'not_paying' for old subscription with no paid invoices", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 2)
      );
      expect(result).toBe("not_paying");
    });
  });

  describe("enterprise subscriptions", () => {
    it("returns 'paying' for enterprise subscriptions without checking invoices", async () => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(true);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - MONTH_SECONDS * 6)
      );
      expect(result).toBe("paying");
      expect(getSubscriptionInvoices).not.toHaveBeenCalled();
    });
  });

  describe("yearly subscriptions", () => {
    beforeEach(() => {
      vi.mocked(isEnterpriseSubscription).mockReturnValue(false);
    });

    it("returns 'paying' for yearly subscription with payment 6 months ago", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - MONTH_SECONDS * 6),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - YEAR_SECONDS, "active", "year")
      );
      expect(result).toBe("paying");
    });

    it("returns 'paying' for yearly subscription with payment 12 months ago", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([
        makeInvoice(NOW - YEAR_SECONDS),
      ]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - YEAR_SECONDS, "active", "year")
      );
      expect(result).toBe("paying");
    });

    it("uses ~13 month lookback for yearly subscriptions", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - YEAR_SECONDS, "active", "year")
      );
      expect(getSubscriptionInvoices).toHaveBeenCalledWith({
        subscriptionId: "sub_123",
        status: "paid",
        createdSinceDate: new Date(
          NOW * 1000 - (YEAR_SECONDS + MONTH_SECONDS) * 1000
        ),
      });
    });

    it("returns 'not_paying' for yearly subscription with no invoices in lookback period", async () => {
      vi.mocked(getSubscriptionInvoices).mockResolvedValue([]);
      const result = await getCustomerPaymentStatus(
        makeSubscription(NOW, NOW - YEAR_SECONDS * 2, "active", "year")
      );
      expect(result).toBe("not_paying");
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_COUNT_CUTOFF_DAYS = 5;

describe("countEligibleUsersForFreeCredits", () => {
  let getMembersCountSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    getMembersCountSpy = vi
      .spyOn(MembershipResource, "getMembersCountForWorkspace")
      .mockResolvedValue(42);
  });

  afterEach(() => {
    vi.useRealTimers();
    getMembersCountSpy.mockRestore();
  });

  it("counts members for subscription started 30 days ago", async () => {
    const result = await countEligibleUsersForFreeCredits(makeWorkspace());
    expect(result).toBe(42);
    expect(getMembersCountSpy).toHaveBeenCalledWith({
      workspace: expect.objectContaining({ sId: "ws_123" }),
      activeOnly: true,
      membershipSpan: {
        fromDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
        toDate: new Date(NOW_MS - USER_COUNT_CUTOFF_DAYS * DAY_MS),
      },
    });
  });
});

describe("calculateFreeCreditAmountMicroUsd", () => {
  it("should return $5 per user for first 10 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(1)).toBe(5_000_000);
    expect(calculateFreeCreditAmountMicroUsd(5)).toBe(25_000_000);
  });

  it("should return $50 for exactly 10 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(10)).toBe(50_000_000);
  });

  it("should apply $2 per user for users 11-50", () => {
    expect(calculateFreeCreditAmountMicroUsd(11)).toBe(50_000_000 + 2_000_000);
    expect(calculateFreeCreditAmountMicroUsd(20)).toBe(50_000_000 + 20_000_000);
  });

  it("should return $130 for exactly 50 users (50 + 80)", () => {
    expect(calculateFreeCreditAmountMicroUsd(50)).toBe(50_000_000 + 80_000_000);
  });

  it("should apply $1 per user for users 51-100", () => {
    expect(calculateFreeCreditAmountMicroUsd(51)).toBe(
      50_000_000 + 80_000_000 + 1_000_000
    );
    expect(calculateFreeCreditAmountMicroUsd(75)).toBe(
      50_000_000 + 80_000_000 + 25_000_000
    );
  });

  it("should return $180 for exactly 100 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(100)).toBe(
      50_000_000 + 80_000_000 + 50_000_000
    );
  });

  it("should cap at 100 users (ignore users beyond 100)", () => {
    expect(calculateFreeCreditAmountMicroUsd(150)).toBe(
      50_000_000 + 80_000_000 + 50_000_000
    );
    expect(calculateFreeCreditAmountMicroUsd(1000)).toBe(
      50_000_000 + 80_000_000 + 50_000_000
    );
  });

  it("should return 0 for 0 users", () => {
    expect(calculateFreeCreditAmountMicroUsd(0)).toBe(0);
  });
});
